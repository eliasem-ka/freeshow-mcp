// Herramientas de temas, fondos y descubrimiento de la API.
//
// Un tema es una plantilla de FreeShow y una carpeta de temas es una categoría de plantillas.
// Estas herramientas hablan con las acciones del fork (custom/themeApi.ts): describir un tema con
// un "spec" sencillo, verlo en una imagen antes de usarlo, aplicarlo por diapositiva, grupo,
// presentación o proyecto, cambiar un color en toda una carpeta, y poner fondos.

import { z } from "zod"
import { callAction } from "./freeshow.js"

/** La API responde { action, data } y los errores van como { error } dentro de data. */
async function run(action, params = {}) {
    const res = await callAction(action, params)
    const data = res && typeof res === "object" && "data" in res ? res.data : res
    if (data && typeof data === "object" && typeof data.error === "string") throw new Error(data.error)
    return data
}

// --- esquema del "spec" de un tema ------------------------------------------

const box = z.object({ left: z.number(), top: z.number(), width: z.number(), height: z.number() }).describe("Caja exacta en píxeles sobre el lienzo de 1920x1080.")
const position = z.union([z.enum(["full", "center", "upper_third", "lower_third", "top", "bottom", "left", "right"]), box])

export const themeSpec = z
    .object({
        position: position.optional().describe("Dónde va el texto: un lugar con nombre (lower_third = tercio inferior) o una caja exacta. Por defecto 'full'."),
        margin: z.number().optional().describe("Distancia a los bordes para los lugares con nombre, en píxeles. Por defecto 60."),
        font: z.string().optional().describe("Familia de fuente instalada (ver list_fonts)."),
        size: z.number().optional().describe("Tamaño en píxeles sobre 1920x1080. Letras de canciones: 70-120."),
        weight: z.union([z.enum(["normal", "bold"]), z.number()]).optional(),
        italic: z.boolean().optional(),
        uppercase: z.boolean().optional(),
        color: z.string().optional().describe("Color del texto, p. ej. '#FFFFFF'."),
        align: z.enum(["left", "center", "right"]).optional(),
        verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
        lineHeight: z.number().optional().describe("Interlineado en em, p. ej. 1.2."),
        letterSpacing: z.number().optional().describe("Espaciado entre letras en píxeles."),
        shadow: z
            .union([z.literal(false), z.object({ color: z.string().optional(), x: z.number().optional(), y: z.number().optional(), blur: z.number().optional() })])
            .optional()
            .describe("Sombra del texto; false la quita (sin esta clave FreeShow pone una sombra suave)."),
        outline: z.union([z.literal(false), z.object({ color: z.string().optional(), width: z.number().optional() })]).optional().describe("Contorno del texto; útil sobre videos con mucho movimiento."),
        box: z
            .union([z.literal(false), z.object({ color: z.string().optional(), opacity: z.number().optional(), radius: z.number().optional(), padding: z.number().optional() })])
            .optional()
            .describe("Caja de color detrás del texto (típica del tercio inferior)."),
        fit: z.enum(["shrink", "grow", "none"]).optional().describe("Qué hacer si el texto no cabe. Por defecto 'shrink'."),
        background: z.object({ color: z.string().optional(), path: z.string().optional() }).optional().describe("Fondo del tema: un color o un archivo de imagen o video (ver list_media)."),
        maxLines: z.number().optional().describe("Partir las diapositivas que tengan más líneas que esto."),
        decorations: z
            .array(
                z.object({
                    type: z.enum(["rect", "gradient"]).describe("'rect' es una caja de color; 'gradient' un degradado (con el final transparente sirve para oscurecer parte de un video)."),
                    position: position.optional().describe("Por defecto toda la diapositiva."),
                    color: z.string().optional(),
                    to: z.string().optional().describe("Color final del degradado. Sin esto termina transparente."),
                    angle: z.number().optional().describe("Dirección del degradado en grados: 0 izquierda a derecha, 90 arriba a abajo."),
                    opacity: z.number().optional(),
                    radius: z.number().optional(),
                }),
            )
            .optional()
            .describe("Formas detrás del texto, la primera al fondo: barras, líneas de acento, degradados."),
    })
    .describe("Descripción sencilla de un tema. Solo las claves que se dan cambian.")

// --- registro ---------------------------------------------------------------

/**
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {(handler: Function) => Function} tool - el envoltorio de errores de index.js
 */
