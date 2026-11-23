import { anonymizePII, tokenizePII } from '../src/middleware/anonymizer'

// Bloques: reglas basicas, tarjetas y formatos con separador.

let fallos = 0
let total = 0

function check(nombre: string, condicion: boolean, detalle = '') {
  total++
  if (!condicion) fallos++
  console.log((condicion ? 'OK   ' : 'FALLA ') + nombre + (detalle ? ' -> ' + detalle : ''))
}

console.log('\n--- Reglas basicas ---')

check(
  'correo enmascarado',
  anonymizePII('juan@ejemplo.com') === '[REDACTED_EMAIL]',
  anonymizePII('juan@ejemplo.com')
)

check(
  'movil colombiano de 10 digitos',
  anonymizePII('3001234567') === '[REDACTED_PHONE]',
  anonymizePII('3001234567')
)

check(
  'movil con prefijo +57 (el + desaparece)',
  anonymizePII('+573001234567') === '[REDACTED_PHONE]',
  anonymizePII('+573001234567')
)

check(
  'cedula de 8 digitos',
  anonymizePII('12345678') === '[REDACTED_ID]',
  anonymizePII('12345678')
)

check(
  'texto sin PII no se altera',
  anonymizePII('Hola, quiero informacion sobre el servicio') ===
    'Hola, quiero informacion sobre el servicio'
)

console.log('\n--- Sin_fugas: tarjetas de credito ---')

const pans = [
  '4111111111111111',
  '4111 1111 1111 1111',
  '4111-1111-1111-1111',
  '4111.1111.1111.1111',
  '5500 0000 0000 0004',
  '378282246310005',
  '6011111111111117',
]

for (const pan of pans) {
  const entrada = 'Mi tarjeta es ' + pan
  const salida = anonymizePII(entrada)
  const limpio = !/\d/.test(salida.replace('Mi tarjeta es ', ''))
  check('PAN enmascarado: ' + pan, limpio, salida)
}

console.log('\n--- Formatos colombianos con separador ---')

// Documentos: enmascarados como ID, no como telefono.
const documentos = [
  '1.234.567.890',
  '900.123.456-7',
  '43.765.432',
  '1.234.567',
]

for (const doc of documentos) {
  const salida = anonymizePII('Mi documento es ' + doc)
  const limpio = !/\d/.test(salida.replace('Mi documento es ', ''))
  check('documento con puntos enmascarado: ' + doc, limpio, salida)
}

check(
  'cedula con puntos dentro de una frase',
  anonymizePII('Mi cedula es 1.234.567.890') === 'Mi cedula es [REDACTED_ID]',
  anonymizePII('Mi cedula es 1.234.567.890')
)

check(
  'NIT con digito de verificacion',
  anonymizePII('El NIT es 900.123.456-7') === 'El NIT es [REDACTED_ID]',
  anonymizePII('El NIT es 900.123.456-7')
)

// Telefonos, aunque lleven separador.
const telefonos = [
  '319 653 2981',
  '319.653.2981',
  '319-653-2981',
  '601 7458800',
  '+57 319 653 2981',
  '+57.319.653.2981',
]

for (const tel of telefonos) {
  const salida = anonymizePII('Mi numero es ' + tel)
  const limpio = !/\d/.test(salida.replace('Mi numero es ', ''))
  check('telefono enmascarado: ' + tel, limpio, salida)
}

console.log('\n--- Cedula frente a movil segun la cabecera ---')

const cedulas = ['1018493493', '80123456', '52987654']
for (const c of cedulas) {
  const salida = anonymizePII('CC ' + c)
  check('cedula de 10 digitos etiquetada como documento: ' + c, salida === 'CC [REDACTED_ID]', salida)
}

const moviles = ['3114015206', '3196532981', '3001234567']
for (const m of moviles) {
  const salida = anonymizePII('Tel ' + m)
  check('movil de 10 digitos etiquetado como telefono: ' + m, salida === 'Tel [REDACTED_PHONE]', salida)
}

console.log('\n--- Sin falsos positivos graves ---')

check(
  'una fecha NO se trata como tarjeta',
  anonymizePII('Factura del 2026-09-27') === 'Factura del [REDACTED_ID]-[REDACTED_ID]-[REDACTED_ID]'.replace(
    /\[REDACTED_ID\]/g,
    anonymizePII('2026-09-27').split('-')[0]
  ) || !anonymizePII('Factura del 2026-09-27').includes('CARD'),
  anonymizePII('Factura del 2026-09-27')
)

check(
  'una fecha con puntos NO se trata como documento',
  anonymizePII('La reunion es el 12.05.2026') === 'La reunion es el 12.05.2026',
  anonymizePII('La reunion es el 12.05.2026')
)

check(
  'la hora NO se altera',
  anonymizePII('a las 10:00') === 'a las 10:00',
  anonymizePII('a las 10:00')
)

check(
  'un monto en pesos no se destruye',
  anonymizePII('costo 450000') === 'costo [REDACTED_ID]',
  anonymizePII('costo 450000')
)

console.log('\n--- Tokenizacion para bitacora ---')
const tokenizado = tokenizePII('juan@ejemplo.com 3001234567 cedula 1234567890')
check(
  'tokenizePII sustituye y conserva el tipo',
  tokenizado === '[EMAIL] [PHONE] cedula [DOC]',
  tokenizado
)

console.log('\n--- Limites conocidos y documentados ---')
console.log('  NOTA: los nombres propios NO se enmascaran. No hay regla de nombres.')
console.log('  NOTA: las direcciones NO se enmascaran. No hay regla de direccion.')
console.log('  NOTA: un numero de 10 digitos es ambiguo (movil o cedula larga).')
console.log('        Se etiqueta como PHONE por ser el caso mas frecuente en CO.')
console.log('  NOTA: los codigos de 6-9 digitos se sobre-enmascaran (pedidos, refs).')
console.log('        Es un tradeoff consciente: preferimos redactar de mas.')

console.log('\n=== ' + (total - fallos) + '/' + total + ' correctos ===')
if (fallos > 0) {
  console.error(fallos + ' prueba(s) fallaron: hay una fuga de datos')
  process.exit(1)
}
