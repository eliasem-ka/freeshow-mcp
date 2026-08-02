// Build a Sunday set from songs the church already owns.
//
// Lyrics are never fetched from anywhere: each song is read from its existing
// FreeShow show, or from the ProPresenter file it was migrated from.
//
// Each song is rebuilt with the concert look (word-by-word reveal, two line
// sizes) and its musical key recorded, then all of them are placed in a
// project in the order of the setlist.
//
// Usage: node armar-set.mjs [--apply]
//
// NOTE: no forced save here. Persisting through FreeShow's save wrote a
// degraded showsCache over good files and blanked hundreds of shows twice.
// Close FreeShow to let it save, or write .show files directly with
// src/escribirShow.js.

import fs from "fs"
import path from "path"
import { callAction } from "./src/freeshow.js"
import { parseProFile } from "./src/proImport.js"
import { extractMetaSlides, cleanSlides } from "./src/proMigrate.js"
import { correctSlides } from "./src/proSpelling.js"

const showsDir = "C:/Users/CCCR/Documents/FreeShow/Shows"
const proDir = "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const apply = process.argv.includes("--apply")

const PROYECTO = "Lista Domingo 02/08"

// setlist as given, each pointing at a source already in the church's library
const SET = [
    { titulo: "Ven descansa", artista: "UPPERROOM", tono: "B", showId: "bc8e4548d26" },
    { titulo: "Glorioso día", artista: "Passion", tono: "D", showId: "3d18bb3207b" },
    { titulo: "En tu luz", artista: "En Espíritu y En Verdad", tono: "D", showId: "a0722cfc1f2" },
    { titulo: "Bendito Jesús", artista: "Danilo Montero", tono: "B", showId: "fdb686e4cfa" },
    // the setlist says "Medley": ProPresenter has the three-song version, which
    // was never migrated, so it is read straight from the source file
    { titulo: "Hermoso nombre (Medley)", artista: "", tono: "Bb", pro: "Hermoso nombre _ Eres digno de adorar _ Te exaltamos.pro" }
]

/// SOURCES ///

function slidesFromShowFile(showId) {
    for (const f of fs.readdirSync(showsDir).filter((x) => x.toLowerCase().endsWith(".show"))) {
        let id
        let show
        try {
            ;[id, show] = JSON.parse(fs.readFileSync(path.join(showsDir, f), "utf8"))
        } catch {
            continue
        }
        if (id !== showId) continue

        const layout = Object.values(show.layouts || {})[0]
        const order = layout?.slides?.map((l) => l.id) || Object.keys(show.slides || {})
        const slides = []
        for (const sid of order) {
            const slide = show.slides?.[sid]
            if (!slide) continue
            const lines = []
            for (const item of slide.items || []) {
                for (const line of item.lines || []) {
                    const v = (line.text || []).map((t) => t.value).join("").trim()
                    if (v) lines.push(v)
                }
            }
            if (lines.length) slides.push({ lines })
        }
        return { slides, name: show.name, file: f, meta: show.meta || {} }
    }
    return null
}

function slidesFromPro(file) {
    const parsed = parseProFile(fs.readFileSync(path.join(proDir, file)))
    const meta = extractMetaSlides(parsed.slides)
    const clean = cleanSlides(meta.slides)
    return { slides: clean.slides, name: file.replace(/\.pro$/i, ""), file, meta: meta.meta }
}

/// PLAN ///

const plan = []
for (const s of SET) {
    const src = s.showId ? slidesFromShowFile(s.showId) : slidesFromPro(s.pro)
    if (!src || !src.slides.length) {
        console.log(`!! sin fuente para "${s.titulo}"`)
        continue
    }
    const fix = correctSlides(src.slides)
    plan.push({ ...s, origen: src.file, slides: fix.slides, correcciones: fix.changes.length, showIdViejo: s.showId })
}

console.log(`\n=== SET: ${PROYECTO} ===\n`)
for (const [i, p] of plan.entries()) {
    console.log(`${i + 1}. ${p.titulo}${p.artista ? ` — ${p.artista}` : ""}  ·  tono ${p.tono}  ·  ${p.slides.length} slides`)
    console.log(`   fuente: ${p.origen}${p.correcciones ? `  (${p.correcciones} correcciones)` : ""}`)
    console.log(`   primera: ${p.slides[0].lines.join(" / ").slice(0, 70)}`)
}

if (!apply) {
    console.log(`\n[prueba en seco] nada creado. Correr con --apply`)
    process.exit(0)
}

/// BUILD ///

console.log(`\ncreando…`)

// One band overlay shared by the whole set, so the look is consistent
const banda = (await callAction("create_lyric_template", {
    name: "Set 02-08",
    placement: "lower_third",
    roughness: 0.55,
    rotate: -1.2
}))?.data
if (!banda?.overlayId) {
    console.log("!! no se pudo crear la banda:", JSON.stringify(banda))
    process.exit(1)
}
console.log(`banda creada (overlay ${banda.overlayId})`)

const proyecto = (await callAction("create_project", { name: PROYECTO }))?.data
const projectId = proyecto?.id || proyecto
console.log(`proyecto: ${JSON.stringify(proyecto)}`)

const creados = []
for (const p of plan) {
    // replace the plain library copy so the set does not duplicate it
    if (p.showIdViejo) await callAction("delete_shows", { ids: [p.showIdViejo], confirm: true })

    const meta = { title: p.titulo, key: p.tono }
    if (p.artista) meta.artist = p.artista

    const res = (await callAction("create_animated_song", {
        name: p.titulo,
        meta,
        slides: p.slides,
        overlayId: banda.overlayId,
        templateId: banda.templateId || undefined,
        textBox: banda.text,
        itemStyle: "transform: rotate(-1.2deg);",
        animation: {
            preset: "suave",
            autoAdvance: false,
            reveal: "word",
            revealMotion: "rise",
            revealSeconds: 0.16,
            lineStyle: "concierto",
            textColor: banda.suggestedTextColor
        }
    }))?.data

    if (!res?.id) {
        console.log(`  !! falló "${p.titulo}": ${JSON.stringify(res).slice(0, 140)}`)
        continue
    }
    console.log(`  ✓ ${p.titulo}  (${p.slides.length} slides, tono ${p.tono}, id ${res.id})`)
    creados.push({ ...p, id: res.id })

    if (projectId) await callAction("add_to_project", { projectId, id: res.id })
}

console.log(`set armado: ${creados.length} de ${plan.length}`)
