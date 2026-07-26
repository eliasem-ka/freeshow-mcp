// Migrate a reviewed batch into FreeShow.
//
// Only files listed in pro-correcciones.js are migrated: the corrections are
// the review record, so anything not reviewed is not created.
//
// Usage: node pro-migrar.mjs [--dry]

import fs from "fs"
import path from "path"
import { callAction } from "./src/freeshow.js"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides } from "./src/proMigrate.js"
import { CORRECCIONES } from "./pro-correcciones.js"

const dir = "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const dry = process.argv.includes("--dry")

// what is already in FreeShow, so a re-run does not duplicate shows
// (a dry run stays offline: it should work with the app closed)
const existentes = new Set()
if (!dry) {
    const shownRaw = await callAction("get_shows")
    const shownData = shownRaw?.data ?? shownRaw
    for (const s of Array.isArray(shownData) ? shownData : Object.values(shownData || {})) {
        existentes.add((s?.name || "").toLowerCase().trim())
    }
}

let creadas = 0
let saltadas = 0
const problemas = []

for (const [file, fix] of Object.entries(CORRECCIONES)) {
    const full = path.join(dir, file)
    if (!fs.existsSync(full)) {
        problemas.push(`${file}: no existe`)
        continue
    }

    const parsed = parseProFile(fs.readFileSync(full))
    const metaStep = extractMetaSlides(parsed.slides)
    const cleanStep = cleanSlides(metaStep.slides)
    const fromName = parseFileName(file)

    const original = cleanStep.slides

    // A mismatch means the corrections were written against a different read of
    // the file — creating that would silently misalign the lyrics.
    if (fix.lines && fix.lines.length !== original.length) {
        problemas.push(`${file}: ${fix.lines.length} líneas corregidas vs ${original.length} slides originales — NO se migra`)
        continue
    }

    const title = fix.title || metaStep.meta.title || fromName.title
    const artist = fix.artist || metaStep.meta.artist || fromName.artist

    // Two different songs can share a title ("¿A quién iré?" by Marcos Witt and
    // by Julio Melgar). Checking the title alone silently skipped the second
    // one — exactly the variant the migration is supposed to keep — so the
    // artist goes into the name whenever it would otherwise collide.
    let nombre = title
    if (existentes.has(nombre.toLowerCase().trim())) {
        if (!artist) {
            console.log(`· ya existe y no hay artista para distinguirla, se salta: ${title}`)
            saltadas++
            continue
        }
        nombre = `${title} (${artist})`
        if (existentes.has(nombre.toLowerCase().trim())) {
            console.log(`· ya existe, se salta: ${nombre}`)
            saltadas++
            continue
        }
        console.log(`· título repetido, se crea como: ${nombre}`)
    }

    const slides = (fix.lines || original.map((s) => s.lines.join("\n"))).map((texto) => ({ lines: texto.split("\n") }))

    if (dry) {
        console.log(`\n=== ${title}${artist ? ` — ${artist}` : ""} (${slides.length} slides)`)
        slides.forEach((s, i) => console.log(`  [${i + 1}] ${s.lines.join(" | ")}`))
        creadas++
        continue
    }

    const meta = { title }
    if (artist) meta.artist = artist

    const res = await callAction("create_animated_song", {
        name: nombre,
        meta,
        slides,
        animation: { preset: "suave", autoAdvance: false }
    })
    const info = res?.data ?? res
    if (!info?.id) {
        problemas.push(`${file}: FreeShow no devolvió id (${JSON.stringify(info)})`)
        continue
    }

    console.log(`✓ ${nombre}${artist ? ` — ${artist}` : ""}  (${slides.length} slides, id ${info.id})`)
    creadas++
    existentes.add(nombre.toLowerCase().trim())
}

// New shows only live in memory until FreeShow saves, and autosave is every
// 15 minutes by default — without this an interrupted run loses everything.
if (!dry && creadas) {
    const saved = await callAction("save_data")
    const info = saved?.data ?? saved
    console.log(`\nguardado en disco: ${info?.ok ? `${info.saved} shows` : JSON.stringify(info)}`)
}

console.log(`\n${dry ? "[prueba en seco] " : ""}creadas: ${creadas} · saltadas por existir: ${saltadas} · problemas: ${problemas.length}`)
for (const p of problemas) console.log(`  ! ${p}`)
