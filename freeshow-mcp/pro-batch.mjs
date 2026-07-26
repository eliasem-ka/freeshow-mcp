// Prepare one batch for review: prints the exact lyrics that would be created.
// Usage: node pro-batch.mjs [cuántas] [saltar]

import fs from "fs"
import path from "path"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides, groupDuplicates } from "./src/proMigrate.js"

const dir = "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const cuantas = Number(process.argv[2] || 12)
const saltar = Number(process.argv[3] || 0)

const entries = []
for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".pro")).sort()) {
    const parsed = parseProFile(fs.readFileSync(path.join(dir, f)))
    if (!parsed.slides.length) continue

    const fromName = parseFileName(f)
    const metaStep = extractMetaSlides(parsed.slides)
    const cleanStep = cleanSlides(metaStep.slides)
    if (!cleanStep.slides.length) continue

    entries.push({
        id: f,
        file: f,
        title: metaStep.meta.title || fromName.title,
        artist: metaStep.meta.artist || fromName.artist,
        author: metaStep.meta.author || "",
        slides: cleanStep.slides
    })
}

const groups = groupDuplicates(entries)

// a clean batch: no pending decision, artist known, sane length
const candidatos = groups
    .filter((g) => !g.review && g.keep.artist && g.keep.slides.length >= 6 && g.keep.slides.length <= 30)
    .map((g) => g.keep)
    .sort((a, b) => a.title.localeCompare(b.title, "es"))

const lote = candidatos.slice(saltar, saltar + cuantas)

console.log(`candidatos limpios: ${candidatos.length} — mostrando ${lote.length} (desde ${saltar})\n`)
for (const e of lote) {
    console.log(`=== ${e.title} — ${e.artist}`)
    console.log(`    archivo: ${e.file} | ${e.slides.length} slides`)
    e.slides.forEach((s, i) => console.log(`  [${i + 1}] ${s.lines.join(" | ")}`))
    console.log()
}

fs.writeFileSync("pro-batch.json", JSON.stringify(lote, null, 2), "utf8")
console.log(`lote guardado en pro-batch.json (${lote.length} canciones)`)
