#!/usr/bin/env node
// FreeShow MCP server
// Exposes church-workflow tools (create/edit lyrics, scripture, timers,
// announcements/overlays, variables, and live triggering) on top of
// FreeShow's REST API. See freeshow.js for the transport details.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { callAction, ping, BASE_URL } from "./freeshow.js"
import { bookNameToNumber, expandVerses, matchVersion } from "./scriptureRefs.js"
import { planSong, beatsToSeconds } from "./songBuilder.js"
import { registerThemeTools } from "./themeTools.js"

// --- helpers ---------------------------------------------------------------

/** Wrap any handler so connection/protocol errors become readable tool errors. */
function tool(handler) {
    return async (args) => {
        try {
            const result = await handler(args || {})
            const text = typeof result === "string" ? result : JSON.stringify(result, null, 2)
            return { content: [{ type: "text", text }] }
        } catch (err) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
            }
        }
    }
}

// --- server ----------------------------------------------------------------

const server = new McpServer({ name: "freeshow", version: "1.0.0" })

// === Lectura / descubrimiento ===

server.registerTool(
    "list_shows",
    {
        title: "Listar shows",
        description:
            "Devuelve todos los shows (canciones, listas de versículos, anuncios) cargados en FreeShow, con su id y nombre. " +
            "Úsalo primero para encontrar el id de un show antes de editarlo o presentarlo.",
        inputSchema: {},
    },
    tool(async () => callAction("get_shows")),
)

server.registerTool(
    "get_show",
    {
        title: "Ver show completo",
        description:
            "Obtiene el contenido completo de un show por id: slides, grupos (Verso/Coro), layouts y metadatos. " +
            "Útil para inspeccionar la estructura antes de editar.",
        inputSchema: { id: z.string().describe("Id del show (de list_shows).") },
    },
    tool(async ({ id }) => callAction("get_show", { id })),
)

server.registerTool(
    "read_lyrics",
    {
        title: "Leer letra como texto",
        description:
            "Devuelve la letra/contenido de un show como texto plano (con marcadores de grupo como [Verso], [Coro]). " +
            "Es el paso previo para corregir ortografía o editar: lee con read_lyrics, corrige el texto, y reescribe con edit_lyrics.",
        inputSchema: { id: z.string().describe("Id del show (de list_shows).") },
    },
    tool(async ({ id }) => callAction("get_plain_text", { id })),
)

server.registerTool(
    "get_output",
    {
        title: "Estado de la salida (qué se ve ahora)",
        description: "Devuelve el estado actual de la salida en pantalla: qué slide/fondo/overlay se está mostrando en vivo.",
        inputSchema: {},
    },
    tool(async () => callAction("get_output")),
)

server.registerTool(
    "list_timers",
    {
        title: "Listar contadores/timers",
        description: "Devuelve todos los timers/contadores definidos (cuenta regresiva, reloj, evento) con su id, nombre y estado.",
        inputSchema: {},
    },
    tool(async () => callAction("get_timers")),
)

server.registerTool(
    "list_variables",
    {
        title: "Listar variables",
        description: "Devuelve las variables dinámicas (texto/número) usadas en plantillas y anuncios dinámicos.",
        inputSchema: {},
    },
    tool(async () => callAction("get_variables")),
)

// === Crear / editar contenido ===

