// Remove shows whose lyrics duplicate another's, reading the .show files from
// disk. Grouping is by content, never by name: the library holds different
// songs that share a title ("Al Rey" by two artists) and merging those by name
// would destroy real variants.
//
// Usage: node pro-dedup-disco.mjs [--apply]

import fs from "fs"
import path from "path"
import { callAction } from "./src/freeshow.js"
import { normalizeKey } from "./src/proMigrate.js"

const showsDir = "C:/Users/CCCR/Documents/FreeShow/Shows"
const apply = process.argv.includes("--apply")

function lyricsOf(show) {
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

const shows = []
for (const f of fs.readdirSync(showsDir).filter((x) => x.toLowerCase().endsWith(".show"))) {
    try {
        const [id, show] = JSON.parse(fs.readFileSync(path.join(showsDir, f), "utf8"))
        if (!id || !show) continue
        const texto = lyricsOf(show)
        if (!texto.trim()) continue
        shows.push({ id, name: show.name || "", file: f, texto, artist: show.meta?.artist || "" })
    } catch {
        // unreadable: leave it alone
    }
}

const porContenido = new Map()
for (const s of shows) {
    const key = normalizeKey(s.texto)
    if (!porContenido.has(key)) porContenido.set(key, [])
    porContenido.get(key).push(s)
}

// groups that can hold a plain name claim it first, so variants keep a suffix
const ordenados = [...porContenido.values()].sort((a, b) => {
    const plain = (g) => (g.some((s) => !/\([^)]*\)\s*$/.test(s.name)) ? 0 : 1)
    return plain(a) - plain(b)
})

const tomados = new Set()
const borrar = []
let grupos = 0

for (const grupo of ordenados) {
    if (grupo.length > 1) grupos++
    const candidatos = [...grupo].sort((a, b) => a.name.length - b.name.length)
    const elegido = candidatos.find((s) => !tomados.has(normalizeKey(s.name))) || candidatos[0]
    tomados.add(normalizeKey(elegido.name))
    for (const s of grupo) if (s.id !== elegido.id) borrar.push({ ...s, enFavorDe: elegido.name })
}

console.log(`shows con letra   : ${shows.length}`)
console.log(`grupos duplicados : ${grupos}`)
console.log(`a borrar          : ${borrar.length}`)
console.log()
borrar.forEach((s) => console.log(`  borrar "${s.name}"  (queda "${s.enFavorDe}")`))

if (!apply) {
    console.log(`\n[prueba en seco] nada borrado. Correr con --apply`)
} else if (borrar.length) {
    const res = await callAction("delete_shows", { ids: borrar.map((s) => s.id), confirm: true })
    console.log(`\nborrados: ${(res?.data ?? res)?.deleted ?? "?"}`)
    const saved = (await callAction("save_data"))?.data
    console.log(`guardado: ${JSON.stringify(saved)}`)
}
