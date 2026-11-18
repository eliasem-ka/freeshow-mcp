# freeshow-mcp

Servidor **MCP** (Model Context Protocol) para controlar **FreeShow** desde un asistente de IA (Claude Desktop, Claude Code, etc.).

Pensado para el flujo normal de una iglesia: crear y editar letras, armar alabanzas sincronizadas al tempo, corregir ortografía, mostrar versículos, manejar contadores/timers, anuncios (overlays) y disparar la presentación en vivo. Funciona como un cliente liviano sobre la **API REST** que FreeShow ya trae integrada.

> **Requiere el fork de FreeShow de este repo.** La mayoría de las herramientas funcionan contra FreeShow estándar, pero `create_scripture_playlist`, `create_song` y `preview_song_timing` usan acciones de API añadidas en el submódulo `FreeShow/` (módulos aparte, para que los merges con el repo original sigan siendo limpios).

## Requisitos

- Node.js 18+ (probado con Node 24)
- FreeShow abierto en la misma máquina (o accesible por red)
- La **API de FreeShow activada**

## 1. Activar la API en FreeShow

En FreeShow: **Configuración → Conexiones → activar "API"** (WebSocket/REST/OSC/Companion).

Por defecto queda escuchando en:
- WebSocket: `5505`
- **REST: `5506`** ← el que usa este MCP

## 2. Instalar

```bash
cd "freeshow-mcp"
npm install
```

Probar la conexión (con FreeShow abierto y la API activada):

```bash
npm run check
# OK: {"connected":true,"url":"http://127.0.0.1:5506/","showsReported":3}
```

## 3. Conectar a Claude

### Claude Code

```bash
claude mcp add freeshow -- node "C:\Users\CCCR\OneDrive\Documents\freeshow - mcp\freeshow-mcp\src\index.js"
```

### Claude Desktop

Editar `claude_desktop_config.json` y agregar:

```json
{
  "mcpServers": {
    "freeshow": {
      "command": "node",
      "args": ["C:\\Users\\CCCR\\OneDrive\\Documents\\freeshow - mcp\\freeshow-mcp\\src\\index.js"]
    }
  }
}
```

Reiniciar el cliente después de configurarlo.

### Variables de entorno (opcional)

- `FREESHOW_HOST` — host de FreeShow (por defecto `127.0.0.1`)
- `FREESHOW_REST_PORT` — puerto REST (por defecto `5506`)

Ejemplo para apuntar a otra máquina:

```json
"env": { "FREESHOW_HOST": "192.168.1.50", "FREESHOW_REST_PORT": "5506" }
```

## Herramientas disponibles

| Herramienta | Qué hace |
|---|---|
| `list_shows` | Lista todos los shows con su id y nombre |
| `get_show` | Contenido completo de un show (slides, grupos, layouts) |
| `read_lyrics` | Letra de un show como texto plano |
| `create_lyrics` | Crea un show desde texto y devuelve su id. Queda solo en la biblioteca, salvo que se pida `addToProject`, `projectId` u `open` |
| `create_song` | Crea una alabanza con **una diapositiva por línea** y animación sincronizada al tempo |
| `preview_song_timing` | Calcula los tiempos de la alabanza **sin crear nada**, para ajustar el BPM |
| `edit_lyrics` | Reescribe la letra de un show (corregir ortografía, editar) |
| `select_show` | Abre un show por nombre (no lo manda a salida) |
| `present_show` | Presenta un show por id (lo manda a la salida) |
| `next_slide` / `previous_slide` | Avanza / retrocede en la presentación |
| `select_slide` | Salta a un slide por número o nombre de grupo |
| `clear` | Limpia la salida (todo, slide, fondo, overlays, audio, dibujo) |
| `scripture` | Muestra versículos (`show`/`next`/`previous`) |
| `list_scriptures` | Lista las biblias/versiones cargadas (id, nombre, abreviatura) |
| `create_scripture_playlist` | Arma un show desde una lista de referencias con su versión (mezcla versiones) |
| `overlay` | Muestra u oculta overlays (anuncios) |
| `timer` | Contadores: iniciar / detener / pausar / mover |
| `set_variable` | Cambia una variable dinámica (texto/número) |
| `list_timers` / `list_variables` / `get_output` | Estado actual |
| `check_connection` | Diagnóstico de conexión |
| `api_schema` | Lista las acciones de la API con sus parámetros, tal como están en la versión abierta (filtra por sección o texto) |
| `raw_action` | Escotilla de escape: ejecuta cualquier acción de la API (búscala con `api_schema`) |