server.registerTool(
    "create_lyrics",
    {
        title: "Crear show de letra/canción",
        description:
            "Crea un nuevo show a partir de texto plano. Ideal para canciones, listas de versículos o anuncios.\n\n" +
            "FORMATO del texto:\n" +
            "- Separa cada slide con una LÍNEA EN BLANCO.\n" +
            "- Encabeza una sección con un grupo entre corchetes: [Verso], [Coro], [Puente], [Intro], etc.\n" +
            "- Metadatos opcionales como líneas 'Clave=Valor': Title=, Artist=, Author=, Copyright=, CCLI=, Key=.\n" +
            "- 'x2' al final de una sección la repite.\n\n" +
            "Ejemplo:\n" +
            "Title=Sublime Gracia\\nArtist=John Newton\\n\\n[Verso]\\nSublime gracia del Señor\\nque a un infeliz salvó\\n\\n[Coro]\\nFui ciego mas hoy veo yo",
        inputSchema: {
            name: z.string().describe("Nombre del show (p. ej. el título de la canción)."),
            text: z.string().describe("Contenido en texto plano con el formato descrito (secciones separadas por línea en blanco, grupos entre corchetes)."),
            category: z.string().optional().describe("Categoría/carpeta opcional donde guardarlo (id de categoría)."),
            addToProject: z.boolean().optional().describe("Agregarlo también al proyecto abierto. Por defecto solo queda en la biblioteca."),
            projectId: z.string().optional().describe("Agregarlo a este proyecto en concreto."),
            open: z.boolean().optional().describe("Abrirlo en la app. Por defecto no, para no cambiar lo que el operador tiene en pantalla."),
        },
    },
    tool(async ({ name, text, category, addToProject, projectId, open }) => {
        const params = { text, name }
        if (category) params.category = category
        if (addToProject) params.addToProject = true
        if (projectId) params.projectId = projectId
        if (open) params.open = true
        // el fork devuelve { id, name, project }: el id sirve para aplicarle un tema o presentarlo después
        const res = await callAction("create_show", params)
        const data = res && typeof res === "object" && "data" in res ? res.data : res
        if (data && typeof data.error === "string") throw new Error(data.error)
        return data
    }),
)

