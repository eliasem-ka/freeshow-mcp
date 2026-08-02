// Restore "Servicio Dominical" to the items it had before the migration.
//
// Creating a show adds it to whatever project is active, so importing 517 songs
// appended every one of them to the project the user had open. The original
// entries all carry hand-written ids ("sec-…", "show-…"); the appended ones use
// generated ids, which is what tells them apart.
//
// Usage: node limpiar-proyecto.mjs [--apply]
//
// NOTE: no forced save here. Persisting through FreeShow's save wrote a
// degraded showsCache over good files and blanked hundreds of shows twice.
// Close FreeShow to let it save, or write .show files directly with
// src/escribirShow.js.

import { callAction } from "./src/freeshow.js"

const apply = process.argv.includes("--apply")
const PROYECTO = "svc-domingo"

const r = await callAction("get_projects")
const data = r?.data ?? r
const list = Array.isArray(data) ? data : Object.entries(data || {}).map(([id, p]) => ({ id, ...p }))
const proyecto = list.find((p) => p.id === PROYECTO)

if (!proyecto) {
    console.log(`no encontré el proyecto ${PROYECTO}`)
    process.exit(1)
}

const items = proyecto.shows || []
const originales = items.filter((s) => /^(sec|show)-/.test(s.id))
const agregados = items.filter((s) => !/^(sec|show)-/.test(s.id))

console.log(`proyecto "${proyecto.name}"`)
console.log(`  items ahora     : ${items.length}`)
console.log(`  originales      : ${originales.length}`)
console.log(`  agregados por mí: ${agregados.length}`)
console.log()
console.log("  se conservan:")
for (const s of originales) console.log(`    ${s.index}. ${s.name || s.id}${s.type === "section" ? "  (sección)" : ""}`)

if (!apply) {
    console.log(`\n[prueba en seco] nada cambiado. Correr con --apply`)
    process.exit(0)
}

const res = (await callAction("trim_project", { projectId: PROYECTO, keepIds: originales.map((s) => s.id), confirm: true }))?.data
console.log(`\nresultado: ${JSON.stringify(res)}`)

