// Rebuild every blanked show by writing its .show file directly.
//
// FreeShow MUST be closed: if it is running, its own save writes whatever is in
// showsCache over these files.
//
// Shows the user had before the migration are skipped — they have no source to
// rebuild from, so that call is theirs.
//
// Usage: node reparar-vacios.mjs [--apply]

import fs from "fs"
import path from "path"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides, normalizeKey } from "./src/proMigrate.js"
import { correctSlides, correctTitle } from "./src/proSpelling.js"
import { buildShow, writeShow } from "./src/escribirShow.js"

const showsDir = "C:/Users/CCCR/Documents/FreeShow/Shows"
const proDir = "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const apply = process.argv.includes("--apply")

const OVERLAY = "d9b06f8ff33"
const SET_LOOK = {
    lineStyle: "concierto",
    textColor: "#151515",
    reveal: { motion: "rise", stepMs: 160, durationMs: 350 },
    overlayId: OVERLAY,
    textBox: { left: 200, top: 720, width: 1520, height: 220 },
    itemStyle: "transform: rotate(-1.2deg);"
}

// songs on this Sunday's list get the concert look; the rest match the library
const DEL_SET = {
    "Glorioso día": { pro: "Glorioso día (Passion).pro", meta: { title: "Glorioso día", artist: "Passion", key: "D" } },
    "En tu luz": { pro: "En tu luz.pro", meta: { title: "En tu luz", artist: "En Espíritu y En Verdad", key: "D" } },
    "Bendito Jesús": { pro: "Bendito Jesús (Danilo Montero).pro", meta: { title: "Bendito Jesús", artist: "Danilo Montero", key: "B" } },
    "Hermoso nombre (Medley)": { pro: "Hermoso nombre _ Eres digno de adorar _ Te exaltamos.pro", meta: { title: "Hermoso nombre (Medley)", key: "Bb" } }
}

/// index ProPresenter by normalised title, to find sources for the rest ///
const proPorTitulo = new Map()
for (const f of fs.readdirSync(proDir).filter((x) => x.toLowerCase().endsWith(".pro"))) {
    const { title } = parseFileName(f)
    const key = normalizeKey(correctTitle(title))
    if (!proPorTitulo.has(key)) proPorTitulo.set(key, [])
    proPorTitulo.get(key).push(f)
}

function leerPro(file) {
    const parsed = parseProFile(fs.readFileSync(path.join(proDir, file)))
    const meta = extractMetaSlides(parsed.slides)
    const clean = cleanSlides(meta.slides)
    return { slides: correctSlides(clean.slides).slides, meta: meta.meta }
}

/// find the blanked shows ///
const vacios = []
for (const f of fs.readdirSync(showsDir).filter((x) => x.toLowerCase().endsWith(".show"))) {
    try {
        const [id, show] = JSON.parse(fs.readFileSync(path.join(showsDir, f), "utf8"))
        if (Object.keys(show.slides || {}).length > 0) continue
        vacios.push({ file: f, id, name: show.name || f.replace(/\.show$/, ""), meta: show.meta || {} })
    } catch {
        /* ignore */
    }
}

const propios = vacios.filter((v) => /^(sec|show)-/.test(v.id))
const mios = vacios.filter((v) => !/^(sec|show)-/.test(v.id))

console.log(`shows vacíos      : ${vacios.length}`)
console.log(`tuyos (se omiten) : ${propios.length}`)
console.log(`reconstruibles    : ${mios.length}\n`)

const plan = []
const sinFuente = []

for (const v of mios) {
    const delSet = DEL_SET[v.name]
    if (delSet) {
        plan.push({ ...v, pro: delSet.pro, meta: delSet.meta, look: SET_LOOK })
        continue
    }
    // strip the copy markers the migration added when a name was taken
    const limpio = v.name.replace(/\s*\(\d+\)\s*$/, "").replace(/\s+\d+$/, "").trim()
    const candidatos = proPorTitulo.get(normalizeKey(limpio)) || proPorTitulo.get(normalizeKey(v.name)) || []
    if (!candidatos.length) {
        sinFuente.push(v)
        continue
    }
    plan.push({ ...v, pro: candidatos[0], meta: v.meta, look: {} })
}

console.log("a reconstruir:")
for (const p of plan) {
    const { slides } = leerPro(p.pro)
    p.slides = slides
    console.log(`  ${p.look.reveal ? "[SET] " : "      "}${p.name}  ←  ${p.pro}  (${slides.length} slides)`)
}
if (sinFuente.length) {
    console.log(`\nsin fuente en ProPresenter (${sinFuente.length}):`)
    sinFuente.forEach((v) => console.log(`  ${v.name}`))
}
if (propios.length) {
    console.log(`\ntuyos, sin fuente para reconstruir (${propios.length}):`)
    propios.forEach((v) => console.log(`  ${v.name}`))
}

if (!apply) {
    console.log(`\n[prueba en seco] nada escrito. Correr con --apply (con FreeShow CERRADO)`)
    process.exit(0)
}

let escritos = 0
for (const p of plan) {
    if (!p.slides?.length) continue
    // keep the original id so FreeShow's index still points at this show
    const [, show] = buildShow({ id: p.id, name: p.name, slides: p.slides, meta: p.meta, ...p.look })
    writeShow(showsDir, p.id, show)
    escritos++
}
console.log(`\nescritos: ${escritos}`)

console.log("\nverificación:")
let ok = 0
let mal = 0
for (const p of plan) {
    const [, show] = JSON.parse(fs.readFileSync(path.join(showsDir, `${p.name}.show`), "utf8"))
    const n = Object.keys(show.slides || {}).length
    if (n > 0) ok++
    else {
        mal++
        console.log(`  VACÍA todavía: ${p.name}`)
    }
}
console.log(`  con slides: ${ok} · vacías: ${mal}`)
