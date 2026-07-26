// Dry run: read every ProPresenter .pro in a folder and report what a migration
// WOULD produce. Writes nothing to FreeShow.
//
// Usage: node pro-dryrun.mjs "<carpeta>" [salida.md]

import fs from "fs"
import path from "path"
import { parseProFile, titleFromFileName, slidesToPlainText } from "./src/proImport.js"

const dir = process.argv[2] || "C:/Users/CCCR/Documents/ProPresenter/Libraries/Default"
const outFile = process.argv[3] || "pro-dryrun-reporte.md"

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pro")).sort()

const ok = []
const sinTexto = []
const errores = []
const sospechosas = []

for (const f of files) {
    let parsed
    try {
        parsed = parseProFile(fs.readFileSync(path.join(dir, f)))
    } catch (e) {
        errores.push({ f, msg: e.message })
        continue
    }

    const title = titleFromFileName(f)
    if (!parsed.slides.length) {
        sinTexto.push({ f, cues: parsed.cues })
        continue
    }

    const lineas = parsed.slides.reduce((n, s) => n + s.lines.length, 0)
    const entry = { f, title, slides: parsed.slides, lineas, cues: parsed.cues, emptyCues: parsed.emptyCues }
    ok.push(entry)

    // things worth eyeballing before a real run
    const razones = []
    if (parsed.emptyCues > 2) razones.push(`${parsed.emptyCues} slides sin texto`)
    if (parsed.slides.length > 40) razones.push(`${parsed.slides.length} slides`)
    if (parsed.slides.some((s) => s.lines.some((l) => l.length > 120))) razones.push("línea muy larga")
    if (parsed.slides.some((s) => s.lines.length > 6)) razones.push("slide con muchas líneas")
    if (/[�]/.test(slidesToPlainText(parsed.slides))) razones.push("caracteres corruptos")
    if (razones.length) sospechosas.push({ ...entry, razones })
}

const totalSlides = ok.reduce((n, e) => n + e.slides.length, 0)

// duplicate titles, e.g. "cancion (1).pro" next to "cancion.pro"
const porTitulo = new Map()
for (const e of ok) {
    const key = e.title.replace(/\s*\(\d+\)$/, "").toLowerCase()
    if (!porTitulo.has(key)) porTitulo.set(key, [])
    porTitulo.get(key).push(e.title)
}
const duplicados = [...porTitulo.entries()].filter(([, v]) => v.length > 1)

const L = []
L.push(`# Prueba en seco — migración ProPresenter → FreeShow\n`)
L.push(`Carpeta: \`${dir}\`\n`)
L.push(`> No se escribió nada en FreeShow.\n`)
L.push(`## Resumen\n`)
L.push(`| | |`)
L.push(`|---|---|`)
L.push(`| Archivos .pro | ${files.length} |`)
L.push(`| Se migrarían | **${ok.length}** |`)
L.push(`| Sin texto (nada que migrar) | ${sinTexto.length} |`)
L.push(`| Con error de lectura | ${errores.length} |`)
L.push(`| Slides que se crearían | ${totalSlides} |`)
L.push(`| Promedio de slides por canción | ${(totalSlides / Math.max(1, ok.length)).toFixed(1)} |`)
L.push(`| Títulos duplicados | ${duplicados.length} |`)
L.push(`| Marcadas para revisar | ${sospechosas.length} |`)
L.push("")

if (errores.length) {
    L.push(`## Errores de lectura (${errores.length})\n`)
    for (const e of errores) L.push(`- \`${e.f}\` — ${e.msg}`)
    L.push("")
}

L.push(`## Sin texto — no se migrarían (${sinTexto.length})\n`)
L.push(`Archivos sin ningún bloque de letra: presentaciones vacías, anuncios o capturas.\n`)
for (const e of sinTexto) L.push(`- \`${e.f}\``)
L.push("")

if (duplicados.length) {
    L.push(`## Títulos duplicados (${duplicados.length})\n`)
    L.push(`Crearían shows con nombres casi iguales. Conviene decidir cuál conservar.\n`)
    for (const [, v] of duplicados.slice(0, 40)) L.push(`- ${v.map((x) => `\`${x}\``).join(" · ")}`)
    if (duplicados.length > 40) L.push(`- … y ${duplicados.length - 40} más`)
    L.push("")
}

if (sospechosas.length) {
    L.push(`## Para revisar (${sospechosas.length})\n`)
    for (const e of sospechosas.slice(0, 60)) L.push(`- \`${e.title}\` — ${e.razones.join("; ")}`)
    if (sospechosas.length > 60) L.push(`- … y ${sospechosas.length - 60} más`)
    L.push("")
}

L.push(`## Vista previa completa (${ok.length})\n`)
for (const e of ok) {
    L.push(`### ${e.title}`)
    L.push(`\`${e.f}\` — ${e.slides.length} slides, ${e.lineas} líneas\n`)
    L.push("```")
    e.slides.forEach((s, i) => {
        L.push(`[${i + 1}] ${s.lines.join(" / ")}`)
    })
    L.push("```\n")
}

fs.writeFileSync(outFile, L.join("\n"), "utf8")

console.log(`archivos .pro        : ${files.length}`)
console.log(`se migrarían         : ${ok.length}`)
console.log(`sin texto            : ${sinTexto.length}`)
console.log(`errores de lectura   : ${errores.length}`)
console.log(`slides a crear       : ${totalSlides}`)
console.log(`títulos duplicados   : ${duplicados.length}`)
console.log(`marcadas para revisar: ${sospechosas.length}`)
console.log(`\nreporte -> ${path.resolve(outFile)}`)
