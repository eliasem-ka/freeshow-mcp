// Helpers para resolver referencias bíblicas en lenguaje humano (español) hacia
// los datos que espera la API de FreeShow: número de libro, capítulo y la lista
// de versículos, además de mapear un código de versión ("RV60") a su id.

// --- libros (nombre normalizado -> número canónico) ------------------------

const BOOKS = [
    [1, ["genesis", "gn", "gen"]],
    [2, ["exodo", "ex", "exo"]],
    [3, ["levitico", "lv", "lev"]],
    [4, ["numeros", "nm", "num"]],
    [5, ["deuteronomio", "dt", "deu"]],
    [6, ["josue", "jos"]],
    [7, ["jueces", "jue", "jc"]],
    [8, ["rut", "rt"]],
    [9, ["1 samuel", "1 sam", "1 s"]],
    [10, ["2 samuel", "2 sam", "2 s"]],
    [11, ["1 reyes", "1 re", "1 r"]],
    [12, ["2 reyes", "2 re", "2 r"]],
    [13, ["1 cronicas", "1 cron", "1 cr"]],
    [14, ["2 cronicas", "2 cron", "2 cr"]],
    [15, ["esdras", "esd"]],
    [16, ["nehemias", "neh"]],
    [17, ["ester", "est"]],
    [18, ["job"]],
    [19, ["salmos", "salmo", "sal", "sl"]],
    [20, ["proverbios", "prov", "pr"]],
    [21, ["eclesiastes", "ecl", "ec"]],
    [22, ["cantares", "cantar de los cantares", "cantar", "cnt", "cant"]],
    [23, ["isaias", "is"]],
    [24, ["jeremias", "jer"]],
    [25, ["lamentaciones", "lam"]],
    [26, ["ezequiel", "ez", "eze"]],
    [27, ["daniel", "dn", "dan"]],
    [28, ["oseas", "os"]],
    [29, ["joel", "jl"]],
    [30, ["amos", "am"]],
    [31, ["abdias", "abd"]],
    [32, ["jonas", "jon"]],
    [33, ["miqueas", "miq", "mi"]],
    [34, ["nahum", "nah"]],
    [35, ["habacuc", "hab"]],
    [36, ["sofonias", "sof"]],
    [37, ["hageo", "hag"]],
    [38, ["zacarias", "zac"]],
    [39, ["malaquias", "mal"]],
    [40, ["mateo", "mt", "mat"]],
    [41, ["marcos", "mr", "mar", "mc"]],
    [42, ["lucas", "lc", "luc"]],
    [43, ["juan", "jn"]],
    [44, ["hechos", "hch", "hec"]],
    [45, ["romanos", "ro", "rom"]],
    [46, ["1 corintios", "1 cor", "1 co"]],
    [47, ["2 corintios", "2 cor", "2 co"]],
    [48, ["galatas", "gal", "ga"]],
    [49, ["efesios", "ef", "efe"]],
    [50, ["filipenses", "fil", "flp"]],
    [51, ["colosenses", "col"]],
    [52, ["1 tesalonicenses", "1 tes", "1 ts"]],
    [53, ["2 tesalonicenses", "2 tes", "2 ts"]],
    [54, ["1 timoteo", "1 tim", "1 ti"]],
    [55, ["2 timoteo", "2 tim", "2 ti"]],
    [56, ["tito", "tit"]],
    [57, ["filemon", "flm"]],
    [58, ["hebreos", "heb", "he"]],
    [59, ["santiago", "stg", "snt"]],
    [60, ["1 pedro", "1 ped", "1 p"]],
    [61, ["2 pedro", "2 ped", "2 p"]],
    [62, ["1 juan", "1 jn"]],
    [63, ["2 juan", "2 jn"]],
    [64, ["3 juan", "3 jn"]],
    [65, ["judas", "jud"]],
    [66, ["apocalipsis", "apoc", "ap"]],
]