server.registerTool(
    "create_song",
    {
        title: "Crear alabanza animada (una diapositiva por línea)",
        description:
            "Crea un show de alabanza a partir de la letra, con UNA DIAPOSITIVA POR LÍNEA y animaciones sincronizadas al tempo.\n\n" +
            "Qué hace con el tempo (bpm):\n" +
            "- Calcula cuánto dura cada línea (estimando sílabas en español) y la ajusta a la rejilla del compás.\n" +
            "- Escribe ese tiempo como avance automático, así la letra pasa sola al ritmo de la canción.\n" +
            "- Deriva la duración de la transición del pulso (p. ej. media negra), para que la animación 'respire' con la música.\n\n" +
            "FORMATO de la letra: una línea por renglón; separa secciones con línea en blanco; " +
            "encabeza secciones con [Verso], [Coro], [Puente], [Instrumental], etc. " +
            "Puedes incluir metadatos como 'Title=', 'Artist=' o 'BPM=' en líneas aparte.\n\n" +
            "Si no indicas 'bpm' el show igual se crea, pero sin avance automático.",
        inputSchema: {
            name: z.string().optional().describe("Nombre del show. Si se omite se usa 'Title=' de la letra."),
            lyrics: z.string().describe("Letra completa, una línea de canto por renglón."),
            bpm: z.number().min(20).max(300).optional().describe("Tempo en pulsos por minuto. También se puede poner 'BPM=' dentro de la letra."),
            beatsPerBar: z.number().int().min(1).max(16).optional().describe("Numerador del compás (4 para 4/4, 3 para 3/4). Por defecto 4."),
            linesPerSlide: z.number().int().min(1).max(10).optional().describe("Líneas por diapositiva. Por defecto 1 (una diapositiva por línea)."),
            beatsPerLine: z.number().min(0.25).max(64).optional().describe("Duración fija por línea en pulsos. Si se indica, ignora la estimación por sílabas."),
            syllablesPerBeat: z.number().min(0.25).max(8).optional().describe("Densidad de canto: sílabas por pulso. Por defecto 2. Súbelo si la letra pasa muy lenta."),
            quantize: z
                .enum(["beat", "half_bar", "bar", "none"])
                .optional()
                .describe("Rejilla a la que se ajusta la duración de cada línea. Por defecto 'beat' (pulso)."),
            animation: z
                .enum(["suave", "energetico", "desvanecer", "acercar", "deslizar", "desenfoque", "girar", "ninguna"])
                .optional()
                .describe("Estilo de animación de entrada de la letra. Por defecto 'suave'."),
            transitionBeats: z.number().min(0).max(8).optional().describe("Duración de la transición en pulsos (0.5 = media negra). Sobrescribe el preset."),
            staggerLines: z
                .boolean()
                .optional()
                .describe("Si una diapositiva tiene varias líneas, hacer que entren una por una al ritmo. Solo aplica con linesPerSlide > 1."),
            staggerSeconds: z.number().min(0).max(5).optional().describe("Separación entre líneas en segundos. Útil si no hay bpm (por defecto 0.4s)."),
            lineStyle: z
                .enum(["uniforme", "concierto", "enfasis"])
                .optional()
                .describe(
                    "Tipografía por línea. 'uniforme': todas iguales. " +
                        "'concierto': primera línea grande y marcada, segunda más chica y liviana. " +
                        "'enfasis': segunda línea en itálica. Por defecto 'uniforme'.",
                ),
            reveal: z
                .enum(["none", "word", "character"])
                .optional()
                .describe(
                    "Aparición progresiva de la letra: 'word' revela palabra por palabra, 'character' letra por letra (efecto máquina de escribir). " +
                        "Por defecto 'none' (la línea entra completa). Tiene prioridad sobre staggerLines.",
                ),
            revealMotion: z
                .enum(["fade", "rise", "blur"])
                .optional()
                .describe("Cómo aparece cada palabra/letra: 'fade' (aparece), 'rise' (sube al aparecer), 'blur' (sale del desenfoque). Por defecto 'fade'."),
            revealBeats: z.number().min(0).max(4).optional().describe("Separación entre palabras/letras en pulsos. Por defecto 0.25 por palabra, 0.05 por letra."),
            revealSeconds: z.number().min(0).max(2).optional().describe("Separación en segundos. Útil si no hay bpm."),
            revealDuration: z.number().min(50).max(3000).optional().describe("Cuánto tarda en aparecer cada palabra/letra, en ms. Por defecto 350."),
            autoAdvance: z.boolean().optional().describe("Avance automático al ritmo. Ponelo en false para que el operador controle el paso a mano."),
            band: z
                .enum(["none", "lower_third", "lower", "center"])
                .optional()
                .describe(
                    "Dibuja una banda de fondo detrás de la letra (generada como SVG, sin archivos). " +
                        "'lower_third' es el clásico de concierto. Por defecto 'none'.",
                ),
            bandColor: z.string().optional().describe("Color de la banda en hex. Por defecto un blanco roto (#F2F0EB)."),
            bandTextColor: z.string().optional().describe("Color de la letra sobre la banda. Por defecto casi negro (#151515)."),
            bandRotate: z.number().min(-15).max(15).optional().describe("Inclinación en grados de la banda y el texto. Por defecto -1.5."),
            bandRoughness: z.number().min(0).max(1).optional().describe("Qué tan irregulares son los bordes: 0 limpio, 1 rústico. Por defecto 0.6."),
            bandSeed: z.number().int().optional().describe("Fija la forma generada: la misma semilla siempre dibuja la misma banda."),
            fontFamily: z.string().optional().describe("Fuente para la letra (debe estar instalada en el sistema)."),
            category: z.string().optional().describe("Categoría/carpeta donde guardarlo (id de categoría)."),
        },
    },
    tool(async (args) => {
        const { slides, meta, bpm, totalBeats, warnings } = planSong({
            text: args.lyrics,
            bpm: args.bpm,
            beatsPerBar: args.beatsPerBar ?? 4,
            linesPerSlide: args.linesPerSlide ?? 1,
            beatsPerLine: args.beatsPerLine ?? 0,
            syllablesPerBeat: args.syllablesPerBeat ?? 2,
            quantize: args.quantize || "beat",
        })

        // metadata from the lyrics ("Title=", "Artist=") minus the tempo keys, which aren't show metadata
        const showMeta = {}
        for (const [key, value] of Object.entries(meta)) {
            if (key === "bpm" || key === "tempo") continue
            showMeta[key] = value
        }

        // the band is its own overlay + template; build it first so the show can reference them
        let band = null
        if (args.band && args.band !== "none") {
            const bandRes = await callAction("create_lyric_template", {
                name: args.name || meta.title || "Alabanza",
                placement: args.band,
                color: args.bandColor,
                textColor: args.bandTextColor,
                rotate: args.bandRotate,
                roughness: args.bandRoughness,
                seed: args.bandSeed,
                fontFamily: args.fontFamily,
            })
            band = bandRes?.data ?? bandRes
            if (band?.error) throw new Error(`No se pudo crear la banda: ${band.error}`)
        }

        const payload = {
            name: args.name || meta.title || undefined,
            category: args.category,
            meta: showMeta,
            bpm,
            slides,
            animation: {
                preset: args.animation || "suave",
                transitionBeats: args.transitionBeats,
                autoAdvance: args.autoAdvance,
                staggerLines: args.staggerLines,
                staggerSeconds: args.staggerSeconds,
                lineStyle: args.lineStyle,
                reveal: args.reveal,
                revealMotion: args.revealMotion,
                revealBeats: args.revealBeats,
                revealSeconds: args.revealSeconds,
                revealDuration: args.revealDuration,
                // over a light band the default white text would be invisible
                textColor: band ? band.suggestedTextColor : undefined,
            },
            ...(band
                ? {
                      overlayId: band.overlayId,
                      templateId: band.templateId || undefined,
                      textBox: band.text,
                      // keep the lyrics on the same tilt as the band
                      itemStyle: args.bandRotate !== undefined || band ? `transform: rotate(${args.bandRotate ?? -1.5}deg);` : "",
                  }
                : {}),
        }

        const result = await callAction("create_animated_song", payload)
        const data = result?.data ?? result
        if (data?.error) throw new Error(`FreeShow no pudo crear la alabanza: ${data.error}`)

        return {
            ok: true,
            show: data,
            banda: band ? { overlayId: band.overlayId, templateId: band.templateId, posicion: band.placement } : undefined,
            diapositivas: slides.length,
            bpm: bpm || null,
            duracionEstimadaSegundos: bpm ? Number(beatsToSeconds(totalBeats, bpm).toFixed(1)) : null,
            advertencias: warnings.length ? warnings : undefined,
        }
    }),
)

