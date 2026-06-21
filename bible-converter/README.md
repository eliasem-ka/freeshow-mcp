# bible-converter

Convertidor **USX → FreeShow `.fsb`**. Toma la salida del importador de biblias
(`bible_import` / formato ProPresenter: carpetas con `USX_1/`, `metadata.xml`,
`rvmetadata.xml`) y genera archivos `.fsb` que **FreeShow** puede importar.

Es una herramienta **independiente del MCP**. No depende de nada (solo Node 16+),
no toca la red y no modifica FreeShow.

## Por qué

El importador descarga biblias (incluidas versiones con licencia que ya tenés en
su carpeta `output/`) pero las deja en formato **USX/ProPresenter**, que FreeShow
no sabe leer. Este script las pasa al formato nativo de FreeShow (`.fsb`).

## Uso

```bash
# Una sola biblia (la carpeta que contiene USX_1/)
node convert.mjs "ruta/al/output/RVR1960"

# Varias de una (carpeta padre con todas las biblias adentro)
node convert.mjs "ruta/al/output"
```

Por defecto escribe en `Documentos/FreeShow/Bibles/`. Opciones:

| Opción | Qué hace |
|---|---|
| `--out <dir>` | Carpeta destino (en vez de la de FreeShow). |
| `--name <nombre>` | Sobrescribe el nombre (solo con input de 1 biblia). |
| `--stdout` | Imprime el JSON `.fsb` por stdout en vez de escribir archivo. |

Ejemplo apuntando explícito a la carpeta de FreeShow:

```bash
node convert.mjs "C:\Users\CCCR\Downloads\bible_import_WIN\output" --out "C:\Users\CCCR\Documents\FreeShow\Bibles"
```

## Después de convertir

El archivo `.fsb` queda en la carpeta `Bibles`, pero FreeShow **no lo registra
solo**. Para activarlo (una vez por biblia):

**FreeShow → Drawer → Scripture → Import → Local → seleccioná la versión.**

Aparece en la lista de biblias locales y queda lista para usar (mostrar
versículos, buscar referencias, etc.).

## Formato de entrada esperado

```
RVR1960/
├── metadata.xml        # nombres de libros (es) + orden canónico
├── rvmetadata.xml      # nombre para mostrar + abreviatura
└── USX_1/
    ├── GEN.usx
    ├── EXO.usx
    └── ...             # un archivo USX por libro
```

## Qué hace con los datos

- **Nombre de la biblia**: de `rvmetadata.xml` → `<name>` (ej. *Biblia Reina Valera 1960*).
- **Abreviatura**: de `rvmetadata.xml` → `<abbreviation>` (queda en `metadata`).
- **Libros**: en el orden de `metadata.xml`; nombre en español tomado de
  `<short>` y normalizado a Mayúscula Inicial (`GÉNESIS` → `Génesis`,
  `SAN JUAN` → `San Juan`); abreviatura de `<abbr>` (`Gn.`).
- **Versículos**: el texto es el contenido que sigue a cada `<verse/>` dentro de
  `<para style="p">`. Los `<para style="s1">` (títulos de sección) se **ignoran**.
- **Rangos** (`number="1-2"`): se expanden a versículos individuales (1 y 2) con
  el mismo texto, para que cualquier referencia resuelva.

## Salida

Un `.fsb` por biblia: JSON `[id, bible]` con la forma que usa FreeShow:

```json
["<id>", {
  "name": "Biblia Reina Valera 1960",
  "metadata": { "abbreviation": "RVR1960" },
  "books": [
    { "number": 1, "name": "Génesis", "abbreviation": "Gn.",
      "chapters": [
        { "number": 1, "verses": [ { "number": 1, "text": "En el principio…" } ] }
      ] }
  ]
}]
```

## Probado con

DHHS94 (75 libros, deuterocanónicos), NLT, NTV, NVI, PDT, RVR1960, TLA — los 7 OK.
Spot-check: Juan 3:16, Génesis 1:1 y expansión de rangos verificados.

## Notas

- El export del importador no incluye el texto de copyright/licencia
  (`<license/>` viene vacío), así que el campo copyright queda en blanco. El
  contenido de estas versiones tiene licencia: usalas según corresponda.
- Solo procesa `USX_1/`. Si una versión tuviera variantes (`USX_2/`…) habría que
  ampliarlo.