const BOOK_MAP = {}
for (const [num, names] of BOOKS) for (const n of names) BOOK_MAP[n] = num

const DIACRITICS = /[̀-ͯ]/g

/** Quita acentos, pasa a minúsculas y normaliza los prefijos ordinales (2da -> 2, II -> 2). */
export function normalizeBookName(input) {
    let s = String(input || "")
        .normalize("NFD")
        .replace(DIACRITICS, "")
        .toLowerCase()
        .replace(/\./g, " ")
        .replace(/\s+/g, " ")
        .trim()

    // "san juan" -> "juan", "evangelio de/según juan" -> "juan"
    s = s
        .replace(/^san\s+/, "")
        .replace(/^evangelio (de |segun )?/, "")
        .replace(/\s+/g, " ")
        .trim()

    // prefijos ordinales a número árabe ("2da" -> "2", "ii" -> "2")
    s = s
        .replace(/^(1ra|1ro|1era|1er|1a|1o|1°|primera|primer|primero|i)\s+/, "1 ")
        .replace(/^(2da|2do|2a|2o|2°|segunda|segundo|ii)\s+/, "2 ")
        .replace(/^(3ra|3ro|3a|3o|3°|tercera|tercero|iii)\s+/, "3 ")
        // "1 de corintios" -> "1 corintios" (no toca "cantar de los cantares")
        .replace(/^(\d) de\s+/, "$1 ")
        .replace(/\s+/g, " ")
        .trim()

    return s
}

/** Devuelve el número de libro (1-66) o null si no se reconoce. */
export function bookNameToNumber(input) {
    const n = BOOK_MAP[normalizeBookName(input)]
    return n ?? null
}

// --- versículos ------------------------------------------------------------

/** "17-20" -> [17,18,19,20]; "12,13" -> [12,13]; 18 -> [18]. */
export function expandVerses(v) {
    if (Array.isArray(v)) return v.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n))
    const out = []
    String(v)
        .split(/[,\s]+/)
        .filter(Boolean)
        .forEach((tok) => {
            const m = tok.match(/^(\d+)\s*[-–]\s*(\d+)$/)
            if (m) {
                for (let n = +m[1]; n <= +m[2]; n++) out.push(n)
            } else {
                const n = parseInt(tok, 10)
                if (!isNaN(n)) out.push(n)
            }
        })
    return out
}

// --- versiones -------------------------------------------------------------

const norm = (s) =>
    String(s || "")
        .normalize("NFD")
        .replace(DIACRITICS, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")

// alias comunes (lo que la gente escribe -> abreviatura/nombre real del .fsb)
const VERSION_ALIASES = {
    RV60: "RVR1960",
    RVR60: "RVR1960",
    RV1960: "RVR1960",
    REINAVALERA1960: "RVR1960",
    REINAVALERA: "RVR1960",
}

/**
 * Encuentra la escritura cuyo código/nombre coincide con `query` dentro de la
 * lista devuelta por get_scriptures ([{id,name,abbreviation,...}]).
 */
export function matchVersion(query, scriptures) {
    const q = norm(query)
    const qa = VERSION_ALIASES[q] ? norm(VERSION_ALIASES[q]) : q
    const candidates = (scriptures || []).map((s) => ({ ...s, _abbr: norm(s.abbreviation), _name: norm(s.name) }))

    // 1) abreviatura exacta (con alias)
    let m = candidates.find((s) => s._abbr === q || s._abbr === qa)
    if (m) return m
    // 2) nombre exacto
    m = candidates.find((s) => s._name === qa || s._name === q)
    if (m) return m
    // 3) contención (abreviatura o nombre), evitando coincidencias triviales muy cortas
    m = candidates.find((s) => {
        if (s._abbr && (s._abbr.includes(qa) || qa.includes(s._abbr))) return true
        if (s._name && qa.length >= 2 && s._name.includes(qa)) return true
        return false
    })
    return m || null
}
