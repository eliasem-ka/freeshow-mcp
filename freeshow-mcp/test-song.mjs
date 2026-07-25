// Sanity checks for the tempo/lyric model used by the `create_song` tool.
// Run: node test-song.mjs

import { planSong, parseLyrics, countSyllables, quantizeBeats, matchGroup, beatsToSeconds } from "./src/songBuilder.js"

let failed = 0
function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    if (!ok) failed++
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     esperado: ${JSON.stringify(expected)}\n     obtenido: ${JSON.stringify(actual)}`}`)
}

// --- syllables (Spanish) ---
check("sílabas 'gracia'", countSyllables("gracia"), 2) // gra-cia (diptongo)
check("sílabas 'dia' sin tilde", countSyllables("dia"), 1) // dia (diptongo)
check("sílabas 'día' con tilde", countSyllables("día"), 2) // dí-a (hiato)
check("sílabas 'leer'", countSyllables("leer"), 2) // le-er (hiato)
check("sílabas 'sublime gracia'", countSyllables("sublime gracia"), 5)
check("sílabas 'Cuán grande es Él'", countSyllables("Cuán grande es Él"), 5)

// --- groups ---
check("grupo 'Coro'", matchGroup("Coro"), "chorus")
check("grupo 'Verso 2'", matchGroup("Verso 2"), "verse")
check("grupo 'Puente'", matchGroup("Puente"), "bridge")
check("grupo 'Pre-Coro'", matchGroup("Pre-Coro"), "pre_chorus")
check("grupo 'Instrumental'", matchGroup("Instrumental"), "break")
check("grupo desconocido", matchGroup("Zzz"), null)

// --- quantize ---
check("quantize 1.4 a pulso", quantizeBeats(1.4, 1), 1)
check("quantize 1.6 a pulso", quantizeBeats(1.6, 1), 2)
check("quantize nunca bajo el mínimo", quantizeBeats(0.1, 1), 1)
check("quantize a compás", quantizeBeats(5, 4), 4)

// --- parsing ---
const letra = `Title=Sublime Gracia
Artist=John Newton
BPM=72

[Verso]
Sublime gracia del Señor
que a un infeliz salvó

[Coro]
Fui ciego mas hoy veo yo
perdido y Él me halló

[Instrumental]`

const parsed = parseLyrics(letra)
check("metadatos", parsed.meta, { title: "Sublime Gracia", artist: "John Newton", bpm: "72" })
check("cantidad de secciones", parsed.sections.length, 3)
check("etiqueta sección 1", parsed.sections[0].label, "Verso")
check("grupo global sección 2", parsed.sections[1].globalGroup, "chorus")
check("sección instrumental sin líneas", parsed.sections[2].lines, [])

// header separado por línea en blanco
const conBlanco = parseLyrics("[Coro]\n\nprimera línea\nsegunda línea")
check("header seguido de línea en blanco conserva etiqueta", conBlanco.sections[0].label, "Coro")
check("header seguido de línea en blanco conserva líneas", conBlanco.sections[0].lines.length, 2)

// --- plan ---
const plan = planSong({ text: letra })
check("bpm tomado de la letra", plan.bpm, 72)
check("una diapositiva por línea (+1 instrumental)", plan.slides.length, 5)
check("primera diapositiva lleva grupo", plan.slides[0].group, "Verso")
check("segunda diapositiva sin grupo", plan.slides[1].group, undefined)
check("tercera diapositiva abre el Coro", plan.slides[2].group, "Coro")
check("una sola línea por diapositiva", plan.slides[0].lines, ["Sublime gracia del Señor"])
check("instrumental dura un compás", plan.slides[4].beats, 4)

// todas las diapositivas tienen duración y es múltiplo del pulso
const sinDuracion = plan.slides.filter((s) => !s.beats)
check("todas las diapositivas tienen duración", sinDuracion.length, 0)
const fueraDeRejilla = plan.slides.filter((s) => Math.abs(s.beats - Math.round(s.beats)) > 1e-9)
check("todas caen en la rejilla del pulso", fueraDeRejilla.length, 0)

// duración fija por línea
const fijo = planSong({ text: letra, bpm: 120, beatsPerLine: 4 })
check("beatsPerLine fija la duración", fijo.slides[0].beats, 4)
check("4 pulsos a 120bpm = 2s", Number(beatsToSeconds(4, 120).toFixed(3)), 2)

// varias líneas por diapositiva
const dobles = planSong({ text: letra, bpm: 72, linesPerSlide: 2 })
check("2 líneas por diapositiva", dobles.slides[0].lines.length, 2)
check("menos diapositivas al agrupar", dobles.slides.length, 3)

// sin bpm -> advertencia
const sinBpm = planSong({ text: "[Coro]\nuna línea" })
check("sin bpm avisa", sinBpm.warnings.length, 1)

console.log(failed ? `\n${failed} prueba(s) fallaron` : "\nTodas las pruebas pasaron")
process.exit(failed ? 1 : 0)
