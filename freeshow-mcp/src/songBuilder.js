// Pure lyric/tempo logic for the `create_song` tool.
//
// Nothing here talks to FreeShow: it turns a block of lyrics plus a tempo into
// a list of slides with per-slide durations expressed in beats. The FreeShow
// side (create_animated_song) converts those beats into seconds and writes the
// actual show. Keeping the two apart means the timing model can be tested and
// tweaked without touching FreeShow at all.

/// GROUPS ///

// Spanish (and English) section names -> FreeShow's built-in group ids.
const GROUP_IDS = ["break", "bridge", "chorus", "intro", "outro", "pre_chorus", "tag", "verse"]

const GROUP_ALIASES = {
    // verse
    verso: "verse",
    versos: "verse",
    estrofa: "verse",
    verse: "verse",
    // chorus
    coro: "chorus",
    estribillo: "chorus",
    chorus: "chorus",
    // pre-chorus
    precoro: "pre_chorus",
    "pre-coro": "pre_chorus",
    "pre coro": "pre_chorus",
    prechorus: "pre_chorus",
    "pre-chorus": "pre_chorus",
    // bridge
    puente: "bridge",
    bridge: "bridge",
    // intro / outro
    intro: "intro",
    introduccion: "intro",
    introducción: "intro",
    outro: "outro",
    final: "outro",
    cierre: "outro",
    // tag / break
    tag: "tag",
    coda: "tag",
    remate: "tag",
    instrumental: "break",
    interludio: "break",
    break: "break",
    silencio: "break"
}

/** Map a free-form section label to a FreeShow group id (or null if unknown). */
export function matchGroup(label) {
    if (!label) return null
    const key = label
        .toLowerCase()
        .replace(/[\[\]:]/g, "")
        .replace(/\d+/g, "")
        .trim()
    if (!key) return null
    if (GROUP_IDS.includes(key)) return key
    if (GROUP_ALIASES[key]) return GROUP_ALIASES[key]
    // "verso 2" already lost its digits above, but "coro final" etc. still need a prefix match
    const prefix = Object.keys(GROUP_ALIASES).find((alias) => key.startsWith(alias))
    return prefix ? GROUP_ALIASES[prefix] : null
}

/// SYLLABLES ///

const STRONG_VOWELS = "aeoáéó"
const WEAK_VOWELS = "iuü"
const ACCENTED_WEAK = "íú"
const VOWELS = STRONG_VOWELS + WEAK_VOWELS + ACCENTED_WEAK

/**
 * Estimate the syllable count of a Spanish line.
 *
 * Counts vowel groups, splitting a group into two when it is a hiatus:
 * two strong vowels together (le-er, ca-os) or an accented weak vowel
 * (dí-a, ba-úl). Good enough to pace lyrics; it is not a linguistics engine.
 */
export function countSyllables(line) {
    if (!line) return 0
    const text = line.toLowerCase().replace(/[^a-záéíóúüñ\s]/g, " ")

    let total = 0
    for (const word of text.split(/\s+/)) {
        if (!word) continue

        let syllables = 0
        let i = 0
        while (i < word.length) {
            if (!VOWELS.includes(word[i])) {
                i++
                continue
            }

            // walk the whole vowel run
            let runLength = 0
            syllables++
            while (i + runLength < word.length && VOWELS.includes(word[i + runLength])) {
                if (runLength > 0) {
                    const prev = word[i + runLength - 1]
                    const current = word[i + runLength]
                    const bothStrong = STRONG_VOWELS.includes(prev) && STRONG_VOWELS.includes(current)
                    const accentedWeak = ACCENTED_WEAK.includes(prev) || ACCENTED_WEAK.includes(current)
                    if (bothStrong || accentedWeak) syllables++
                }
                runLength++
            }
            i += runLength
        }

        total += syllables || 1 // a word with no vowel still takes time to sing
    }

    return total
}

/// PARSING ///

/**
 * Split raw lyrics into sections.
 * Sections are separated by blank lines; a leading "[Coro]" or "Coro:" names one.
 * "Clave=Valor" lines are collected as metadata instead of lyrics.
 */
