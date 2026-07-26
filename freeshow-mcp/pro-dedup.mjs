// Clean up shows duplicated by the migration's name-collision bug.
//
// Grouping is by LYRIC CONTENT, never by name: the library legitimately holds
// different songs that share a title ("Al Rey" by Marcos Vidal and by Marcos
// Witt), and deleting those by name would destroy real variants.
//
// Usage: node pro-dedup.mjs [--apply]

import { callAction } from "./src/freeshow.js"

const apply = process.argv.includes("--apply")

const raw = await callAction("get_shows")
const data = raw?.data ?? raw
const list = (Array.isArray(data) ? data : Object.entries(data || {}).map(([id, s]) => ({ id, ...s }))).filter((s) => s.id)

console.log(`leyendo el contenido de ${list.length} shows…`)

const norm = (x) =>
    String(x || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()

const porContenido = new Map()
let leidos = 0
for (const s of list) {
    // get_plain_text answers { data: { id, value } } — reading .data yields the
    // wrapper object, whose normalised form is identical for every show. That
    // collapsed all 762 into one "duplicate" group in an earlier run.
    const res = await callAction("get_plain_text", { id: s.id })
    const text = res?.data?.value ?? ""
    const key = norm(text)
    leidos++
    if (leidos % 100 === 0) console.log(`  … ${leidos}/${list.length}`)
    // a show with no text is left completely alone
    if (!key) continue
    if (!porContenido.has(key)) porContenido.set(key, [])
    porContenido.get(key).push({ ...s, len: String(text).length })
}

const grupos = [...porContenido.values()].filter((g) => g.length > 1)

// Assign each distinct song the plainest name it can have. A base name can only
// belong to one song, so a genuine variant keeps its artist suffix.
const tomados = new Set()
const conservar = []
const borrar = []

// groups that have a name without a parenthetical go first, so they claim the base
const ordenados = [...porContenido.values()].sort((a, b) => {
    const aPlain = a.some((s) => !/\([^)]*\)$/.test(s.name || "")) ? 0 : 1
    const bPlain = b.some((s) => !/\([^)]*\)$/.test(s.name || "")) ? 0 : 1
    return aPlain - bPlain
})

for (const grupo of ordenados) {
    // prefer a name that is still free, plainest first
    const candidatos = [...grupo].sort((a, b) => (a.name || "").length - (b.name || "").length)
    const elegido = candidatos.find((s) => !tomados.has(norm(s.name))) || candidatos[0]
    tomados.add(norm(elegido.name))
    conservar.push(elegido)
    for (const s of grupo) if (s.id !== elegido.id) borrar.push({ ...s, enFavorDe: elegido.name })
}

console.log(`\ngrupos con contenido repetido : ${grupos.length}`)
console.log(`shows a conservar             : ${conservar.length}`)
console.log(`shows a borrar                : ${borrar.length}`)
console.log()
borrar.slice(0, 25).forEach((s) => console.log(`  borrar "${s.name}"  (queda "${s.enFavorDe}")`))
if (borrar.length > 25) console.log(`  … y ${borrar.length - 25} más`)

if (!apply) {
    console.log(`\n[prueba en seco] nada borrado. Volvé a correr con --apply`)
} else if (borrar.length) {
    const res = await callAction("delete_shows", { ids: borrar.map((s) => s.id), confirm: true })
    const info = res?.data ?? res
    console.log(`\nborrados: ${info?.deleted ?? "?"}`)
    const saved = await callAction("save_data")
    console.log(`guardado: ${JSON.stringify(saved?.data ?? saved)}`)
}
