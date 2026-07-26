// Turns raw parsed .pro presentations into a migration plan: metadata pulled
// out, filler slides dropped, and duplicates grouped.
//
// This module only decides. It never writes to FreeShow, so the plan can be
// reviewed before anything is created.

/// METADATA ///

// Label slides ProPresenter users add by hand at the start of a song.
const LABELS = {
    "título": "title",
    titulo: "title",
    artista: "artist",
    autor: "author",
    nota: "note"
}

const LABEL_RE = /^([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,12})\s*:\s*(.*)$/

// Parentheticals in file names that are not an artist.
const NOT_ARTIST =
    /^(\d+|coro|coros|nueva|nuevo|medley|cadena|popurr[ií]|en vivo|ac[uú]stico|versi[oó]n|version|letra|pista|instrumental|completa?|corregida?|hombres|mujeres|espa[nñ]ol|ingl[eé]s|feat\.?|ft\.?|remix|live|d[uú]o|bis)$/i

/** Split "Nombre (Artista)" into its parts, ignoring copy/variant suffixes. */
export function parseFileName(fileName) {
    let base = fileName.replace(/\.pro$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim()

    let artist = ""
    const extras = []

    // walk parentheticals right-to-left; the first artist-looking one wins
    const parts = [...base.matchAll(/\(([^)]*)\)/g)]
    for (const m of parts) {
        const value = m[1].trim()
        if (!value) continue
        if (NOT_ARTIST.test(value)) extras.push(value)
        else if (!artist) artist = value
        else extras.push(value)
    }

    const title = base.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
    return { title: title || base, artist, extras }
}

/**
 * Harvest "Título:" / "Artista:" slides into metadata and drop them.
 * These are authoritative when present — the file name is only a fallback.
 */
export function extractMetaSlides(slides) {
    const meta = {}
    const kept = []
    const dropped = []

    slides.forEach((slide, index) => {
        const labelLines = []
        const otherLines = []

        for (const line of slide.lines) {
            const m = line.match(LABEL_RE)
            const key = m && LABELS[m[1].toLowerCase()]
            if (key) {
                labelLines.push(line)
                const value = m[2].trim()
                if (value && !meta[key]) meta[key] = value
            } else otherLines.push(line)
        }

        // a slide that was nothing but labels is filler, not lyrics
        if (labelLines.length && !otherLines.length) {
            dropped.push({ index, reason: "etiqueta", text: slide.lines.join(" / ") })
            return
        }
        // labels mixed with lyrics: keep the lyrics, drop the label lines
        kept.push(labelLines.length ? { lines: otherLines } : slide)
    })

    return { meta, slides: kept, dropped }
}

/// SLIDE CLEANING ///

/** Tidy a lyric line without changing its words. */
export function normalizeLine(line) {
    return line
        .replace(/\u00a0/g, " ") // non-breaking space
        .replace(/[\u201C\u201D]/g, '"') // smart double quotes
        .replace(/[\u2018\u2019]/g, "'") // smart single quotes
        .replace(/\s*\.{3,}\s*$/, "")
        .replace(/\s+/g, " ")
        .trim()
}

/** Is this line shouting? Used to flag songs worth a manual pass, not to rewrite. */
export function isAllCaps(text) {
    const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "")
    if (letters.length < 8) return false
    return letters === letters.toUpperCase()
}

/**
 * Drop filler slides and tidy the rest.
 * Repeated slides are preserved: worship songs repeat lines on purpose.
 */
export function cleanSlides(slides) {
    const kept = []
    const dropped = []

    slides.forEach((slide, index) => {
        const lines = slide.lines.map(normalizeLine).filter(Boolean)
        if (!lines.length) {
            dropped.push({ index, reason: "vacía", text: "" })
            return
        }

        // slides that are only punctuation or a lone separator carry nothing
        const letters = lines.join("").replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/g, "")
        if (!letters) {
            dropped.push({ index, reason: "sin texto", text: lines.join(" / ") })
            return
        }

        kept.push({ lines })
    })

    return { slides: kept, dropped }
}

/// DUPLICATES ///

