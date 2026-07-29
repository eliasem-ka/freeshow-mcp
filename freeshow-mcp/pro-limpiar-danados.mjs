// Remove show files whose lyrics were blanked: the layout still references
// slides but the slides map is empty. These are unusable in FreeShow and will
// be rebuilt from the ProPresenter source.
//
// The user's own pre-existing shows are left alone even when damaged — they
// cannot be rebuilt from source, so that call is theirs to make.
//
// Usage: node pro-limpiar-danados.mjs [--apply]

import fs from "fs"
import path from "path"

const showsDir = "C:/Users/CCCR/Documents/FreeShow/Shows"
const apply = process.argv.includes("--apply")

// shipped with the user's install, not produced by the migration
const NO_TOCAR = new Set(["show-anuncios", "show-bienvenida", "show-cuenta-regresiva", "show-cuan-grande", "show-digno-cordero", "show-predica-titulo", "show-ofrenda", "show-oracion", "show-renuevame"])

const files = fs.readdirSync(showsDir).filter((f) => f.toLowerCase().endsWith(".show"))
const danados = []
const intactos = []
const protegidos = []

for (const f of files) {
    let id
    let show
    try {
        ;[id, show] = JSON.parse(fs.readFileSync(path.join(showsDir, f), "utf8"))
    } catch {
        continue
    }
    if (!show) continue

    const slideCount = Object.keys(show.slides || {}).length
    const referenced = Object.values(show.layouts || {}).reduce((n, l) => n + (l?.slides?.length || 0), 0)

    if (slideCount > 0) {
        intactos.push(f)
        continue
    }
    if (referenced === 0) continue // genuinely empty show, nothing to repair

    if (NO_TOCAR.has(id)) {
        protegidos.push({ f, id, referenced })
        continue
    }
    danados.push({ f, id, referenced })
}

console.log(`archivos .show        : ${files.length}`)
console.log(`intactos              : ${intactos.length}`)
console.log(`dañados a borrar      : ${danados.length}`)
console.log(`dañados tuyos (intact): ${protegidos.length}  ← no se tocan`)
console.log()
protegidos.forEach((p) => console.log(`  se conserva dañado: ${p.f}`))
console.log()
danados.slice(0, 10).forEach((d) => console.log(`  borrar ${d.f}`))
if (danados.length > 10) console.log(`  … y ${danados.length - 10} más`)

if (!apply) {
    console.log(`\n[prueba en seco] nada borrado. Correr con --apply`)
} else {
    let n = 0
    for (const d of danados) {
        fs.unlinkSync(path.join(showsDir, d.f))
        n++
    }
    console.log(`\nborrados: ${n}`)
}
