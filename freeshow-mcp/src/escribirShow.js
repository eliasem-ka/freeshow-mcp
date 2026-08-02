// Write .show files straight to disk, without going through FreeShow.
//
// Persisting through the app means calling its save, which writes everything
// currently in showsCache. That cache degrades under bulk API use, and saving
// then overwrites good files with blanked ones — it destroyed lyrics twice.
// A .show file is just JSON, so writing it here removes the app from the write
// path entirely. FreeShow picks the file up the next time it loads the show.
//
// FreeShow must be CLOSED while these run, or its own save will overwrite them.

import fs from "fs"
import path from "path"

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/** Short id in the same shape FreeShow's uid() produces. */
export function uid(len = 11) {
    let out = ""
    for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    return out
}

/// TYPOGRAPHY (mirrors the concert look built in songShow.ts) ///

const LINE_STYLES = {
    uniforme: [{ fontSize: 100, weight: "bold", shadow: true }],
    concierto: [
        { fontSize: 110, weight: 700, letterSpacing: 1, shadow: true },
        { fontSize: 78, weight: 300, opacity: 0.82, shadow: true }
    ]
}

function lineCss(style, textColor) {
    const css = [`font-size: ${style.fontSize ?? 100}px`]
    if (style.weight !== undefined) css.push(`font-weight: ${style.weight}`)
    if (textColor) css.push(`color: ${textColor}`)
    else if (style.color) css.push(`color: ${style.color}`)
    if (style.opacity !== undefined) css.push(`opacity: ${style.opacity}`)
    if (style.letterSpacing !== undefined) css.push(`letter-spacing: ${style.letterSpacing}px`)
    // a shadow only muddies dark text on a light band
    if (style.shadow && !textColor) css.push("text-shadow: 0 4px 12px rgb(0 0 0 / 0.5)")
    return css.join(";") + ";"
}

const REVEAL_KEYFRAMES = { fade: "fsRevealFade", rise: "fsRevealRise", blur: "fsRevealBlur" }

/**
 * Split a line into one chunk per word, each with its own animation delay.
 * Whitespace rides with its word so the text still joins back to the original,
 * and blanks reuse the previous delay instead of spending a step.
 */
function revealChunks(text, baseCss, reveal, startUnit) {
    const chunks = []
    let unit = startUnit
    for (const piece of text.match(/\S+\s*/g) || []) {
        const blank = !piece.trim()
        const delay = Math.max(0, unit - (blank ? 1 : 0)) * reveal.stepMs
        let css = baseCss + `animation: ${REVEAL_KEYFRAMES[reveal.motion]} ${reveal.durationMs}ms ease-out ${Math.round(delay)}ms both;`
        if (reveal.motion === "rise") css += "display: inline-block;"
        chunks.push({ value: piece, style: css })
        if (!blank) unit++
    }
    if (!chunks.length) chunks.push({ value: text, style: baseCss })
    return { chunks, units: unit - startUnit }
}

/// BUILD ///

/**
 * Build the [id, show] pair FreeShow stores in a .show file.
 *
 * @param {object} o
 * @param {string} o.name
 * @param {{lines:string[]}[]} o.slides
 * @param {object} [o.meta]           title / artist / key
 * @param {string} [o.lineStyle]      "uniforme" | "concierto"
 * @param {string} [o.textColor]
 * @param {object} [o.reveal]         { motion, stepMs, durationMs }
 * @param {string} [o.overlayId]      drawn on every slide
 * @param {object} [o.textBox]        { left, top, width, height }
 * @param {string} [o.itemStyle]      appended to each text box, e.g. a rotation
 */
export function buildShow(o) {
    const showId = o.id || uid()
    const layoutId = uid()
    const styles = LINE_STYLES[o.lineStyle || "uniforme"] || LINE_STYLES.uniforme
    const box = o.textBox || { left: 50, top: 88, width: 1820, height: 904 }

    const slides = {}
    const layoutSlides = []

    for (const src of o.slides) {
        const slideId = uid()
        let unit = 0

        const lines = (src.lines.length ? src.lines : [""]).map((text, i) => {
            const style = styles[Math.min(i, styles.length - 1)] || {}
            const base = lineCss(style, o.textColor)
            if (!o.reveal) return { align: "", text: [{ value: text, style: base }] }
            const r = revealChunks(text, base, o.reveal, unit)
            unit += r.units
            return { align: "", text: r.chunks }
        })

        slides[slideId] = {
            group: null,
            color: null,
            settings: {},
            notes: "",
            items: [
                {
                    type: "text",
                    style: `top:${box.top}px;left:${box.left}px;height:${box.height}px;width:${box.width}px;${o.itemStyle || ""}`,
                    textFit: "shrinkToFit",
                    lines
                }
            ]
        }

        const entry = { id: slideId, transition: { type: "fade", duration: 500, easing: "sine" } }
        if (o.overlayId) entry.overlays = [o.overlayId]
        layoutSlides.push(entry)
    }

    const show = {
        name: o.name,
        private: false,
        category: null,
        settings: { activeLayout: layoutId, template: null },
        timestamps: { created: o.created || Date.now(), modified: null, used: null },
        quickAccess: {},
        meta: o.meta || {},
        slides,
        layouts: { [layoutId]: { name: "Estándar", notes: "", slides: layoutSlides } },
        media: {}
    }

    return [showId, show]
}

/** Write a show to the Shows folder. FreeShow must be closed. */
export function writeShow(showsDir, id, show) {
    const file = path.join(showsDir, `${show.name}.show`)
    fs.writeFileSync(file, JSON.stringify([id, show]), "utf8")
    return file
}