export function registerThemeTools(server, tool) {
    server.registerTool(
        "list_themes",
        {
            title: "Listar temas",
            description: "Devuelve los temas (plantillas) con su id, carpeta y una descripción sencilla (spec) de cómo se ven. " + "Úsalo para encontrar el id de un tema antes de aplicarlo o editarlo. Se puede filtrar por carpeta o por nombre.",
            inputSchema: {
                folder: z.string().optional().describe("Id o nombre de la carpeta."),
                search: z.string().optional().describe("Texto que debe estar en el nombre."),
            },
        },
        tool(async ({ folder, search }) => {
            let themes = await run("get_templates")
            if (folder) themes = themes.filter((t) => t.category === folder || (t.categoryName || "").toLowerCase() === folder.toLowerCase())
            if (search) themes = themes.filter((t) => (t.name || "").toLowerCase().includes(search.toLowerCase()))
            return themes
        }),
    )

    server.registerTool(
        "list_theme_folders",
        {
            title: "Listar carpetas de temas",
            description: "Devuelve las carpetas de temas, cuántos temas tiene cada una y qué tema usa cada tipo de diapositiva " + "(roles: 'first' = primera, un grupo como 'verse' o 'chorus', 'default' = el resto) cuando la carpeta se aplica como paquete.",
            inputSchema: {},
        },
        tool(async () => run("get_template_categories")),
    )

    server.registerTool(
        "get_theme",
        {
            title: "Leer un tema",
            description: "Devuelve un tema completo: su spec, sus elementos crudos y sus ajustes.",
            inputSchema: { id: z.string().describe("Id del tema.") },
        },
        tool(async ({ id }) => run("get_template", { id })),
    )

    server.registerTool(
        "create_theme",
        {
            title: "Crear un tema",
            description:
                "Crea un tema a partir de un spec (fuente, tamaño, color, posición, sombra, contorno, caja, fondo, decoraciones). " +
                "Flujo recomendado: prueba el spec con preview_theme, corrígelo, y entonces créalo. " +
                "Si se da folderName y la carpeta no existe, se crea.",
            inputSchema: {
                name: z.string().describe("Nombre del tema."),
                spec: themeSpec,
                folder: z.string().optional().describe("Id de la carpeta."),
                folderName: z.string().optional().describe("Nombre de la carpeta (se crea si no existe)."),
            },
        },
        tool(async ({ name, spec, folder, folderName }) => run("create_template", { name, spec, category: folder, categoryName: folderName })),
    )

    server.registerTool(
        "update_theme",
        {
            title: "Editar un tema",
            description: "Cambia un tema existente. Del spec solo cambian las claves que se dan; el resto del tema (incluidas las formas dibujadas a mano) se conserva.",
            inputSchema: {
                id: z.string().describe("Id del tema."),
                name: z.string().optional(),
                spec: themeSpec.optional(),
                folder: z.string().optional().describe("Mover a esta carpeta (id)."),
                folderName: z.string().optional().describe("Mover a esta carpeta (nombre; se crea si no existe)."),
            },
        },
        tool(async ({ id, name, spec, folder, folderName }) => run("update_template", { id, name, spec, category: folder, categoryName: folderName })),
    )

    server.registerTool(
        "duplicate_theme",
        {
            title: "Duplicar un tema",
            description: "Copia un tema, opcionalmente a otra carpeta. Útil para hacer una variante sin tocar el original.",
            inputSchema: { id: z.string(), name: z.string().optional(), folder: z.string().optional().describe("Id de la carpeta de destino.") },
        },
        tool(async ({ id, name, folder }) => run("duplicate_template", { id, name, category: folder })),
    )

    server.registerTool(
        "delete_theme",
        {
            title: "Borrar un tema",
            description: "Borra un tema. Se puede deshacer desde FreeShow (Ctrl+Z).",
            inputSchema: { id: z.string() },
        },
        tool(async ({ id }) => run("delete_template", { id })),
    )

    server.registerTool(
        "preview_theme",
        {
            title: "Ver un tema",
            description:
                "Devuelve una imagen de cómo se ve un tema con texto de ejemplo: de un tema guardado (id) o de un spec antes de guardarlo. " +
                "Úsalo para mirar el diseño y corregirlo. La primera vez tarda unos 5 segundos; las siguientes, cerca de 1.",
            inputSchema: {
                id: z.string().optional().describe("Id de un tema guardado."),
                spec: themeSpec.optional().describe("Spec a probar (solo, o encima del tema dado en id)."),
                text: z.string().optional().describe("Texto de ejemplo, una línea por línea."),
                backgroundPath: z.string().optional().describe("Archivo de imagen o video para verlo detrás (ver list_media)."),
                backdrop: z.string().optional().describe("Color detrás de un tema sin fondo propio. Por defecto un azul grisáceo; 'none' lo deja en negro."),
                width: z.number().optional().describe("Ancho de la imagen en píxeles. Por defecto 960."),
            },
        },
        async (args) => {
            try {
                const result = await run("render_template_preview", args || {})
                const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(result.image) || []
                if (!data) throw new Error("FreeShow no devolvió una imagen.")
                return {
                    content: [
                        { type: "image", data, mimeType },
                        { type: "text", text: `Vista previa ${result.width}x${result.height}` + (result.backdrop ? ` sobre ${result.backdrop} (el tema no tiene fondo propio).` : ".") },
                    ],
                }
            } catch (err) {
                return { isError: true, content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }] }
            }
        },
    )

    server.registerTool(
        "apply_theme",
        {
            title: "Aplicar un tema",
            description:
                "Aplica un tema a la presentación abierta (por defecto), a otra presentación, a unas diapositivas, a las diapositivas de un grupo " +
                "(p. ej. todos los coros) o a todas las presentaciones de un proyecto. Con id vacío y scope 'slides' o 'group' quita el tema propio de esas diapositivas.",
            inputSchema: {
                id: z.string().describe("Id del tema ('' para quitar)."),
                scope: z.enum(["show", "slides", "group", "project"]).optional().describe("Por defecto 'show'."),
                showId: z.string().optional().describe("Por defecto la presentación abierta."),
                slides: z.array(z.number()).optional().describe("Números de diapositiva, desde 1 (scope 'slides')."),
                group: z.string().optional().describe("Id o nombre del grupo: 'chorus', 'Coro', 'verse'... (scope 'group')."),
                projectId: z.string().optional().describe("Por defecto el proyecto abierto (scope 'project')."),
            },
        },
        tool(async ({ id, scope, showId, slides, group, projectId }) => run("apply_template", { id, scope, showId, indexes: slides, group, projectId })),
    )

    server.registerTool(
        "set_theme_role",
        {
            title: "Asignar tema a un tipo de diapositiva",
            description: "En una carpeta, elige qué tema usa un tipo de diapositiva: 'first' (primera), un grupo como 'verse', 'chorus', 'bridge', o 'default' (el resto). " + "Después apply_theme_package reparte los temas solo.",
            inputSchema: { folder: z.string().describe("Id de la carpeta."), role: z.string(), themeId: z.string().describe("Id de un tema de esa carpeta ('' para quitar la asignación).") },
        },
        tool(async ({ folder, role, themeId }) => run("set_theme_role", { categoryId: folder, role, templateId: themeId })),
    )

    server.registerTool(
        "apply_theme_package",
        {
            title: "Aplicar una carpeta de temas completa",
            description: "Da a cada diapositiva el tema que su grupo usa en la carpeta (título, verso, coro...), en una presentación o en todo un proyecto.",
            inputSchema: {
                folder: z.string().describe("Id de la carpeta."),
                showId: z.string().optional().describe("Por defecto la presentación abierta."),
                projectId: z.string().optional().describe("Aplicarlo a todas las presentaciones de este proyecto ('' = el proyecto abierto)."),
            },
        },
        tool(async ({ folder, showId, projectId }) => run("apply_theme_package", { categoryId: folder, showId, ...(projectId !== undefined ? { projectId } : {}) })),
    )

    server.registerTool(
        "theme_palette",
        {
            title: "Colores y fuentes de los temas",
            description: "Devuelve los colores y fuentes que usa una carpeta, un tema, o todos los temas, del más usado al menos usado.",
            inputSchema: { folder: z.string().optional().describe("Id de la carpeta."), themeId: z.string().optional() },
        },
        tool(async ({ folder, themeId }) => run("get_theme_palette", { categoryId: folder, templateId: themeId })),
    )

    server.registerTool(
        "replace_theme_value",
        {
            title: "Cambiar un color o fuente en toda una carpeta",
            description: "Cambia un color o una fuente en todos los lugares donde una carpeta (o un tema) lo usa: texto, contornos, cajas, formas y color de fondo. " + "Sirve para adaptar una serie entera cambiando su color de acento o su tipografía.",
            inputSchema: {
                kind: z.enum(["color", "font"]),
                from: z.string().describe("Valor actual (ver theme_palette)."),
                to: z.string().describe("Valor nuevo."),
                folder: z.string().optional().describe("Id de la carpeta."),
                themeId: z.string().optional(),
            },
        },
        tool(async ({ kind, from, to, folder, themeId }) => run("replace_theme_value", { kind, from, to, categoryId: folder, templateId: themeId })),
    )

    server.registerTool(
        "list_fonts",
        {
            title: "Listar fuentes instaladas",
            description: "Devuelve las familias de fuentes instaladas en la computadora que corre FreeShow. Un tema solo se ve bien con una fuente que esté en esta lista.",
            inputSchema: { search: z.string().optional() },
        },
        tool(async ({ search }) => {
            const fonts = await run("get_fonts")
            return search ? fonts.filter((font) => font.toLowerCase().includes(search.toLowerCase())) : fonts
        }),
    )

    server.registerTool(
        "add_factory_themes",
        {
            title: "Agregar los temas de fábrica",
            description: "Agrega la carpeta de temas de fábrica (clásico, título, tercio inferior, moderno, elegante, contorno, claro, versículo, cine). Buen punto de partida para duplicar y adaptar.",
            inputSchema: {},
        },
        tool(async () => run("add_factory_themes")),
    )

    server.registerTool(
        "export_theme_folder",
        {
            title: "Exportar una carpeta de temas",
            description: "Escribe una carpeta de temas (sus temas, asignación de grupos y archivos de fondo) en un solo archivo .fstemplate dentro de la carpeta de exportaciones de FreeShow.",
            inputSchema: { folder: z.string().describe("Id de la carpeta.") },
        },
        tool(async ({ folder }) => run("export_theme_package", { categoryId: folder })),
    )

    server.registerTool(
        "import_theme_file",
        {
            title: "Importar temas desde un archivo",
            description: "Importa un paquete de temas o un tema suelto (.fstemplate) desde una ruta de la computadora que corre FreeShow.",
            inputSchema: { path: z.string() },
        },
        tool(async ({ path }) => run("import_theme_file", { path })),
    )

    // === Salidas ===

    server.registerTool(
        "list_output_styles",
        {
            title: "Listar estilos de salida",
            description: "Devuelve los estilos de salida, el tema que cada uno fuerza (si tiene) y las salidas que lo usan.",
            inputSchema: {},
        },
        tool(async () => run("get_output_styles")),
    )

    server.registerTool(
        "set_output_theme",
        {
            title: "Tema propio para una salida",
            description: "Hace que un estilo de salida use su propio tema: la misma canción se ve distinta en la transmisión (p. ej. tercio inferior) o en el escenario. " + "Con themeId vacío vuelve a usar el tema de cada presentación.",
            inputSchema: { styleId: z.string(), themeId: z.string(), kind: z.enum(["template", "templateScripture"]).optional().describe("'templateScripture' es el tema para versículos.") },
        },
        tool(async ({ styleId, themeId, kind }) => run("set_output_style_template", { styleId, templateId: themeId, kind })),
    )

    // === Medios y fondos ===

    server.registerTool(
        "list_media",
        {
            title: "Listar videos e imágenes",
            description: "Devuelve los videos e imágenes de la biblioteca de medios de FreeShow (todas sus carpetas, una, o cualquier ruta), con filtros por tipo y nombre. " + "Las rutas que devuelve sirven para set_background y para el fondo de un tema.",
            inputSchema: {
                folderId: z.string().optional().describe("Id de una carpeta de medios (ver list_media_folders)."),
                path: z.string().optional().describe("Cualquier carpeta del disco."),
                type: z.enum(["video", "image"]).optional(),
                search: z.string().optional().describe("Texto que debe estar en el nombre del archivo."),
                limit: z.number().optional().describe("Máximo de resultados. Por defecto 500."),
            },
        },
        tool(async (args) => run("get_media", args)),
    )

    server.registerTool(
        "list_media_folders",
        {
            title: "Listar carpetas de medios",
            description: "Devuelve las carpetas de la biblioteca de medios de FreeShow.",
            inputSchema: {},
        },
        tool(async () => run("get_media_folders")),
    )

    server.registerTool(
        "set_background",
        {
            title: "Poner fondo a una presentación",
            description: "Pone una imagen o video de fondo a todas las diapositivas de una presentación, o solo a algunas. Con path vacío quita el fondo.",
            inputSchema: {
                path: z.string().describe("Ruta del archivo ('' para quitar)."),
                showId: z.string().optional().describe("Por defecto la presentación abierta."),
                slides: z.array(z.number()).optional().describe("Números de diapositiva, desde 1. Por defecto todas."),
                loop: z.boolean().optional().describe("Solo videos. Por defecto true."),
                muted: z.boolean().optional().describe("Solo videos. Por defecto true."),
            },
        },
        tool(async ({ path, showId, slides, loop, muted }) => run("set_background", { path, showId, indexes: slides, loop, muted })),
    )

    // === API ===

    server.registerTool(
        "api_schema",
        {
            title: "Descubrir la API de FreeShow",
            description:
                "Devuelve las acciones de la API de FreeShow con su sección, parámetros y descripción, tal como están en esta versión. " +
                "Úsalo para encontrar una acción que no tiene herramienta propia y llámala con raw_action. Conviene filtrar por sección o texto.",
            inputSchema: {
                group: z.string().optional().describe("Sección: themes, media, shows, project, presentation, output, timers, audio, scripture, get..."),
                search: z.string().optional().describe("Texto en el nombre o la descripción."),
                action: z.string().optional().describe("Solo esta acción."),
            },
        },
        tool(async (args) => run("get_api_schema", args)),
    )
}
