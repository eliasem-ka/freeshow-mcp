#!/usr/bin/env node
// USX (bible-import / ProPresenter export) -> FreeShow .fsb converter
//
// Toma la salida del importador de biblias (carpetas con USX_1/, metadata.xml,
// rvmetadata.xml) y genera archivos .fsb que FreeShow puede importar.
//
// Uso:
//   node convert.mjs <input> [--out <dir>] [--name <nombre>] [--stdout]
//
//   <input>   Carpeta de UNA biblia (la que contiene USX_1/),
//             o una carpeta "output" con varias biblias adentro (batch).
//   --out     Carpeta destino. Por defecto: <Documentos>/FreeShow/Bibles
//   --name    Sobrescribe el nombre de la biblia (solo con input de 1 biblia).
//   --stdout  Imprime el JSON .fsb por stdout en vez de escribir archivo.
//
// Sin dependencias. Requiere Node 16+.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// --- args ------------------------------------------------------------------

const argv = process.argv.slice(2)
if (!argv.length || argv.includes("-h") || argv.includes("--help")) {
    console.log(`USX -> FreeShow .fsb

Uso:
  node convert.mjs <input> [--out <dir>] [--name <nombre>] [--stdout]

  <input>   Carpeta de una biblia (con USX_1/) o carpeta padre con varias.
  --out     Destino (def: ${defaultBiblesFolder()})
  --name    Sobrescribe el nombre (solo 1 biblia).
  --stdout  Imprime el .fsb a stdout en vez de escribir.`)
    process.exit(argv.length ? 0 : 1)
}

function flag(name) {
    const i = argv.indexOf(name)
    if (i === -1) return undefined
    return argv[i + 1]
}

const input = path.resolve(argv[0])
const outDir = flag("--out") ? path.resolve(flag("--out")) : defaultBiblesFolder()
const forcedName = flag("--name")
const toStdout = argv.includes("--stdout")

// --- main ------------------------------------------------------------------
// (se llama al final, cuando todas las const/funciones ya están inicializadas)

function main() {
    const bibleDirs = findBibleDirs(input)
    if (!bibleDirs.length) {
        console.error(`No se encontró ninguna biblia (carpeta con USX_1/) en: ${input}`)
        process.exit(1)
    }
    if (forcedName && bibleDirs.length > 1) {
        console.error("--name solo se puede usar cuando el input es una sola biblia.")
        process.exit(1)
    }

    if (!toStdout) fs.mkdirSync(outDir, { recursive: true })

    let okCount = 0
    for (const dir of bibleDirs) {
        try {
            const bible = buildBible(dir, forcedName)
            const id = uid()
            const payload = JSON.stringify([id, bible])

            if (toStdout) {
                process.stdout.write(payload + "\n")
            } else {
                const fileName = formatToFileName(bible.name) + ".fsb"
                const filePath = path.join(outDir, fileName)
                fs.writeFileSync(filePath, payload, "utf8")
                const verses = bible.books.reduce((s, b) => s + b.chapters.reduce((c, ch) => c + ch.verses.length, 0), 0)
                console.log(`✓ ${bible.name}  (${bible.books.length} libros, ${verses} versículos)\n  → ${filePath}`)
            }
            okCount++
        } catch (err) {
            console.error(`✕ Error con ${path.basename(dir)}: ${err.message}`)
        }
    }

    if (!toStdout) {
        console.log(`\nListo: ${okCount}/${bibleDirs.length} biblia(s).`)
        console.log(`En FreeShow: Drawer → Scripture → Import → Local → seleccioná la versión.`)
    }
}

// --- discovery -------------------------------------------------------------

function findBibleDirs(root) {
    if (!fs.existsSync(root)) return []
    if (hasUSX(root)) return [root]
    // batch: subcarpetas con USX_1/
    return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(root, d.name))
        .filter(hasUSX)
}

function hasUSX(dir) {
    return fs.existsSync(path.join(dir, "USX_1")) && fs.statSync(path.join(dir, "USX_1")).isDirectory()
}

// --- build one bible -------------------------------------------------------

function buildBible(dir, nameOverride) {
    const meta = readMetadata(dir)
    const name = nameOverride || meta.name

    const books = []
    let order = 0
    for (const code of meta.bookOrder) {
        const usxPath = path.join(dir, "USX_1", code + ".usx")
        if (!fs.existsSync(usxPath)) continue
        order++

        const xml = fs.readFileSync(usxPath, "utf8")
        const chapters = parseUSX(xml)
        if (!chapters.length) continue

        const info = meta.bookNames[code] || {}
        const book = {
            number: order, // orden tal cual en la biblia (canónico para estas versiones)
            name: titleCaseEs(info.short || info.long || code),
            chapters,
        }
        if (info.abbr) book.abbreviation = info.abbr
        books.push(book)
    }

    if (!books.length) throw new Error("no se pudo extraer ningún libro")

    const bible = { name, books }
    const metadata = {}
    if (meta.abbreviation) metadata.abbreviation = meta.abbreviation
    if (meta.copyright) metadata.copyright = meta.copyright
    if (Object.keys(metadata).length) bible.metadata = metadata
    if (meta.copyright) bible.copyright = meta.copyright

    return bible
}

// --- metadata --------------------------------------------------------------

