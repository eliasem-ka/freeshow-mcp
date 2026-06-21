# freeshow-mcp

Servidor **MCP** (Model Context Protocol) para controlar **FreeShow** desde un asistente de IA (Claude Desktop, Claude Code, etc.).

Pensado para el flujo normal de una iglesia: crear y editar letras, corregir ortografía, mostrar versículos, manejar contadores/timers, anuncios (overlays) y disparar la presentación en vivo. Funciona como un cliente liviano sobre la **API REST** que FreeShow ya trae integrada — no modifica el código de FreeShow.

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

## Ejemplos de uso (lenguaje natural al asistente)

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