server.registerTool(
    "preview_song_timing",
    {
        title: "Previsualizar el tempo de una alabanza",
        description:
            "Calcula cómo quedaría la alabanza (líneas, duración de cada diapositiva y total) SIN crear nada en FreeShow. " +
            "Útil para ajustar 'bpm' o 'syllablesPerBeat' antes de crear el show definitivo.",
        inputSchema: {
            lyrics: z.string().describe("Letra completa, una línea de canto por renglón."),
            bpm: z.number().min(20).max(300).optional().describe("Tempo en pulsos por minuto."),
            beatsPerBar: z.number().int().min(1).max(16).optional().describe("Numerador del compás. Por defecto 4."),
            linesPerSlide: z.number().int().min(1).max(10).optional().describe("Líneas por diapositiva. Por defecto 1."),
            beatsPerLine: z.number().min(0.25).max(64).optional().describe("Duración fija por línea en pulsos."),
            syllablesPerBeat: z.number().min(0.25).max(8).optional().describe("Sílabas por pulso. Por defecto 2."),
            quantize: z.enum(["beat", "half_bar", "bar", "none"]).optional().describe("Rejilla de ajuste. Por defecto 'beat'."),
        },
    },
    tool(async (args) => {
        const { slides, meta, bpm, totalBeats, warnings } = planSong({
            text: args.lyrics,
            bpm: args.bpm,
            beatsPerBar: args.beatsPerBar ?? 4,
            linesPerSlide: args.linesPerSlide ?? 1,
            beatsPerLine: args.beatsPerLine ?? 0,
            syllablesPerBeat: args.syllablesPerBeat ?? 2,
            quantize: args.quantize || "beat",
        })

        return {
            bpm: bpm || null,
            diapositivas: slides.length,
            duracionEstimadaSegundos: bpm ? Number(beatsToSeconds(totalBeats, bpm).toFixed(1)) : null,
            metadatos: Object.keys(meta).length ? meta : undefined,
            detalle: slides.map((s, i) => ({
                n: i + 1,
                grupo: s.group || undefined,
                texto: s.lines.join(" / ") || "(instrumental)",
                pulsos: s.beats ?? null,
                segundos: bpm && s.beats ? Number(beatsToSeconds(s.beats, bpm).toFixed(2)) : null,
            })),
            advertencias: warnings.length ? warnings : undefined,
        }
    }),
)

server.registerTool(
    "edit_lyrics",
    {
        title: "Editar/corregir letra de un show",
        description:
            "Reemplaza TODA la letra/contenido de un show existente con el texto provisto (mismo formato que create_lyrics). " +
            "Úsalo para corregir ortografía, arreglar líneas, reordenar versos, etc. " +
            "Flujo recomendado: read_lyrics (leer) → corregir el texto → edit_lyrics (reescribir). " +
            "Nota: reemplaza el contenido completo, así que envía el texto entero corregido, no solo el fragmento cambiado.",
        inputSchema: {
            id: z.string().describe("Id del show a editar (de list_shows)."),
            text: z.string().describe("Texto completo corregido, con marcadores de grupo [Verso], [Coro], etc."),
        },
    },
    tool(async ({ id, text }) => callAction("set_plain_text", { id, value: text })),
)