function readMetadata(dir) {
    let name = path.basename(dir)
    let abbreviation = ""
    let copyright = ""

    const rvPath = path.join(dir, "rvmetadata.xml")
    if (fs.existsSync(rvPath)) {
        const rv = fs.readFileSync(rvPath, "utf8")
        name = pick(rv, /<name>([^<]*)<\/name>/) || name
        abbreviation = pick(rv, /<abbreviation>([^<]*)<\/abbreviation>/) || abbreviation
        const lic = pick(rv, /<license>([^<]*)<\/license>/)
        if (lic) copyright = decode(lic)
    }

    const bookNames = {}
    const bookOrder = []
    const mdPath = path.join(dir, "metadata.xml")
    if (fs.existsSync(mdPath)) {
        const md = fs.readFileSync(mdPath, "utf8")
        // tomamos los nombres de la sección <bookNames>, que está en orden canónico
        const block = pick(md, /<bookNames>([\s\S]*?)<\/bookNames>/) || md
        const re = /<book code="([^"]+)">\s*<long>([^<]*)<\/long>\s*<short>([^<]*)<\/short>\s*<abbr>([^<]*)<\/abbr>/g
        let m
        while ((m = re.exec(block))) {
            const code = m[1]
            bookNames[code] = { long: decode(m[2]), short: decode(m[3]), abbr: decode(m[4]) }
            bookOrder.push(code)
        }
    }

    // fallback: si no hubo metadata, usar los archivos USX existentes
    if (!bookOrder.length) {
        const usxDir = path.join(dir, "USX_1")
        for (const f of fs.readdirSync(usxDir)) {
            if (f.toLowerCase().endsWith(".usx")) bookOrder.push(f.replace(/\.usx$/i, ""))
        }
        bookOrder.sort((a, b) => (BOOK_ORDER[a] || 999) - (BOOK_ORDER[b] || 999))
    }

    return { name: decode(name), abbreviation, copyright, bookNames, bookOrder }
}

// --- USX parser ------------------------------------------------------------
// Estructura: <chapter number="N" style="c"/> ... <para style="p|s1">
//   <verse number="V" style="v"/>texto...</para>
// El texto del versículo es lo que sigue al <verse/> hasta el próximo <verse/>,
// </para> o <chapter/>. Los <para style="s1"> (títulos) se ignoran.

const HEADING = /^(s|r|ms|mr|mte|d|sp|cl|cp|cd|qa|rem|toc|mt|imt|is|iot|io|ip|ie|periph)/

function parseUSX(xml) {
    const chapters = []
    let curCh = null
    let curV = null
    let inContent = false

    const closeVerse = () => {
        if (!curV) return
        const text = clean(curV.text)
        const [a, b] = curV.range
        curV = null
        if (!text || !curCh) return
        curCh.verses.push({ number: a, text })
        for (let n = a + 1; n <= b; n++) curCh.verses.push({ number: n, text })
    }

    const re = /<chapter\b[^>]*\bnumber="([^"]+)"[^>]*\/?>|<para\b[^>]*\bstyle="([^"]+)"[^>]*>|<\/para>|<verse\b[^>]*\bnumber="([^"]+)"[^>]*\/?>|<book\b[^>]*>[^<]*<\/book>|<\/?usx\b[^>]*>/g

    let last = 0
    let m
    while ((m = re.exec(xml))) {
        const text = xml.slice(last, m.index)
        if (inContent && curV && text) curV.text += text
        last = re.lastIndex

        if (m[1] !== undefined) {
            // chapter
            closeVerse()
            curCh = { number: Number(m[1]) || m[1], verses: [] }
            chapters.push(curCh)
        } else if (m[2] !== undefined) {
            // para open
            inContent = !HEADING.test(m[2])
        } else if (m[0] === "</para>") {
            inContent = false
        } else if (m[3] !== undefined) {
            // verse
            closeVerse()
            curV = makeVerse(m[3])
        }
        // <book>...</book> y <usx> se ignoran
    }
    const tail = xml.slice(last)
    if (inContent && curV && tail) curV.text += tail
    closeVerse()

    return chapters
}

function makeVerse(numStr) {
    const range = numStr.match(/^(\d+)\s*[-–]\s*(\d+)$/)
    if (range) return { number: +range[1], range: [+range[1], +range[2]], text: "" }
    const n = parseInt(numStr, 10)
    const num = Number.isNaN(n) ? numStr : n
    return { number: num, range: [num, num], text: "" }
}

// --- helpers ---------------------------------------------------------------

function clean(s) {
    return decode(s).replace(/\s+/g, " ").trim()
}

function decode(s) {
    return String(s)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&amp;/g, "&")
}

function pick(s, re) {
    const m = s.match(re)
    return m ? m[1].trim() : ""
}

function titleCaseEs(s) {
    return s
        .toLocaleLowerCase("es")
        .replace(/(^|\s|\(|-)([\p{L}])/gu, (_, pre, ch) => pre + ch.toLocaleUpperCase("es"))
}

function formatToFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "Bible"
}

function uid(length = 11) {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    let out = ""
    for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
    return out
}

function defaultBiblesFolder() {
    return path.join(os.homedir(), "Documents", "FreeShow", "Bibles")
}

// Orden canónico (USFM code -> posición) solo para el fallback sin metadata.
const BOOK_ORDER = {}
;[
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
    "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS",
    "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK",
    "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
    "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
].forEach((code, i) => (BOOK_ORDER[code] = i + 1))

// arranque
main()
