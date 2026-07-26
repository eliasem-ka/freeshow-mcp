// Reader for ProPresenter 7 ".pro" files.
//
// PP7 stores presentations as protobuf, not JSON — FreeShow's own importer
// assumes JSON and silently yields an empty show for these files, which is why
// this lives here instead of going through the app's Import menu.
//
// No .proto schema is needed: the wire format is self-describing enough to walk
// generically, and the lyrics are RTF blobs sitting at a stable field path.

/// PROTOBUF (generic wire walker) ///

function readVarint(buf, pos) {
    let result = 0n
    let shift = 0n
    while (pos < buf.length) {
        const b = buf[pos++]
        result |= BigInt(b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7n
        if (shift > 70n) throw new Error("varint demasiado largo")
    }
    return [result, pos]
}

/** Decode one message level. Throws if the bytes are not valid wire format. */
function parseMessage(buf) {
    const fields = []
    let pos = 0
    while (pos < buf.length) {
        const [key, p1] = readVarint(buf, pos)
        pos = p1
        const fieldNo = Number(key >> 3n)
        const wire = Number(key & 7n)
        if (fieldNo === 0) throw new Error("campo 0")

        if (wire === 0) {
            const [, p] = readVarint(buf, pos)
            pos = p
            fields.push({ fieldNo, wire })
        } else if (wire === 1) {
            if (pos + 8 > buf.length) throw new Error("fin inesperado (64)")
            pos += 8
            fields.push({ fieldNo, wire })
        } else if (wire === 2) {
            const [lenB, p] = readVarint(buf, pos)
            const len = Number(lenB)
            pos = p
            if (pos + len > buf.length) throw new Error("fin inesperado (bytes)")
            fields.push({ fieldNo, wire, bytes: buf.subarray(pos, pos + len) })
            pos += len
        } else if (wire === 5) {
            if (pos + 4 > buf.length) throw new Error("fin inesperado (32)")
            pos += 4
            fields.push({ fieldNo, wire })
        } else throw new Error("wire type inválido: " + wire)
    }
    return fields
}

function isMessage(buf) {
    try {
        return parseMessage(buf).length > 0
    } catch {
        return false
    }
}

/** Collect every RTF blob together with the field path it was found at. */
export function collectRtf(buf, path = [], out = [], depth = 0) {
    if (depth > 25) return out

    let fields
    try {
        fields = parseMessage(buf)
    } catch {
        return out
    }

    for (const f of fields) {
        if (f.wire !== 2) continue
        const s = f.bytes.toString("latin1")
        if (s.startsWith("{\\rtf")) {
            out.push({ path: [...path, f.fieldNo].join("."), rtf: s })
        } else if (f.bytes.length > 2 && isMessage(f.bytes)) {
            collectRtf(f.bytes, [...path, f.fieldNo], out, depth + 1)
        }
    }
    return out
}

/// RTF ///

/** Convert one RTF blob to plain text. Deliberately minimal — these blobs only
 *  ever carry lyric lines, never tables or images. */
export function rtfToText(rtf) {
    let t = rtf
    // ignorable destinations (\*\... ) and the header tables
    t = t.replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
    t = t.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info)[^]*?\}\s*(?=\{|\\)/g, "")
    // line breaks
    t = t.replace(/\\pard?\b/g, "\n").replace(/\\line\b/g, "\n")
    // escapes: \uNNNN unicode and \'hh codepage bytes
    t = t.replace(/\\u(-?\d+)\s?\??/g, (_, n) => String.fromCharCode(((+n) + 65536) % 65536))
    t = t.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => Buffer.from(h, "hex").toString("latin1"))
    // whatever control words remain
    t = t.replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    t = t.replace(/[{}]/g, "")

    return t
        .replace(/\r/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
}

/// PRESENTATION ///

// Top-level repeated field holding the cues — one entry per slide, in order.
const CUE_FIELD = 13

/**
 * Read a .pro file into ordered slides.
 *
 * Slides come from the cue list, one slide per cue. This matters: a cue's RTF
 * blobs are per-style duplicates of the same text, so they are deduplicated
 * WITHIN a cue — but never across cues, because worship songs repeat lines on
 * purpose ("que volverá, que volverá") and merging them would drop slides.
 *
 * @param {Buffer} buffer contents of the .pro file
 * @returns {{ slides: {lines: string[]}[], cues: number, emptyCues: number }}
 */
export function parseProFile(buffer) {
    let top
    try {
        top = parseMessage(buffer)
    } catch {
        return { slides: [], cues: 0, emptyCues: 0 }
    }

    const cues = top.filter((f) => f.fieldNo === CUE_FIELD && f.wire === 2)
    const slides = []
    let emptyCues = 0

    for (const cue of cues) {
        const textos = [...new Set(collectRtf(cue.bytes).map((b) => rtfToText(b.rtf)).filter(Boolean))]
        if (!textos.length) {
            emptyCues++
            continue
        }
        // a cue occasionally carries more than one distinct box (e.g. a stage
        // note); joining keeps every line rather than silently picking one
        slides.push({ lines: textos.join("\n").split("\n") })
    }

    return { slides, cues: cues.length, emptyCues }
}

/** Song title from the file name, dropping the extension and tidying spacing. */
export function titleFromFileName(fileName) {
    return fileName
        .replace(/\.pro$/i, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/** Render parsed slides as create_lyrics-style plain text (blank line = slide). */
export function slidesToPlainText(slides) {
    return slides.map((s) => s.lines.join("\n")).join("\n\n")
}