### Temas, fondos y salidas

Requieren el fork de FreeShow (acciones de `custom/themeApi.ts`).

| Herramienta | Qué hace |
|---|---|
| `list_themes` / `get_theme` | Temas con su carpeta y una descripción sencilla (`spec`) de cómo se ven |
| `list_theme_folders` | Carpetas de temas y qué tema usa cada tipo de diapositiva |
| `preview_theme` | **Imagen** de un tema con texto de ejemplo: de uno guardado o de un `spec` antes de guardarlo |
| `create_theme` / `update_theme` | Crea o edita un tema con un `spec`; al editar solo cambian las claves que se dan |
| `duplicate_theme` / `delete_theme` | Copia o borra un tema |
| `apply_theme` | Aplica un tema a la presentación, a unas diapositivas, a un grupo (todos los coros) o a un proyecto entero |
| `set_theme_role` / `apply_theme_package` | Asigna un tema por tipo de diapositiva y reparte la carpeta completa |
| `theme_palette` / `replace_theme_value` | Colores y fuentes de una carpeta; cambia uno en todos sus temas a la vez |
| `list_fonts` | Fuentes instaladas en la computadora de FreeShow |
| `add_factory_themes` | Agrega la carpeta de temas de fábrica |
| `export_theme_folder` / `import_theme_file` | Lleva una carpeta de temas (con sus fondos) a otra computadora |
| `list_output_styles` / `set_output_theme` | Un tema distinto por salida (transmisión, escenario) |
| `list_media_folders` / `list_media` | Videos e imágenes de la biblioteca de medios |
| `set_background` | Pone o quita el fondo de una presentación o de algunas diapositivas |

## Diseñar un tema con el asistente

Un tema se describe con un `spec`, sin tocar el formato interno de FreeShow:

```json
{
  "position": "lower_third",
  "font": "Georgia",
  "size": 78,
  "color": "#FFF4D6",
  "shadow": false,
  "box": { "color": "#0E1B2B", "opacity": 0.8, "radius": 28, "padding": 34 },
  "decorations": [{ "type": "rect", "position": { "left": 60, "top": 700, "width": 14, "height": 300 }, "color": "#F2B84B" }]
}
```

Claves: `position` (`full`, `center`, `upper_third`, `lower_third`, `top`, `bottom`, `left`, `right` o una caja en píxeles sobre 1920x1080), `margin`, `font`, `size`, `weight`, `italic`, `uppercase`, `color`, `align`, `verticalAlign`, `lineHeight`, `letterSpacing`, `shadow`, `outline`, `box`, `fit`, `background` (`color` o `path`), `maxLines` y `decorations` (`rect` o `gradient`).

El ciclo que mejor funciona: `preview_theme` con el `spec` → mirar la imagen → corregir → `create_theme` → `apply_theme`. La primera vista previa tarda unos 5 segundos; las siguientes, cerca de 1.

## Formato de texto para `create_lyrics` / `edit_lyrics`

- Cada **slide** se separa con una **línea en blanco**.
- Una sección se encabeza con su **grupo entre corchetes**: `[Verso]`, `[Coro]`, `[Puente]`, `[Intro]`, etc.
- Metadatos opcionales como líneas `Clave=Valor`: `Title=`, `Artist=`, `Author=`, `Copyright=`, `CCLI=`, `Key=`.
- `x2` al final de una sección la repite.