export function parseLyrics(text) {
    const sections = []
    const meta = {}

    // current section being filled
    let label = null
    let lines = []
    let started = false // a header or a lyric line has opened this section

    for (const raw of (text || "").replace(/\r/g, "").split("\n")) {
        const line = raw.trim()

        // a blank line closes the current section, but a header that has not
        // collected any lines yet keeps its label ("[Coro]\n\nprimera línea")
        if (!line) {
            if (lines.length) flush()
            continue
        }

        // metadata: Title=..., Artist=..., BPM=...
        const metaMatch = line.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,20})\s*=\s*(.+)$/)
        if (metaMatch) {
            meta[metaMatch[1].trim().toLowerCase()] = metaMatch[2].trim()
            continue
        }

        // section header: [Coro] or Coro:
        const bracket = line.match(/^\[(.+)\]$/)
        const colon = line.match(/^([\wÁÉÍÓÚÑáéíóúñ\- ]{2,20}):$/)
        if (bracket || colon) {
            // a header always begins a new section, wherever it appears
            flush()
            label = (bracket ? bracket[1] : colon[1]).trim()
            started = true
            continue
        }

        lines.push(line)
        started = true
    }
    flush()

    return { sections, meta }

    function flush() {
        // keep labelled-but-empty sections ("[Instrumental]"); drop pure whitespace
        if (started && (lines.length || label)) {
            sections.push({ label, globalGroup: matchGroup(label), lines })
        }
        label = null
        lines = []
        started = false
    }
}

/// TEMPO ///

/**
 * Turn a raw duration in beats into something musically sensible.
 * Rounds to the nearest `quantum` beats and never returns less than one quantum.
 */
export function quantizeBeats(beats, quantum) {
    if (!quantum || quantum <= 0) return Math.max(0.25, beats)
    const snapped = Math.round(beats / quantum) * quantum
    return Math.max(quantum, Number(snapped.toFixed(3)))
}

/**
 * Build the slide plan.
 *
 * @param {object} options
 * @param {string} options.text          raw lyrics
 * @param {number} [options.bpm]         song tempo
 * @param {number} [options.beatsPerBar] time signature numerator (default 4)
 * @param {number} [options.linesPerSlide] lyric lines per slide (default 1)
 * @param {number} [options.beatsPerLine]  fixed length per line; skips the syllable estimate
 * @param {number} [options.syllablesPerBeat] singing density (default 2)
 * @param {"beat"|"half_bar"|"bar"|"none"} [options.quantize] grid to snap durations to (default "beat")
 * @returns {{ slides: object[], meta: object, totalBeats: number, warnings: string[] }}
 */
export function planSong({ text, bpm = 0, beatsPerBar = 4, linesPerSlide = 1, beatsPerLine = 0, syllablesPerBeat = 2, quantize = "beat" } = {}) {
    const { sections, meta } = parseLyrics(text)
    const warnings = []

    if (!sections.length) throw new Error("No se encontró ninguna letra. Envía el texto con las líneas de la canción.")

    // tempo can also come from a "BPM=90" line in the lyrics
    const metaBpm = Number(meta.bpm || meta.tempo || 0)
    const tempo = Number(bpm) || metaBpm || 0
    if (!tempo) warnings.push("Sin BPM: las diapositivas no avanzarán solas y la transición usará una duración fija.")

    const quantum = quantize === "bar" ? beatsPerBar : quantize === "half_bar" ? beatsPerBar / 2 : quantize === "none" ? 0 : 1

    const perSlide = Math.max(1, Math.floor(linesPerSlide) || 1)
    const slides = []
    let totalBeats = 0

    for (const section of sections) {
        // an empty labelled section ("[Instrumental]") still deserves a slide
        const chunks = section.lines.length ? chunk(section.lines, perSlide) : [[]]

        chunks.forEach((lines, index) => {
            const slide = { lines }

            // only the section's first slide carries the label
            if (index === 0 && section.label) {
                slide.group = section.label
                if (section.globalGroup) slide.globalGroup = section.globalGroup
            }

            const beats = slideBeats(lines)
            if (beats > 0) {
                slide.beats = beats
                totalBeats += beats
            }

            slides.push(slide)
        })
    }

    return { slides, meta, bpm: tempo, totalBeats: Number(totalBeats.toFixed(3)), warnings }

    function slideBeats(lines) {
        if (beatsPerLine > 0) return quantizeBeats(beatsPerLine * Math.max(1, lines.length), quantum)
        if (!lines.length) return quantizeBeats(beatsPerBar, quantum) // instrumental: one bar

        const syllables = lines.reduce((sum, line) => sum + countSyllables(line), 0)
        const raw = syllables / Math.max(0.25, syllablesPerBeat)
        return quantizeBeats(raw, quantum)
    }
}

function chunk(items, size) {
    const out = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

/** Seconds a beat count takes at the given tempo (mirrors the FreeShow side). */
export function beatsToSeconds(beats, bpm) {
    if (!bpm || bpm <= 0) return 0
    return (beats * 60) / bpm
}
