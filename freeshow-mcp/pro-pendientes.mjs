// The duplicate pairs the planner refused to decide: same title, similar
// lyrics, but very different sizes — usually a medley versus the plain song.
// Prints both sides so the difference can be judged.

import fs from "fs"
import path from "path"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides, groupDuplicates } from "./src/proMigrate.js"
import { correctTitle } from "./src/proSpelling.js"
import { CORRECCIONES } from "./pro-correcciones.js"

const dir = "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"

const entries = []
for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".pro")).sort()) {
    if (CORRECCIONES[f]) continue
    const parsed = parseProFile(fs.readFileSync(path.join(dir, f)))
    if (!parsed.slides.length) continue
    const fromName = parseFileName(f)
    const metaStep = extractMetaSlides(parsed.slides)
    const cleanStep = cleanSlides(metaStep.slides)
    if (!cleanStep.slides.length) continue
    entries.push({
        file: f,
        title: correctTitle(metaStep.meta.title || fromName.title),
        artist: metaStep.meta.artist || fromName.artist,
        slides: cleanStep.slides
    })
}

const pendientes = groupDuplicates(entries).filter((g) => g.review)

console.log(`${pendientes.length} pares esperando decisión\n`)

pendientes.forEach((g, i) => {
    const todos = [g.keep, ...g.drop]
    console.log(`${"=".repeat(70)}`)
    console.log(`${i + 1}. ${g.keep.title}${g.keep.artist ? ` — ${g.keep.artist}` : ""}`)
    console.log(`${"=".repeat(70)}`)
    for (const e of todos) {
        console.log(`\n  ARCHIVO: ${e.file}  (${e.slides.length} slides)`)
        e.slides.slice(0, 10).forEach((s, j) => console.log(`    [${j + 1}] ${s.lines.join(" / ")}`))
        if (e.slides.length > 10) console.log(`    … y ${e.slides.length - 10} slides más`)
    }
    console.log()
})