```
Title=Sublime Gracia
Artist=John Newton

[Verso]
Sublime gracia del Señor
que a un infeliz salvó

[Coro]
Fui ciego, mas hoy veo yo
perdido y Él me halló
```

## Alabanzas sincronizadas al tempo (`create_song`)

Toma la letra y el **BPM** de la canción, y arma el show con una diapositiva por línea:

- **Duración de cada línea**: estima las sílabas (en español, contando diptongos e hiatos) y las convierte a pulsos, ajustándolas a la rejilla del compás. Así cada línea cae en un tiempo musical, no en un número arbitrario.
- **Avance automático**: escribe esa duración como *next slide timer*, con precisión decimal. La letra pasa sola al ritmo.
- **Animación**: la duración de la transición se deriva del pulso (p. ej. media negra), para que la entrada del texto "respire" con la música.

```
Title=Sublime Gracia
BPM=72

[Verso]
Sublime gracia del Señor
que a un infeliz salvó

[Coro]
Fui ciego, mas hoy veo yo
perdido y Él me halló
```

Parámetros útiles:

| Parámetro | Para qué |
|---|---|
| `bpm` | Tempo. También se puede poner `BPM=` dentro de la letra |
| `beatsPerBar` | Numerador del compás (4 para 4/4, 3 para 3/4) |
| `linesPerSlide` | Líneas por diapositiva (**1** por defecto) |
| `syllablesPerBeat` | Densidad de canto. Súbelo si la letra pasa muy lenta |
| `beatsPerLine` | Duración fija por línea; ignora la estimación por sílabas |
| `quantize` | Rejilla de ajuste: `beat`, `half_bar`, `bar` o `none` |
| `animation` | `suave`, `energetico`, `desvanecer`, `acercar`, `deslizar`, `desenfoque`, `girar`, `ninguna` |
| `staggerLines` | Con `linesPerSlide > 1`, hace entrar las líneas una por una al ritmo |

Conviene correr `preview_song_timing` primero: muestra línea por línea cuántos pulsos y segundos le tocan, sin tocar FreeShow.

## Ejemplos de uso (lenguaje natural al asistente)

- "Agrega esta alabanza a 72 BPM, una diapositiva por línea, con animación suave: …"
- "Antes de crearla, muéstrame cómo quedarían los tiempos a 90 BPM."
- "Crea una canción llamada *Cuán Grande Es Él* con estos versos…"
- "Lee la letra de *¿Quién Como Tú, Jehová* y corrígele la ortografía."
- "Agrega un slide de versículo con Juan 3:16."
- "Pon en pantalla el Salmo 23 y avanza al siguiente versículo."
- "Inicia el contador de 5 minutos antes del servicio."
- "Limpia la pantalla."
- "Hazme un tema navideño elegante en tercio inferior, enséñamelo y aplícalo a todas las alabanzas del proyecto."
- "Cambia el dorado de la carpeta *Serie Navidad* por rojo."
- "Busca un video de fondo con montañas y ponlo en esta alabanza."
- "Que la transmisión use el tema de tercio inferior y la pantalla principal siga igual."

## Notas

- La API de FreeShow no tiene autenticación; úsala en una red local de confianza.
- `create_lyrics` guarda el show en `Documentos/FreeShow/Shows/` y aparece en el drawer al instante.
- `edit_lyrics` reemplaza **todo** el contenido de texto del show: enviá el texto completo corregido.
- El avance automático de `create_song` corre en la **salida en vivo**; en el editor verás los tiempos marcados en cada slide pero no avanzará solo.
- La estimación de sílabas es un modelo de ritmo, no un análisis de audio: si una línea queda corta o larga, ajustá `syllablesPerBeat` o fijá `beatsPerLine`.
