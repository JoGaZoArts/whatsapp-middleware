// Probador de anonimizacion. Muestra el texto antes y despues de pasar por el
// anonimizador.
//
//   npx tsx tools/probar-anonimizacion.ts                 -> ejemplos de Colombia
//   npx tsx tools/probar-anonimizacion.ts datos/mios.txt   -> datos propios
//
// Funcion pura: no llama a servicios externos ni escribe en la base.

import { readFileSync, existsSync } from 'node:fs'
import { anonymizePII } from '../src/middleware/anonymizer'

// ---------------------------------------------------------------
// Casos de ejemplo en formatos colombianos habituales
// ---------------------------------------------------------------
const EJEMPLOS: string[] = [
  'Mi cedula es 1.234.567.890',
  'El NIT de la empresa es 900.123.456-7',
  'Mi numero es 319 653 2981',
  'Escribame al 319.653.2981',
  'WhatsApp +57 319 653 2981',
  'Llame al 3196532981',
  'La linea es 601 7458800',
  'CC 1012345678',
  'documento 43.765.432',
  'Mi correo es ana.ruiz@ejemplo.com',
  'Pague con la 4111 1111 1111 1111',
  'Vivo en la Calle 100 #45-67, Bogota',
  'Soy Valentina Rios y quiero informacion',
  'Quiero cotizar un plan empresarial para mi empresa',
  'La reunion es el 2026-09-27 a las 10:00',
  'La reunion es el 12.05.2026',
  'La reunion es el 12/05/2026',
]

// ---------------------------------------------------------------
// Carga de los datos del usuario
// ---------------------------------------------------------------
const args = process.argv.slice(2)
const breve = args.includes('--breve')
const ruta = args.find((a) => !a.startsWith('--'))
let casos: string[]
let origen: string

if (ruta) {
  if (!existsSync(ruta)) {
    console.error('No existe el archivo: ' + ruta)
    process.exit(1)
  }
  casos = readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  origen = ruta
} else {
  casos = EJEMPLOS
  origen = 'ejemplos de Colombia (datos sinteticos)'
}

// Deteccion de remanentes. Si tras anonimizar queda un grupo de al menos
// cuatro digitos, se marca REVISAR: puede ser un dato que se escapo, o algo
// inocuo como un ano. Las fechas y los marcadores se descartan antes.
// Las barras van escapadas: una sin escape cierra el literal.
const RE_SOSPECHOSO = /\d{1,3}[.,]\d{3}[.,]\d{3}|\d{4,}/

const RE_NO_ES_PII = new RegExp(
  '\\[REDACTED_[A-Z_]+\\]' +
    '|\\b\\d{4}-\\d{2}-\\d{2}\\b' +
    '|\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b' +
    '|\\b\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}\\b' +
    '|\\b\\d{1,2}:\\d{2}\\b',
  'g'
)

function esSospechoso(salida: string): boolean {
  const limpio = salida.replace(RE_NO_ES_PII, ' ')
  return RE_SOSPECHOSO.test(limpio)
}

function recortar(texto: string, n: number): string {
  return texto.length <= n ? texto : texto.slice(0, n - 1) + '...'
}

// ---------------------------------------------------------------
// Salida
// ---------------------------------------------------------------
import { c } from './color'

function dato(etiqueta: string, valor: string): void {
  console.log('  ' + c.ten(etiqueta.padEnd(18)) + valor)
}
const ancho = 62

let conFuga = 0
let cambios = 0

// En modo breve se muestran dos casos: uno que se enmascara y uno que no.
// El detalle completo queda en la vista de ejecucion.
const EJE = [2, 16]

casos.forEach((entrada, i) => {
  const salida = anonymizePII(entrada)
  const cambio = salida !== entrada
  const fuga = esSospechoso(salida)
  if (cambio) cambios++
  if (fuga) conFuga++

  if (breve && EJE.indexOf(i) === -1) return

  const marca = fuga ? c.ambar(' REVISAR ') : cambio ? c.verde('   ok   ') : c.ten('  igual ')
  console.log('  ' + c.ten('[' + String(i + 1).padStart(2) + ']') + ' ' + marca)
  console.log('      ' + c.ten('antes   ') + entrada)
  console.log('      ' + c.ten('despues ') + c.azul(salida))
})

console.log('')
dato('casos', String(casos.length))
dato('enmascarados', cambios + ' de ' + casos.length)
dato('sin enmascarar', conFuga === 0 ? c.verde('ninguno') : c.rojo(String(conFuga) + ' por revisar'))
if (breve) {
  console.log('')
  console.log('  ' + c.ten('El detalle completo de los ' + casos.length + ' casos se revisa al final.'))
}
console.log('')
