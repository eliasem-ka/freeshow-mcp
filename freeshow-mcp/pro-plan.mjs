// Migration plan: metadata extracted, filler slides dropped, duplicates
// grouped. Writes nothing to FreeShow.
//
// Usage: node pro-plan.mjs "<carpeta>" [salida.md]

import fs from "fs"
import path from "path"
import { parseProFile } from "./src/proImport.js"
import { parseFileName, extractMetaSlides, cleanSlides, groupDuplicates, isAllCaps, normalizeArtist } from "./src/proMigrate.js"

const dir = process.argv[2] || "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const outFile = process.argv[3] || "pro-plan-reporte.md"

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pro")).sort()

const entries = []
const sinTexto = []
let slidesQuitadas = 0
const razonesQuitadas = new Map()

for (const f of files) {
    const parsed = parseProFile(fs.readFileSync(path.join(dir, f)))
    if (!parsed.slides.length) {
        sinTexto.push(f)
        continue
    }

    const fromName = parseFileName(f)
    const metaStep = extractMetaSlides(parsed.slides)
    const cleanStep = cleanSlides(metaStep.slides)

    for (const d of [...metaStep.dropped, ...cleanStep.dropped]) {
        slidesQuitadas++
        razonesQuitadas.set(d.reason, (razonesQuitadas.get(d.reason) || 0) + 1)
    }

    if (!cleanStep.slides.length) {
        sinTexto.push(f)
        continue
    }

    // slide labels win over the file name; the name fills the gaps
    const title = metaStep.meta.title || fromName.title
    const artist = metaStep.meta.artist || fromName.artist
    const author = metaStep.meta.author || ""

    entries.push({
        id: f,
        file: f,
        title,
        artist,
        author,
        slides: cleanStep.slides,
        quitadas: metaStep.dropped.length + cleanStep.dropped.length,
        origenTitulo: metaStep.meta.title ? "slide" : "nombre",
        origenArtista: metaStep.meta.artist ? "slide" : fromName.artist ? "nombre" : "—"
    })
}

const groups = groupDuplicates(entries)
const conservados = groups.map((g) => g.keep)
const descartados = groups.flatMap((g) => g.drop.map((d) => ({ ...d, porque: g.keep.file })))
const conDuplicados = groups.filter((g) => g.drop.length && !g.review)
const paraRevisar = groups.filter((g) => g.review)
const conHerencia = groups.filter((g) => g.heredado?.length)

// same title, different artist -> kept on purpose
const variantes = new Map()
for (const e of conservados) {
    const k = e.title.toLowerCase().trim()
    if (!variantes.has(k)) variantes.set(k, [])
    variantes.get(k).push(e)
}
const variantesReales = [...variantes.entries()].filter(([, v]) => v.length > 1)

const totalSlides = conservados.reduce((n, e) => n + e.slides.length, 0)
const sinArtista = conservados.filter((e) => !e.artist)
const mayusculas = conservados.filter((e) => e.slides.some((s) => s.lines.some((l) => isAllCaps(l))))

const L = []
L.push(`# Plan de migración filtrada — ProPresenter → FreeShow\n`)
L.push(`Carpeta: \`${dir}\`\n`)
L.push(`> Nada fue escrito en FreeShow.\n`)

L.push(`## Resumen\n`)
L.push(`| | |`)
L.push(`|---|---|`)
L.push(`| Archivos .pro | ${files.length} |`)
L.push(`| Sin texto (se omiten) | ${sinTexto.length} |`)
L.push(`| Canciones tras filtrar | ${entries.length} |`)
L.push(`| **Se crearían** | **${conservados.length}** |`)
L.push(`| Descartadas por duplicado | ${descartados.length} |`)
L.push(`| Slides a crear | ${totalSlides} |`)
L.push(`| Slides quitadas (etiquetas/vacías) | ${slidesQuitadas} |`)
L.push(`| Con artista identificado | ${conservados.length - sinArtista.length} de ${conservados.length} |`)
L.push(`| Variantes conservadas (mismo título, distinto artista) | ${variantesReales.length} |`)
L.push(`| Con líneas EN MAYÚSCULAS | ${mayusculas.length} |`)
L.push("")

L.push(`### Motivos de slides quitadas\n`)
for (const [r, n] of razonesQuitadas) L.push(`- ${r}: ${n}`)
L.push("")

