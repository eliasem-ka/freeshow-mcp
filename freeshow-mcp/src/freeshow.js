// Thin client over FreeShow's REST API (Bitfocus Companion / "API" listener).
//
// Enable it in FreeShow: Settings -> Connections -> turn on "API".
// Defaults: WebSocket 5505, REST 5506 (this client uses REST).
//
// All control happens by POSTing JSON `{ action, ...params }` to http://host:port/
// - "get_*" actions return JSON data (FreeShow waits up to ~10s and replies).
// - every other action replies 204 No Content on success.

const HOST = process.env.FREESHOW_HOST || "127.0.0.1"
const PORT = Number(process.env.FREESHOW_REST_PORT || 5506)
export const BASE_URL = `http://${HOST}:${PORT}/`

const CONNECT_HINT =
    `No se pudo conectar con FreeShow en ${BASE_URL}. ` +
    `Verifica que: (1) FreeShow esté abierto, (2) la API esté activada en ` +
    `Configuración → Conexiones → "API", y (3) el puerto REST sea ${PORT} ` +
    `(WebSocket por defecto 5505 → REST 5506). Puedes cambiarlo con la variable ` +
    `de entorno FREESHOW_REST_PORT.`

/**
 * Send an action to FreeShow and return the parsed response.
 * @param {string} action - FreeShow API action id (e.g. "next_slide", "get_shows").
 * @param {object} [params] - Extra fields merged into the payload.
 * @returns {Promise<any>} Parsed JSON for get_* actions, or { ok: true } for triggers.
 */
export async function callAction(action, params = {}) {
    const body = JSON.stringify({ action, ...params })

    let res
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        res = await fetch(BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
        }).finally(() => clearTimeout(timeout))
    } catch (err) {
        if (err?.name === "AbortError") {
            throw new Error(`FreeShow no respondió a tiempo para la acción "${action}". ${CONNECT_HINT}`)
        }
        throw new Error(CONNECT_HINT + `\nDetalle: ${err?.message || err}`)
    }

    if (res.status === 204) return { ok: true, action }

    const text = await res.text()
    if (!text) return { ok: true, action }

    try {
        return JSON.parse(text)
    } catch {
        return { ok: true, action, raw: text }
    }
}

/** Quick connectivity probe used by `--check` and the connection tool. */
export async function ping() {
    const res = await callAction("get_shows")
    const shows = res?.data ?? res
    let count = null
    if (Array.isArray(shows)) count = shows.length
    else if (shows && typeof shows === "object") count = Object.keys(shows).length
    return { connected: true, url: BASE_URL, showsReported: count }
}
