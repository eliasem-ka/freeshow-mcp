# freeshow - mcp

Monorepo con las herramientas para controlar y extender **FreeShow** desde un
asistente de IA, más utilidades de biblias.

## Estructura

| Carpeta | Qué es |
|---|---|
| [`FreeShow/`](FreeShow) | Submódulo → fork de FreeShow ([eliasem-ka/freeshow-fork-v1](https://github.com/eliasem-ka/freeshow-fork-v1)) con la API extendida para escrituras (`get_scriptures`, `create_scripture_show`). |
| [`freeshow-mcp/`](freeshow-mcp) | Servidor **MCP** que controla FreeShow vía su API REST (letras, versículos, timers, overlays, y armado de playlists de versículos). |
| [`bible-converter/`](bible-converter) | Convertidor **USX → `.fsb`**: pasa biblias exportadas (formato ProPresenter) al formato que lee FreeShow. |

## Clonar

Como `FreeShow` es un submódulo, clonar con `--recursive`:

```bash
git clone --recursive <url-de-este-repo>
# o si ya clonaste sin recursive:
git submodule update --init --recursive
```

## Puesta en marcha

- **MCP:** ver [`freeshow-mcp/README.md`](freeshow-mcp/README.md) — requiere FreeShow abierto con la API activada (REST en `5506`).
- **Convertidor:** ver [`bible-converter/README.md`](bible-converter/README.md).
- **FreeShow:** ver [`FreeShow/README.md`](FreeShow/README.md) — `npm install && npm start` para desarrollo.

## La feature de escrituras

El fork de FreeShow agrega dos acciones a su API REST para que el MCP pueda armar
playlists de versículos a partir de una lista de referencias con su versión:

- `get_scriptures` — lista las biblias cargadas (id, nombre, abreviatura).
- `create_scripture_show` — crea un show de escritura desde referencias explícitas,
  reusando el render nativo (template, números de verso, división de versículos).

El MCP expone esto con las tools `list_scriptures` y `create_scripture_playlist`.