// === Control en vivo ===

server.registerTool(
    "select_show",
    {
        title: "Abrir/seleccionar show por nombre",
        description: "Abre un show en FreeShow (lo deja como show activo en el editor/preview) buscándolo por nombre. No lo envía a la salida todavía.",
        inputSchema: { name: z.string().describe("Nombre del show a abrir.") },
    },
    tool(async ({ name }) => callAction("name_select_show", { value: name })),
)

server.registerTool(
    "present_show",
    {
        title: "Presentar show (enviar a salida)",
        description: "Inicia la presentación de un show por id: lo abre y envía su primer slide a la salida en vivo.",
        inputSchema: { id: z.string().describe("Id del show a presentar (de list_shows).") },
    },
    tool(async ({ id }) => callAction("start_show", { id })),
)

server.registerTool(
    "next_slide",
    {
        title: "Siguiente slide",
        description: "Avanza al siguiente slide de la presentación en vivo.",
        inputSchema: {},
    },
    tool(async () => callAction("next_slide")),
)

server.registerTool(
    "previous_slide",
    {
        title: "Slide anterior",
        description: "Retrocede al slide anterior de la presentación en vivo.",
        inputSchema: {},
    },
    tool(async () => callAction("previous_slide")),
)

server.registerTool(
    "select_slide",
    {
        title: "Ir a un slide específico",
        description: "Salta a un slide concreto del show activo, por número (índice, empezando en 1) o por nombre de grupo (p. ej. 'Coro').",
        inputSchema: {
            index: z.number().int().min(1).optional().describe("Número de slide, empezando en 1."),
            name: z.string().optional().describe("Nombre del grupo/slide al que saltar (p. ej. 'Coro')."),
        },
    },
    tool(async ({ index, name }) => {
        if (typeof index === "number") return callAction("index_select_slide", { index })
        if (name) return callAction("name_select_slide", { value: name })
        throw new Error("Indica 'index' (número de slide) o 'name' (nombre del grupo).")
    }),
)

server.registerTool(
    "clear",
    {
        title: "Limpiar la salida",
        description:
            "Limpia la salida en vivo. 'target' elige qué borrar: " +
            "all (todo), slide (solo el texto/slide), background (fondo/media), overlays, audio, drawing (dibujo), next_timer.",
        inputSchema: {
            target: z
                .enum(["all", "slide", "background", "overlays", "audio", "drawing", "next_timer"])
                .default("all")
                .describe("Qué limpiar. Por defecto 'all'."),
        },
    },
    tool(async ({ target }) => callAction(`clear_${target || "all"}`)),
)

// === Versículos / Escritura ===

server.registerTool(
    "scripture",
    {
        title: "Mostrar versículos",
        description:
            "Controla la presentación de versículos bíblicos. " +
            "operation='show' muestra una referencia (p. ej. 'Juan 3:16' o 'Salmos 23:1-6'); " +
            "'next'/'previous' avanzan o retroceden entre los versículos mostrados. " +
            "Para una LISTA de versículos guardada como show, usa create_lyrics con cada versículo en su propio slide.",
        inputSchema: {
            operation: z.enum(["show", "next", "previous"]).describe("Acción a realizar."),
            reference: z.string().optional().describe("Referencia bíblica, requerida si operation='show'. Ej: 'Juan 3:16-17'."),
        },
    },
    tool(async ({ operation, reference }) => {
        if (operation === "next") return callAction("scripture_next")
        if (operation === "previous") return callAction("scripture_previous")
        if (!reference) throw new Error("Para operation='show' debes indicar 'reference' (p. ej. 'Juan 3:16').")
        return callAction("start_scripture", { reference })
    }),
)

server.registerTool(
    "list_scriptures",
    {
        title: "Listar biblias/versiones",
        description:
            "Devuelve las biblias (versiones de escritura) cargadas en FreeShow, con su id, nombre y abreviatura. " +
            "Úsalo para saber qué versiones hay disponibles antes de armar una playlist de versículos.",
        inputSchema: {},
    },
    tool(async () => callAction("get_scriptures")),
)

