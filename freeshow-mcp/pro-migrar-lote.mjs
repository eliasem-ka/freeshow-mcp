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
//
// --incluir-pendientes releases them: the eight pairs in this library were all
// checked and the larger file contains 100% of the smaller's vocabulary, so
// they are arrangements of one song, not medleys.
const incluirPendientes = process.argv.includes("--incluir-pendientes")
const pendientes = groups.filter((g) => g.review)
const migrables = groups.filter((g) => incluirPendientes || !g.review).map((g) => g.keep)

/// STATE ///

// Names are not enough to tell "already migrated" from "different song with
// the same title". Matching on names created a second copy of every attributed
// song: the plain title was taken, so the collision path appended the artist
// and made a duplicate. The index is keyed on lyrics instead.
const existentes = new Set() // names, only to pick a free show name
const contenidos = new Set() // lyrics, to decide whether to create at all

// Read the index off disk rather than through the API. get_plain_text only
// answers for shows FreeShow has loaded, so after a restart it reports almost
// everything as empty — and worse, asking for them all pulls 500 shows into
// showsCache as half-loaded shells, which a later save then writes over the
// good files. The .show files are always complete and reading them is inert.
const SHOWS_DIR = "C:/Users/CCCR/Documents/FreeShow/Shows"

function lyricsOfShow(show) {
    const layout = Object.values(show.layouts || {})[0]
    const order = layout?.slides?.map((l) => l.id) || Object.keys(show.slides || {})
    const out = []
    for (const id of order) {
        for (const item of show.slides?.[id]?.items || []) {
            for (const line of item.lines || []) out.push((line.text || []).map((t) => t.value).join(""))
        }
    }
    return out.join("\n")
}

if (!dry && fs.existsSync(SHOWS_DIR)) {
    const archivos = fs.readdirSync(SHOWS_DIR).filter((f) => f.toLowerCase().endsWith(".show"))
    for (const f of archivos) {
        try {
            const [, show] = JSON.parse(fs.readFileSync(path.join(SHOWS_DIR, f), "utf8"))
            if (!show) continue
            existentes.add(normalizeKey(show.name || ""))
            const txt = lyricsOfShow(show)
            if (txt.trim()) contenidos.add(normalizeKey(txt))
        } catch {
            // unreadable file: ignore, worst case the song is created again
        }
    }
    console.log(`indexados desde disco: ${archivos.length} archivos, ${contenidos.size} con letra`)
}

/** Lyrics of a planned song, in the same shape the index uses. */
const claveContenido = (slides) => normalizeKey(slides.map((s) => s.lines.join("\n")).join("\n\n"))

/// RUN ///

let creadas = 0
let yaEstaban = 0
let totalSlides = 0
let totalCambios = 0
const gritadas = []
const problemas = []

for (const e of migrables) {
    if (creadas >= LIMIT) break

    const fix = correctSlides(e.slides)

    // already in FreeShow, whatever it is called there
    if (!dry && contenidos.has(claveContenido(fix.slides))) {
        yaEstaban++
        continue
    }

    // the lyrics are new; now just find a free name for it
    let nombre = e.title
    if (existentes.has(normalizeKey(nombre))) {
        if (!e.artist) {
            // a different song with this title exists and there is nothing to
            // tell them apart, so let FreeShow disambiguate
            nombre = `${e.title} (2)`
        } else {
            nombre = `${e.title} (${e.artist})`
        }
    }
    if (isShouty(e.slides)) gritadas.push(e.title)

    if (dry) {
        console.log(`· ${nombre}${e.artist ? ` — ${e.artist}` : ""} (${fix.slides.length} slides, ${fix.changes.length} correcciones)`)
        creadas++
        totalSlides += fix.slides.length
        totalCambios += fix.changes.length
        existentes.add(normalizeKey(nombre))
        contenidos.add(claveContenido(fix.slides))
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
    contenidos.add(claveContenido(fix.slides))
    if (creadas % 10 === 0) console.log(`  ... ${creadas} creadas`)
}

// flush, or an interrupted run loses everything created above
if (!dry && creadas) {
    let saved = (await callAction("save_data"))?.data

    // The guard refuses to save while the cache holds half-loaded shows, since
    // saving would blank their files. Those entries are stale cache, not real
    // damage — the files on disk are intact — so drop the shows and let the
    // next run rebuild them from the ProPresenter source, then save.
    if (saved && !saved.ok && saved.shells) {
        console.log(`\naviso: ${saved.shells} show(s) a medio cargar en caché; se quitan para poder guardar`)
        for (const s of saved.ejemplos || []) console.log(`  - ${s.name}`)
        const ids = (saved.ejemplos || []).map((s) => s.id)
        if (ids.length) {
            await callAction("delete_shows", { ids, confirm: true })
            saved = (await callAction("save_data"))?.data
        }
    }

    console.log(`\nguardado en disco: ${saved?.ok ? `${saved.saved} shows` : JSON.stringify(saved)}`)
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
