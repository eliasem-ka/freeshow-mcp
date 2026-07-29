// For each held-back pair, check whether the larger file actually contains
// everything the smaller one has. If it does, dropping the smaller loses
// nothing and the pair is a safe merge after all.

import fs from "fs"
import path from "path"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides, groupDuplicates, normalizeKey } from "./src/proMigrate.js"
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

// compare on words, not slides: the two files split lines differently, so a
// slide-by-slide comparison would report differences that are only formatting
const palabras = (e) => new Set(normalizeKey(e.slides.flatMap((s) => s.lines).join(" ")).split(" ").filter(Boolean))

console.log(`${pendientes.length} pares\n`)
let seguros = 0

for (const g of pendientes) {
    const grande = g.keep
    for (const chica of g.drop) {
        const wG = palabras(grande)
        const wC = palabras(chica)
        const faltan = [...wC].filter((w) => !wG.has(w))
        const cubre = ((wC.size - faltan.length) / wC.size) * 100

        const ok = faltan.length === 0
        if (ok) seguros++
        console.log(`${ok ? "OK  " : "OJO "} ${grande.title}`)
        console.log(`      grande: ${grande.file} (${grande.slides.length} slides)`)
        console.log(`      chica : ${chica.file} (${chica.slides.length} slides)`)
        console.log(`      la grande cubre ${cubre.toFixed(1)}% del vocabulario de la chica`)
        if (faltan.length) console.log(`      palabras solo en la chica: ${JSON.stringify(faltan.slice(0, 12))}`)
        console.log()
    }
}

console.log(`pares donde la grande contiene todo: ${seguros} de ${pendientes.length}`)