server.registerTool(
    "create_scripture_playlist",
    {
        title: "Armar playlist de versículos",
        description:
            "Crea UN show de escritura a partir de una lista de referencias, cada una con su versión. " +
            "Cada referencia se convierte en uno o más slides (en orden), usando el render nativo de FreeShow " +
            "(template, números de verso, división de versículos largos). Permite mezclar versiones entre referencias.\n\n" +
            "Las versiones se resuelven contra las biblias instaladas (ver list_scriptures); acepta códigos como 'RV60', 'PDT', 'NVI'. " +
            "Los libros se indican por nombre en español ('2 Corintios', 'Juan', 'Salmos'). " +
            "Los versículos pueden ser un número, lista ('12,13') o rango ('17-20').",
        inputSchema: {
            name: z.string().optional().describe("Nombre del show/playlist (p. ej. 'Versículos del domingo')."),
            references: z
                .array(
                    z.object({
                        book: z.string().describe("Libro en español o abreviatura (p. ej. '2 Corintios', 'Juan', 'Sal')."),
                        chapter: z.number().int().min(1).describe("Número de capítulo."),
                        verses: z
                            .union([z.string(), z.array(z.union([z.number(), z.string()]))])
                            .describe("Versículos: número, lista ('12,13') o rango ('17-20')."),
                        version: z.string().describe("Código/nombre de la versión (p. ej. 'RV60', 'PDT')."),
                    }),
                )
                .min(1)
                .describe("Lista de referencias, en el orden en que deben quedar en la playlist."),
        },
    },
    tool(async ({ name, references }) => {
        // 1) versiones disponibles en FreeShow
        const scripturesRaw = await callAction("get_scriptures")
        const scriptures = Array.isArray(scripturesRaw) ? scripturesRaw : scripturesRaw?.data || []
        if (!scriptures.length) {
            throw new Error("No hay biblias cargadas en FreeShow. Importá al menos una versión (Drawer → Scripture → Import → Local).")
        }

        // 2) resolver cada referencia
        const items = []
        const errors = []
        references.forEach((ref, i) => {
            const where = `referencia #${i + 1} ("${ref.book} ${ref.chapter} ${ref.version}")`

            const version = matchVersion(ref.version, scriptures)
            if (!version) {
                const disponibles = scriptures.map((s) => s.abbreviation || s.name).filter(Boolean).join(", ")
                errors.push(`${where}: versión '${ref.version}' no encontrada. Disponibles: ${disponibles}.`)
                return
            }

            const book = bookNameToNumber(ref.book)
            if (!book) {
                errors.push(`${where}: libro '${ref.book}' no reconocido.`)
                return
            }

            const verses = expandVerses(ref.verses)
            if (!verses.length) {
                errors.push(`${where}: versículos '${ref.verses}' inválidos.`)
                return
            }

            items.push({ scriptureId: version.id, book, chapter: ref.chapter, verses })
        })

        if (!items.length) {
            throw new Error("No se pudo resolver ninguna referencia.\n" + errors.join("\n"))
        }

        // 3) crear el show en FreeShow
        const result = await callAction("create_scripture_show", { name, items })

        const payload = result?.data ?? result
        if (payload?.error) {
            throw new Error(`FreeShow no pudo crear la playlist: ${payload.error}` + (payload.failed?.length ? ` (fallaron: ${payload.failed.join("; ")})` : ""))
        }

        return {
            ok: true,
            show: payload,
            resueltas: items.length,
            advertencias: errors.length ? errors : undefined,
        }
    }),
)

// === Anuncios / Overlays ===

server.registerTool(
    "overlay",
    {
        title: "Anuncios / overlays",
        description:
            "Muestra u oculta overlays (capas superpuestas), típicamente usadas para anuncios, nombres de canción, avisos, etc. " +
            "operation='show' activa un overlay por nombre; 'clear' quita todos los overlays.",
        inputSchema: {
            operation: z.enum(["show", "clear"]).describe("Mostrar un overlay o limpiar todos."),
            name: z.string().optional().describe("Nombre del overlay a mostrar (requerido si operation='show')."),
        },
    },
    tool(async ({ operation, name }) => {
        if (operation === "clear") return callAction("clear_overlays")
        if (!name) throw new Error("Para operation='show' debes indicar 'name' (nombre del overlay).")
        return callAction("name_select_overlay", { value: name })
    }),
)

