// Bulk migration in batches, with the safe orthography pass applied.
//
// Usage: node pro-migrar-lote.mjs [--limit N] [--dry]
//
// Re-runnable: anything already in FreeShow is skipped, so it can be called
// repeatedly until the library is done.

import fs from "fs"
import path from "path"
import { callAction } from "./src/freeshow.js"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides, groupDuplicates, normalizeKey } from "./src/proMigrate.js"
import { correctSlides, correctTitle, isShouty } from "./src/proSpelling.js"
import { CORRECCIONES } from "./pro-correcciones.js"

const dir = "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const dry = process.argv.includes("--dry")
const limitArg = process.argv.indexOf("--limit")
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 60

/// PLAN ///

const entries = []
for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".pro")).sort()) {
    // already migrated by hand with reviewed lyrics — re-adding them here would
    // duplicate them under the uncorrected title
    if (CORRECCIONES[f]) continue

    const parsed = parseProFile(fs.readFileSync(path.join(dir, f)))
    if (!parsed.slides.length) continue

    const fromName = parseFileName(f)
    const metaStep = extractMetaSlides(parsed.slides)
    const cleanStep = cleanSlides(metaStep.slides)
    if (!cleanStep.slides.length) continue

    entries.push({
        id: f,
        file: f,
        title: correctTitle(metaStep.meta.title || fromName.title),
        artist: metaStep.meta.artist || fromName.artist,
        author: metaStep.meta.author || "",
        slides: cleanStep.slides
    })
}

const groups = groupDuplicates(entries)

// Songs whose duplicate pair needs a human call are held back entirely — they
// are the ones where merging could destroy a medley.
const pendientes = groups.filter((g) => g.review)
const migrables = groups.filter((g) => !g.review).map((g) => g.keep)

/// STATE ///

// compared accent- and case-insensitively, so "A Ti" does not slip past an
// existing "A ti" and create a near-duplicate
const existentes = new Set()
if (!dry) {
    const raw = await callAction("get_shows")
    const data = raw?.data ?? raw
    for (const s of Array.isArray(data) ? data : Object.values(data || {})) {
        existentes.add(normalizeKey(s?.name || ""))
    }
}

/// RUN ///

let creadas = 0
let yaEstaban = 0
let totalSlides = 0
let totalCambios = 0
const gritadas = []
const problemas = []

for (const e of migrables) {
    if (creadas >= LIMIT) break

    let nombre = e.title
    const colision = existentes.has(normalizeKey(nombre))
    if (colision) {
        if (!e.artist) {
            yaEstaban++
            continue
        }
        nombre = `${e.title} (${e.artist})`
        if (existentes.has(normalizeKey(nombre))) {
            yaEstaban++
            continue
        }
    }

    const fix = correctSlides(e.slides)
    if (isShouty(e.slides)) gritadas.push(e.title)

    if (dry) {
        console.log(`· ${nombre}${e.artist ? ` — ${e.artist}` : ""} (${fix.slides.length} slides, ${fix.changes.length} correcciones)`)
        creadas++
        totalSlides += fix.slides.length
        totalCambios += fix.changes.length
        existentes.add(normalizeKey(nombre))
        continue
    }

    const meta = { title: e.title }
    if (e.artist) meta.artist = e.artist
    if (e.author) meta.author = e.author

    const res = await callAction("create_animated_song", {
        name: nombre,
        meta,
        slides: fix.slides,
        animation: { preset: "suave", autoAdvance: false }
    })
    const info = res?.data ?? res
    if (!info?.id) {
        problemas.push(`${e.file}: sin id (${JSON.stringify(info).slice(0, 120)})`)
        continue
    }

    creadas++
    totalSlides += fix.slides.length
    totalCambios += fix.changes.length
    existentes.add(normalizeKey(nombre))
    if (creadas % 10 === 0) console.log(`  ... ${creadas} creadas`)
}

// flush, or an interrupted run loses everything created above
if (!dry && creadas) {
    const saved = await callAction("save_data")
    const info = saved?.data ?? saved
    console.log(`\nguardado en disco: ${info?.ok ? `${info.saved} shows` : JSON.stringify(info)}`)
}

const restantes = migrables.length - (yaEstaban + creadas)
console.log(`\n${dry ? "[seco] " : ""}creadas ahora : ${creadas}`)
console.log(`ya estaban            : ${yaEstaban}`)
console.log(`slides creadas        : ${totalSlides}`)
console.log(`correcciones aplicadas: ${totalCambios}`)
console.log(`quedan por migrar     : ${Math.max(0, restantes)} de ${migrables.length}`)
console.log(`en espera de decisión  : ${pendientes.length}`)
if (gritadas.length) console.log(`en MAYÚSCULAS (revisar): ${gritadas.length}`)
if (problemas.length) {
    console.log(`problemas: ${problemas.length}`)
    for (const p of problemas.slice(0, 10)) console.log(`  ! ${p}`)
}
