// Conservative Spanish orthography pass for migrated lyrics.
//
// GUIDING RULE: only fix what cannot be wrong. Every rule here either follows
// from Spanish spelling with no exceptions, or restores an accent on a word
// whose unaccented form is not itself a valid Spanish word.
//
// Deliberately NOT handled — these need meaning, and guessing would corrupt
// the lyric: mas/más, el/él, tu/tú, mi/mí, si/sí, se/sé, de/dé, te/té,
// esta/está, como/cómo, cuando/cuándo, donde/dónde, que/qué, quien/quién,
// aun/aún, solo/sólo. Songs containing them are flagged instead.

/// RULES THAT CANNOT BE WRONG ///

// Spanish monosyllables take no accent, and "ti" never does.
const NEVER_ACCENTED = {
    tí: "ti",
    fé: "fe",
    dió: "dio",
    vió: "vio",
    fué: "fue",
    fuí: "fui",
    vé: "ve",
    dí: "di",
    ví: "vi"
}

/// ACCENTS WHOSE BARE FORM IS NOT A WORD ///

// Restoring these is safe: written without the accent they are not Spanish.
const MISSING_ACCENT = {
    // -ción / -sión
    adoracion: "adoración",
    bendicion: "bendición",
    cancion: "canción",
    compasion: "compasión",
    correccion: "corrección",
    creacion: "creación",
    devocion: "devoción",
    exaltacion: "exaltación",
    generacion: "generación",
    liberacion: "liberación",
    nacion: "nación",
    oracion: "oración",
    pasion: "pasión",
    peticion: "petición",
    proclamacion: "proclamación",
    redencion: "redención",
    resurreccion: "resurrección",
    salvacion: "salvación",
    sanacion: "sanación",
    unccion: "unción",
    uncion: "unción",
    vision: "visión",
    // sustantivos comunes
    angel: "ángel",
    angeles: "ángeles",
    corazon: "corazón",
    espiritu: "espíritu",
    espiritus: "espíritus",
    musica: "música",
    oceano: "océano",
    perdon: "perdón",
    razon: "razón",
    sion: "Sión",
    // adverbios y adjetivos
    ademas: "además",
    alli: "allí",
    aqui: "aquí",
    asi: "así",
    atras: "atrás",
    dias: "días",
    jamas: "jamás",
    mia: "mía",
    mias: "mías",
    quiza: "quizá",
    tambien: "también",
    ultima: "última",
    ultimas: "últimas",
    ultimo: "último",
    ultimos: "últimos",
    unica: "única",
    unicas: "únicas",
    unico: "único",
    unicos: "únicos",
    // verbos frecuentes en alabanza
    alabare: "alabaré",
    cantare: "cantaré",
    dare: "daré",
    dire: "diré",
    estare: "estaré",
    ire: "iré",
    sere: "seré",
    vendra: "vendrá",
    vivire: "viviré",
    // nombres propios: nunca van en minúscula, y al plegar un título en
    // mayúsculas a minúsculas se perderían si no están acá
    jesus: "Jesús",
    jesús: "Jesús",
    jesucristo: "Jesucristo",
    cristo: "Cristo",
    jehova: "Jehová",
    jehová: "Jehová",
    israel: "Israel",
    maria: "María",
    espiritusanto: "Espíritu Santo"
}

/// AMBIGUOUS — flagged, never touched ///

const AMBIGUOUS = /\b(mas|el|tu|mi|si|se|de|te|esta|estas|como|cuando|donde|que|quien|aun|solo|esa|ese)\b/i

/// APPLY ///

function fixWord(word) {
    const bare = word.toLowerCase()
    const target = NEVER_ACCENTED[bare] || MISSING_ACCENT[bare]
    if (!target) return null

    // keep the original casing shape
    if (word === word.toUpperCase() && word.length > 1) return target.toUpperCase()
    if (word[0] === word[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1)
    return target
}

/**
 * Apply the safe corrections to one line.
 * @returns {{ text: string, changes: {from:string,to:string}[] }}
 */
export function correctLine(line) {
    const changes = []
    const text = line.replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, (word) => {
        const fixed = fixWord(word)
        if (!fixed || fixed === word) return word
        changes.push({ from: word, to: fixed })
        return fixed
    })
    return { text, changes }
}

/** Uppercase the first letter of a line, leaving the rest alone. */
export function capitalizeFirst(line) {
    if (!line) return line
    const i = line.search(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]/)
    if (i < 0) return line
    // skip opening punctuation
    let j = i
    while (j < line.length && (line[j] === "¿" || line[j] === "¡")) j++
    if (j >= line.length) return line
    return line.slice(0, j) + line[j].toUpperCase() + line.slice(j + 1)
}

/**
 * Correct a whole song.
 *
 * Only the first line of each slide is capitalised: continuation lines often
 * start mid-sentence, and forcing a capital there would be wrong.
 *
 * @param {{lines:string[]}[]} slides
 * @param {{capitalize?:boolean}} [options]
 */
export function correctSlides(slides, options = {}) {
    const capitalize = options.capitalize !== false
    const changes = []
    let ambiguousLines = 0

    const corrected = slides.map((slide) => {
        const lines = slide.lines.map((line, i) => {
            const res = correctLine(line)
            changes.push(...res.changes)
            let out = res.text
            if (capitalize && i === 0) out = capitalizeFirst(out)
            if (AMBIGUOUS.test(out)) ambiguousLines++
            return out
        })
        return { lines }
    })

    return { slides: corrected, changes, ambiguousLines }
}

/**
 * Tidy a title. All-caps titles ("A EL ALTO Y SUBLIME") are shouted file names
 * rather than a style choice, so they get folded to sentence case and then run
 * through the same safe corrections.
 */
export function correctTitle(title) {
    if (!title) return title
    const letters = title.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "")
    let out = title
    if (letters.length >= 4 && letters === letters.toUpperCase()) {
        out = title.toLowerCase()
    }
    out = correctLine(out).text
    return capitalizeFirst(out).replace(/\s+/g, " ").trim()
}

/** Was the source shouting? Worth flagging; we do not rewrite it. */
export function isShouty(slides) {
    const text = slides.flatMap((s) => s.lines).join(" ")
    const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "")
    if (letters.length < 20) return false
    return letters === letters.toUpperCase()
}