// === Contadores / Timers ===

server.registerTool(
    "timer",
    {
        title: "Contadores / timers",
        description:
            "Controla timers/contadores (cuenta regresiva antes del servicio, tiempo de predicación, etc.). " +
            "operation: start (inicia un timer por nombre), stop (detiene todos), pause (pausa todos), seek (mueve el timer a 'seconds').",
        inputSchema: {
            operation: z.enum(["start", "stop", "pause", "seek"]).describe("Acción sobre los timers."),
            name: z.string().optional().describe("Nombre del timer a iniciar (requerido si operation='start')."),
            id: z.string().optional().describe("Id del timer para 'seek' (opcional; si se omite usa el activo)."),
            seconds: z.number().optional().describe("Segundos a los que mover el timer (requerido si operation='seek')."),
        },
    },
    tool(async ({ operation, name, id, seconds }) => {
        if (operation === "stop") return callAction("stop_timers")
        if (operation === "pause") return callAction("pause_timers")
        if (operation === "start") {
            if (!name) throw new Error("Para operation='start' debes indicar 'name' (nombre del timer).")
            return callAction("name_start_timer", { value: name })
        }
        if (operation === "seek") {
            if (typeof seconds !== "number") throw new Error("Para operation='seek' debes indicar 'seconds'.")
            const params = { seconds }
            if (id) params.id = id
            return callAction("timer_seekto", params)
        }
        throw new Error(`Operación de timer no soportada: ${operation}`)
    }),
)

// === Variables (texto/número dinámico para anuncios y plantillas) ===

server.registerTool(
    "set_variable",
    {
        title: "Cambiar una variable",
        description:
            "Cambia el valor de una variable dinámica (texto o número) usada en plantillas/anuncios. " +
            "Ej.: una variable de texto 'aviso' o un contador numérico. Indica el nombre y el nuevo valor.",
        inputSchema: {
            name: z.string().describe("Nombre de la variable a modificar."),
            value: z.union([z.string(), z.number()]).describe("Nuevo valor."),
            key: z
                .enum(["text", "number", "value"])
                .optional()
                .describe("Tipo de campo a fijar: 'text' para variables de texto, 'number' para numéricas. Por defecto 'text'."),
        },
    },
    tool(async ({ name, value, key }) => callAction("change_variable", { name, key: key || "text", value })),
)

// === Conexión / utilidad ===

server.registerTool(
    "check_connection",
    {
        title: "Probar conexión con FreeShow",
        description: "Verifica que el MCP puede comunicarse con FreeShow a través de la API REST. Útil para diagnosticar problemas de conexión.",
        inputSchema: {},
    },
    tool(async () => ping()),
)

// === Escotilla de escape: cualquier acción de la API ===

server.registerTool(
    "raw_action",
    {
        title: "Acción avanzada (API cruda)",
        description:
            "Ejecuta cualquier acción de la API de FreeShow no cubierta por las herramientas anteriores " +
            "(usa api_schema para verlas todas: change_layout, random_slide, play_audio, obs_*, spotify_*, get_slide, get_groups, set_template, etc.). " +
            "Pasa el 'action' (id exacto) y un objeto 'params' opcional con los campos que requiera esa acción.",
        inputSchema: {
            action: z.string().describe("Id exacto de la acción de la API de FreeShow."),
            params: z.record(z.any()).optional().describe("Parámetros de la acción (objeto JSON)."),
        },
    },
    tool(async ({ action, params }) => callAction(action, params || {})),
)

// === Temas, fondos y descubrimiento de la API (themeTools.js) ===

registerThemeTools(server, tool)

// --- entrypoint ------------------------------------------------------------

async function main() {
    // `--check` runs a one-off connectivity test instead of starting the server.
    if (process.argv.includes("--check")) {
        try {
            const result = await ping()
            console.log("OK:", JSON.stringify(result))
            process.exit(0)
        } catch (err) {
            console.error("FALLO:", err?.message || err)
            process.exit(1)
        }
        return
    }

    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`freeshow-mcp listo. Hablando con FreeShow en ${BASE_URL}`)
}

main().catch((err) => {
    console.error("Error fatal en freeshow-mcp:", err)
    process.exit(1)
})