/** Fold accents/case/punctuation so spelling variants compare equal. */
export function normalizeKey(text) {
    return (text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // combining diacritics
        .toLowerCase()
        .replace(/[\u2018\u2019'`]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/** Artist names are typed inconsistently ("Abel Zavala"/"Abel Zabala"). */
export function normalizeArtist(artist) {
    return normalizeKey(artist)
        .replace(/\bzabala\b/g, "zavala")
        .replace(/\bmarcos barrientos\b/g, "marco barrientos")
}

/**
 * Are these two artist strings the same person?
 *
 * Names in this library are hand-typed and full of near-misses — "Miel San
 * Marcod", "CRISTIN D CLARIO" vs "Christine D'Clario" — so an exact key match
 * splits one artist into several and defeats the whole variant rule.
 */
export function sameArtist(a, b) {
    const na = normalizeArtist(a)
    const nb = normalizeArtist(b)
    if (!na || !nb) return false
    if (na === nb) return true
    if (na.startsWith(nb) || nb.startsWith(na)) return true
    return editSimilarity(na, nb) >= 0.82
}

/** Character-level closeness, 0..1. Used only on short strings like names. */
function editSimilarity(a, b) {
    const long = a.length >= b.length ? a : b
    const short = a.length >= b.length ? b : a
    if (!long.length) return 1
    return (long.length - editDistance(long, short)) / long.length
}

function editDistance(a, b) {
    const costs = []
    for (let i = 0; i <= a.length; i++) {
        let last = i
        for (let j = 0; j <= b.length; j++) {
            if (i === 0) costs[j] = j
            else if (j > 0) {
                let next = costs[j - 1]
                if (a[i - 1] !== b[j - 1]) next = Math.min(next, last, costs[j]) + 1
                costs[j - 1] = last
                last = next
            }
        }
        if (i > 0) costs[b.length] = last
    }
    return costs[b.length]
}

/** Word-overlap similarity, 0..1. Cheap and stable for comparing whole songs. */
export function similarity(a, b) {
    const setA = new Set(normalizeKey(a).split(" ").filter(Boolean))
    const setB = new Set(normalizeKey(b).split(" ").filter(Boolean))
    if (!setA.size || !setB.size) return 0
    let shared = 0
    for (const w of setA) if (setB.has(w)) shared++
    return shared / new Set([...setA, ...setB]).size
}

const SAME_SONG = 0.8

/**
 * Group entries that are the same song.
 *
 * Same title but a different artist stays separate — those are genuine
 * variants the user wants to keep. Everything else is compared on its lyrics
 * before being called a duplicate, so two different songs that happen to share
 * a title are not merged.
 *
 * @param {{id:string,title:string,artist:string,slides:{lines:string[]}[]}[]} entries
 * @returns {{keep:object, drop:object[], reason:string}[]}
 */
export function groupDuplicates(entries) {
    const byTitle = new Map()
    for (const e of entries) {
        const key = normalizeKey(e.title)
        if (!byTitle.has(key)) byTitle.set(key, [])
        byTitle.get(key).push(e)
    }

    const groups = []
    for (const [, list] of byTitle) {
        // cluster by artist first: different artists are variants, never
        // duplicates. Clustering (not exact keys) because the names are
        // hand-typed and full of near-misses.
        const named = list.filter((e) => e.artist)
        const unknown = list.filter((e) => !e.artist)

        const clusters = []
        for (const e of named) {
            const match = clusters.find((c) => sameArtist(c[0].artist, e.artist))
            if (match) match.push(e)
            else clusters.push([e])
        }

        // an entry with no artist joins a named cluster only if the lyrics match
        for (const e of unknown) {
            const match = clusters.find((c) => similarity(lyricsOf(e), lyricsOf(c[0])) >= SAME_SONG)
            if (match) match.push(e)
            else clusters.push([e])
        }

        for (const cluster of clusters) groups.push(...resolveGroup(cluster))
    }

    return groups
}

function lyricsOf(entry) {
    return entry.slides.map((s) => s.lines.join(" ")).join(" ")
}

// Above this size gap the two files are probably not the same arrangement —
// often a medley versus the plain song — so they get flagged, not merged.
const SIZE_GAP = 1.8

/** Within one title+artist cluster, split by lyrics and pick a winner per song. */
function resolveGroup(group) {
    if (group.length === 1) return [{ keep: group[0], drop: [], reason: "único", review: false }]

    const buckets = []
    for (const e of group) {
        const match = buckets.find((b) => similarity(lyricsOf(b[0]), lyricsOf(e)) >= SAME_SONG)
        if (match) match.push(e)
        else buckets.push([e])
    }

    return buckets.map((bucket) => {
        if (bucket.length === 1) return { keep: bucket[0], drop: [], reason: "único", review: false }

        // the most complete version wins the lyrics...
        const sorted = [...bucket].sort((a, b) => b.slides.length - a.slides.length || lyricsOf(b).length - lyricsOf(a).length)
        const keep = { ...sorted[0] }
        const rest = sorted.slice(1)

        // ...but metadata is merged, so dropping a copy never loses the artist.
        // Without this the "most slides" rule quietly discards the only file
        // that was actually attributed.
        const heredado = []
        for (const key of ["artist", "author"]) {
            if (keep[key]) continue
            const donor = rest.find((e) => e[key])
            if (donor) {
                keep[key] = donor[key]
                heredado.push(`${key} de ${donor.file}`)
            }
        }

        const biggest = sorted[0].slides.length
        const smallest = sorted[sorted.length - 1].slides.length
        const gap = smallest > 0 ? biggest / smallest : Infinity
        const review = gap >= SIZE_GAP

        return {
            keep,
            drop: rest,
            review,
            reason: review
                ? `revisar: tamaños muy distintos (${sorted.map((e) => e.slides.length).join(" vs ")} slides) — puede ser un popurrí, no una copia`
                : `duplicado (${bucket.length} copias, se conserva la más completa)`,
            heredado
        }
    })
}
