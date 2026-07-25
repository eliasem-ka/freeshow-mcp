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
| `create_lyrics` | Crea un show desde texto (canciones, versículos, anuncios) |
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
| `raw_action` | Escotilla de escape: ejecuta cualquiera de las ~130 acciones de la API |

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

## Notas

- La API de FreeShow no tiene autenticación; úsala en una red local de confianza.
- `create_lyrics` guarda el show en `Documentos/FreeShow/Shows/` y aparece en el drawer al instante.
- `edit_lyrics` reemplaza **todo** el contenido de texto del show: enviá el texto completo corregido.
- El avance automático de `create_song` corre en la **salida en vivo**; en el editor verás los tiempos marcados en cada slide pero no avanzará solo.
- La estimación de sílabas es un modelo de ritmo, no un análisis de audio: si una línea queda corta o larga, ajustá `syllablesPerBeat` o fijá `beatsPerLine`.