L.push(`## ⚠️ Necesitan tu decisión (${paraRevisar.length})\n`)
L.push(`Mismo título y letra parecida, pero con tamaños muy distintos. Suele ser un popurrí frente a la canción suelta: **no las fusionaría sin que las mires**.\n`)
if (!paraRevisar.length) L.push(`_Ninguna._\n`)
for (const g of paraRevisar) {
    L.push(`- **${g.keep.title}**${g.keep.artist ? ` — ${g.keep.artist}` : ""}`)
    L.push(`  - se conservaría \`${g.keep.file}\` (${g.keep.slides.length} slides)`)
    for (const d of g.drop) L.push(`  - se descartaría \`${d.file}\` (${d.slides.length} slides)`)
}
L.push("")

L.push(`## Duplicados claros a descartar (${conDuplicados.length})\n`)
L.push(`Mismo título, mismo artista y tamaño parecido.\n`)
if (!conDuplicados.length) L.push(`_Ninguno._\n`)
for (const g of conDuplicados) {
    L.push(`- **${g.keep.title}**${g.keep.artist ? ` — ${g.keep.artist}` : ""} → se conserva \`${g.keep.file}\` (${g.keep.slides.length} slides)`)
    for (const d of g.drop) L.push(`  - se descarta \`${d.file}\` (${d.slides.length} slides)`)
}
L.push("")

if (conHerencia.length) {
    L.push(`## Metadata heredada de la copia descartada (${conHerencia.length})\n`)
    L.push(`La versión conservada no traía artista, así que lo tomé de la copia que sí lo tenía.\n`)
    for (const g of conHerencia) L.push(`- **${g.keep.title}** → ${g.heredado.join(", ")}`)
    L.push("")
}

L.push(`## Variantes conservadas — mismo título, distinto artista (${variantesReales.length})\n`)
if (!variantesReales.length) L.push(`_Ninguna._\n`)
for (const [t, v] of variantesReales) {
    L.push(`- **${t}**: ${v.map((e) => `${e.artist || "(sin artista)"} [${e.slides.length} slides]`).join(" · ")}`)
}
L.push("")

L.push(`## Sin artista identificado (${sinArtista.length})\n`)
L.push(`Se migrarían con el título solamente.\n`)
for (const e of sinArtista.slice(0, 60)) L.push(`- ${e.title} — \`${e.file}\``)
if (sinArtista.length > 60) L.push(`- … y ${sinArtista.length - 60} más`)
L.push("")

L.push(`## Con líneas en MAYÚSCULAS (${mayusculas.length})\n`)
L.push(`Candidatas a revisión manual de tipografía.\n`)
for (const e of mayusculas.slice(0, 40)) L.push(`- ${e.title}${e.artist ? ` — ${e.artist}` : ""}`)
if (mayusculas.length > 40) L.push(`- … y ${mayusculas.length - 40} más`)
L.push("")

L.push(`## Sin texto — se omiten (${sinTexto.length})\n`)
for (const f of sinTexto) L.push(`- \`${f}\``)
L.push("")

L.push(`## Detalle de lo que se crearía (${conservados.length})\n`)
for (const e of [...conservados].sort((a, b) => a.title.localeCompare(b.title, "es"))) {
    L.push(`### ${e.title}`)
    const meta = [`título: ${e.origenTitulo}`, `artista: ${e.origenArtista}`]
    L.push(`\`${e.file}\` — ${e.slides.length} slides · ${e.quitadas} quitadas · ${meta.join(" · ")}`)
    L.push(`- **Title=** ${e.title}`)
    if (e.artist) L.push(`- **Artist=** ${e.artist}`)
    if (e.author) L.push(`- **Author=** ${e.author}`)
    L.push("")
    L.push("```")
    e.slides.forEach((s, i) => L.push(`[${i + 1}] ${s.lines.join(" / ")}`))
    L.push("```\n")
}

fs.writeFileSync(outFile, L.join("\n"), "utf8")

console.log(`archivos .pro              : ${files.length}`)
console.log(`sin texto (omitidos)       : ${sinTexto.length}`)
console.log(`se crearían                : ${conservados.length}`)
console.log(`descartados por duplicado  : ${descartados.length}`)
console.log(`variantes conservadas      : ${variantesReales.length}`)
console.log(`slides a crear             : ${totalSlides}`)
console.log(`slides quitadas            : ${slidesQuitadas}  (${[...razonesQuitadas].map(([r, n]) => `${r}:${n}`).join(", ")})`)
console.log(`con artista                : ${conservados.length - sinArtista.length}`)
console.log(`con MAYÚSCULAS             : ${mayusculas.length}`)
console.log(`\nreporte -> ${path.resolve(outFile)}`)
void normalizeArtist
