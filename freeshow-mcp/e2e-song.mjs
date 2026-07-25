// End-to-end: plan a song, create it in FreeShow, read it back and verify the timing landed.
import { callAction } from "./src/freeshow.js"
import { planSong, beatsToSeconds } from "./src/songBuilder.js"

// Sublime Gracia — John Newton, 1779 (dominio público)
const letra = `Title=Sublime Gracia (prueba MCP)
Artist=John Newton
BPM=72

[Verso]
Sublime gracia del Señor
que a un infeliz salvó

[Coro]
Fui ciego mas hoy veo yo
perdido y Él me halló

[Instrumental]`

const BPM = 72
const plan = planSong({ text: letra, bpm: BPM })
console.log(`Plan: ${plan.slides.length} diapositivas, ${plan.totalBeats} pulsos, ~${beatsToSeconds(plan.totalBeats, BPM).toFixed(1)}s`)
for (const [i, s] of plan.slides.entries()) {
    console.log(`  ${i + 1}. [${s.group || "-"}] "${s.lines.join(" / ") || "(instrumental)"}" -> ${s.beats} pulsos = ${beatsToSeconds(s.beats, BPM).toFixed(2)}s`)
}

const created = await callAction("create_animated_song", {
    name: "Sublime Gracia (prueba MCP)",
    meta: { title: "Sublime Gracia (prueba MCP)", artist: "John Newton" },
    bpm: BPM,
    slides: plan.slides,
    animation: { preset: "suave" },
})

const info = created?.data ?? created
console.log("\nRespuesta de FreeShow:", JSON.stringify(info, null, 2))

if (!info?.id) throw new Error("FreeShow no devolvió un id de show")

// read it back
const back = await callAction("get_show", { id: info.id })
const show = back?.data ?? back
if (!show?.slides) throw new Error("no se pudo leer el show creado")

const layout = Object.values(show.layouts)[0]
console.log(`\nVerificación del show guardado "${show.name}":`)
console.log(`  slides en layout: ${layout.slides.length}`)

let problemas = 0
layout.slides.forEach((l, i) => {
    const slide = show.slides[l.id]
    const texto = (slide?.items || []).flatMap((it) => (it.lines || []).map((ln) => (ln.text || []).map((t) => t.value).join(""))).join(" / ")
    const esperado = plan.slides[i]
    const segEsperados = Number(beatsToSeconds(esperado.beats, BPM).toFixed(3))

    const okTimer = Math.abs((l.nextTimer ?? -1) - segEsperados) < 0.01
    const okTrans = l.transition?.type === "fade" && l.transition?.duration > 0
    if (!okTimer || !okTrans) problemas++

    console.log(
        `  ${i + 1}. "${texto}" | grupo=${slide?.group ?? "-"} | nextTimer=${l.nextTimer}s (esperado ${segEsperados}) ${okTimer ? "OK" : "MAL"} | transición=${l.transition?.type}/${l.transition?.duration}ms ${okTrans ? "OK" : "MAL"}`
    )
})

// one beat at 72bpm = 833ms; the "suave" preset is 1 beat
const transMs = layout.slides[0]?.transition?.duration
console.log(`\nTransición derivada del pulso: ${transMs}ms (1 pulso a ${BPM}bpm = ${Math.round(60000 / BPM)}ms)`)
if (Math.abs(transMs - 60000 / BPM) > 2) {
    console.error("FALLO: la transición no coincide con el pulso")
    problemas++
}

console.log(problemas ? `\n${problemas} problema(s)` : "\nTODO OK — el show quedó sincronizado al tempo")
process.exitCode = problemas ? 1 : 0
