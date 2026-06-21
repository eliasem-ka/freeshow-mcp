// Prueba end-to-end de create_scripture_playlist con la lista real.
// Requiere: FreeShow reiniciado (con el API nuevo) y las versiones RV60 y PDT importadas.
//
//   node test-playlist.mjs
//
// Replica exactamente lo que hace la tool del MCP, pero como script suelto.

import { callAction } from "./src/freeshow.js"
import { bookNameToNumber, expandVerses, matchVersion } from "./src/scriptureRefs.js"

const NAME = "Versículos de prueba"
const REFERENCES = [
    { book: "2 Corintios", chapter: 6, verses: "18", version: "RV60" },
    { book: "Juan", chapter: 1, verses: "12,13", version: "PDT" },
    { book: "Romanos", chapter: 8, verses: "14,16", version: "PDT" },
    { book: "Salmos", chapter: 103, verses: "13", version: "RV60" },
    { book: "Proverbios", chapter: 14, verses: "26", version: "RV60" },
    { book: "Proverbios", chapter: 23, verses: "26", version: "RV60" },
    { book: "Hebreos", chapter: 12, verses: "7", version: "RV60" },
    { book: "Lucas", chapter: 15, verses: "17-20", version: "RV60" },
]

const scripturesRaw = await callAction("get_scriptures")
const scriptures = Array.isArray(scripturesRaw) ? scripturesRaw : scripturesRaw?.data || []
console.log("Biblias cargadas:", scriptures.map((s) => `${s.abbreviation || "?"} (${s.name})`).join(", ") || "NINGUNA")

if (!scriptures.length) {
    console.error("\n✕ No hay biblias. Importá RV60 y PDT en FreeShow (Drawer → Scripture → Import → Local) y reintentá.")
    process.exit(1)
}

const items = []
const errors = []
REFERENCES.forEach((ref, i) => {
    const where = `#${i + 1} ${ref.book} ${ref.chapter}:${ref.verses} ${ref.version}`
    const version = matchVersion(ref.version, scriptures)
    if (!version) return errors.push(`${where} -> versión no encontrada`)
    const book = bookNameToNumber(ref.book)
    if (!book) return errors.push(`${where} -> libro no reconocido`)
    const verses = expandVerses(ref.verses)
    if (!verses.length) return errors.push(`${where} -> versículos inválidos`)
    items.push({ scriptureId: version.id, book, chapter: ref.chapter, verses })
    console.log(`✓ ${where}  ->  libro ${book}, vs [${verses.join(",")}], versión ${version.abbreviation}`)
})

if (errors.length) console.log("\nAdvertencias:\n" + errors.join("\n"))
if (!items.length) {
    console.error("\n✕ Ninguna referencia resuelta.")
    process.exit(1)
}

console.log("\nCreando playlist en FreeShow…")
const result = await callAction("create_scripture_show", { name: NAME, items })
const payload = result?.data ?? result
console.log("Resultado:", JSON.stringify(payload, null, 2))

if (payload?.error) {
    console.error(`\n✕ FreeShow no pudo crear la playlist: ${payload.error}`)
    process.exit(1)
}
console.log(`\n✓ Playlist creada: "${payload?.name}" con ${payload?.slides} slides (id ${payload?.id}).`)
console.log("Mirá el show en FreeShow; debería estar en el proyecto activo / drawer de shows.")
