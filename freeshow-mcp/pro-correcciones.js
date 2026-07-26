// Reviewed corrections for the first migration batch.
//
// SCOPE: orthography only — accents, evident typos, capitalisation, Spanish
// punctuation, and splitting lines that were pasted together. The wording is
// never changed: if a line reads oddly it stays as the church typed it.
//
// Keyed by source file name. `lines` replaces the slide list one-for-one when
// present; `split` entries turn one slide into several lines.

export const CORRECCIONES = {
    "¿A QUIÉ IRÉ (MARCOS WITT ).pro": {
        title: "¿A quién iré?", // el archivo decía "QUIÉ"
        artist: "Marcos Witt",
        lines: [
            "A quién iré en necesidad",
            "A quién iré en busca de paz",
            "Y quién podrá mi vida saciar de verdad",
            "Quién más tendrá de mí compasión", // "Quien"->"Quién", "mi"->"mí"
            "Y entenderá mi corazón",
            "Quién cambiará mi eternidad, sino Tú, Jesús", // "cambiara"->"cambiará"
            "Cristo, ¿a dónde más podría ir?",
            "Cristo, ¿qué otro lugar puede existir?",
            "Solo Tú tienes palabras de amor",
            "Camino al Padre y verdad eres Tú",
            "Cristo, ¿a dónde más podría ir?"
        ]
    },

    "A Danzar (Barak) (1).pro": {
        title: "A danzar",
        artist: "Barak",
        lines: [
            "A danzar",
            "delante de Su presencia",
            "Su amor es quien nos sustenta",
            "Él es Dios, Él es quien resucitó", // "el es"->"Él es", "resucito"->"resucitó"
            "A danzar",
            "Da un paso al frente, haz algo diferente", // "has"->"haz"
            "Es el gran Yo Soy que murió en la cruz",
            "Levanta tus manos, grita que Él es Santo",
            "Es el gran Yo Soy que murió en la cruz",
            "Si tú respiras tienes que adorar",
            "Que nada te impida danzar",
            "¡A danzar!",
            "Delante de Su presencia",
            "Su amor es quien nos sustenta",
            "Él es Dios, Él es fiel, es quien resucitó",
            "A danzar",
            "A Dios vamos a adorar", // "a dorar"->"a adorar"
            "Su amor hay que celebrar",
            "Él es Dios, Él es quien resucitó",
            "A danzar"
        ]
    },

    "A Dios sea la gloria (Crystal Lewis).pro": {
        title: "A Dios sea la gloria",
        artist: "Crystal Lewis",
        lines: [
            "Cómo agradecer todas las cosas que has hecho por mí", // "Como"->"Cómo"
            "Cosas inmerecidas",
            "que diste para mostrar Tu amor por mí",
            "Las voces de un millón de ángeles no expresarán mi gratitud", // "expresarón"
            "Todo lo que soy y lo que anhelo ser lo debo todo a Ti", // "a tí"->"a Ti"
            "A Dios sea la gloria",
            "Por lo que hizo por mí",
            "Con Su sangre me ha limpiado, con Su poder me ha salvado",
            "A Dios sea la gloria",
            "Por lo que hizo por mí",
            "Quiero vivir, Señor",
            "rendido siempre solo a Ti", // "a tí"->"a Ti"
            "Pongo a Tus pies lo que soy, porque diste todo, Señor, por mí",
            "Con Su sangre me ha limpiado, con Su poder me ha salvado",
            "A Dios sea la gloria",
            "Por lo que hizo por mí"
        ]
    },

    "A EL ALTO Y SUBLIME (Gadiel Espinosa).pro": {
        title: "Al alto y sublime",
        artist: "Gadiel Espinosa",
        lines: [
            "Al alto y sublime",
            "que habita la eternidad",
            "y Su nombre es el Santo de Israel",
            "Al que habita en las alturas",
            "y en la santidad",
            "y con el quebrantado y humilde de espíritu",
            "Para hacer vivir el espíritu humilde",
            "y para vivificar",
            "el corazón quebrantado",
            "Sea la gloria",
            "honor",
            "alabanza y poder",
            "Al que reina",
            "por los siglos",
            "y Su nombre Santo es"
        ]
    },

    "A quien iré (Julio melgar).pro": {
        title: "¿A quién iré?",
        artist: "Julio Melgar",
        lines: [
            "Y dime, solo dime una vez más",
            "con Tus palabras, dulces palabras",
            "Mi destino se hace claro\ncuando alumbras mi camino\ncon Tus palabras", // venía todo en un renglón
            "Mi corazón ardiendo está\npor volverte a escuchar",
            "Solo vuélvelo a decir",
            "y sé que todo cambiará",
            "¿A quién iré?, ¿a quién iré?",
            "Si solo Tú tienes palabras de vida",
            "¿A quién iré?"
        ]
    },

    "A ti (Marcos Witt).pro": {
        title: "A Ti",
        artist: "Marcos Witt",
        lines: [
            "A Ti, el Alfa y la Omega",
            "el Principio y el Fin",
            "y el Grande Yo Soy",
            "me rindo",
            "A Ti, el Todopoderoso",
            "el que es y quien será",
            "y el Gran Yo Soy",
            "me entrego",
            "Yo quiero que gobiernes mi vida",
            "me doy en sacrificio a Ti",
            "Yo quiero que Tú ordenes mi caminar",
            "y que siempre viva en Tu voluntad"
        ]
    },

    "A ti sea la gloria (Marcela Gandara).pro": {
        title: "A Ti sea la gloria",
        artist: "Marcela Gandara",
        lines: [
            "No existen más motivos, Señor",
            "venimos hoy rendidos a Ti",
            "La única razón de nuestra adoración hoy", // "adoracion"
            "eres Tú",
            "Elevamos olor fragante para Ti",
            "para Ti",
            "Solo a Ti",
            "sea la gloria, Señor",
            "la alabanza y la adoración",
            "Toda rodilla se doble ante el único Rey y Dios", // "ùnico" traía la tilde al revés
            "Solo a Ti",
            "sea la gloria, Señor",
            "la alabanza y la adoración",
            "que toda lengua confiese que Tú eres el Señor",
            "Tú eres el Señor",
            "eres el Señor"
        ]
    }
}
