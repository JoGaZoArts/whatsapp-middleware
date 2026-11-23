/**
 * Diligencia el informe intermedio de practicas sobre una COPIA del .docx,
 * modificando word/document.xml dentro del paquete ZIP.
 *
 * Las filas se sustituyen dentro del XML original: reconstruir la tabla elimina
 * <w:tblPr> y <w:tblGrid>.
 *
 * Uso: npx tsx tools/llenar-informe.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ORIGEN =
  'C:\\Users\\Juan D Ladino R\\Documents\\Ingenier\u00eda Inform\u00e1tica\\Semestre 8\\M\u00f3dulo 1\\Pr\u00e1ctica Empresarial\\informe_intermedio.docx'
const DESTINO = resolve(process.cwd(), 'docs/informe_intermedio_diligenciado.docx')
const EXTRACT = resolve(process.cwd(), 'docs/_extract')

const DATOS = {
  programa: 'Ingenier\u00eda Inform\u00e1tica',
  alumno: {
    apellidos: 'Ladino Ramírez',
    nombre: 'Juan Diego',
    correo: 'juanladinoxp@gmail.com',
    cedula: '1020820609',
    tel1: '3133766995',
  },
  centro: {
    nombre: 'ITACA SOLUCIONES SAS',
    direccion: 'Av. Carrera 72 # 49-29',
    municipio: 'Bogot\u00e1',
  },
  tutor: {
    apellidos: 'Fique',
    nombre: 'Tatiana',
    correo: 'Tfique@itacasoluciones.com',
    cedula: 'N/A',
    tel1: '57-3009570727',
  },
}

const CRONOGRAMA = [
  'Revisi\u00f3n inicial del proyecto y definici\u00f3n del alcance con el \u00e1rea de sistemas',
  'Prototipo de la conexi\u00f3n con WhatsApp Business (Cloud API de Meta)',
  'Migraci\u00f3n del servicio a la infraestructura corporativa (entorno sin servidor y PostgreSQL)',
  'Construcci\u00f3n del servicio (recepci\u00f3n autenticada, anonimizaci\u00f3n, clasificaci\u00f3n con IA y auditor\u00eda de tiempos de respuesta) y verificaci\u00f3n mediante pruebas automatizadas',
]

const COMENTARIOS = [
  'El proyecto avanza conforme a lo previsto. El ritmo de trabajo se ha mantenido dentro de las actividades acordadas, y el desarrollo se encuentra actualmente en la etapa de verificaci\u00f3n.',
  'Se observa que las tareas de car\u00e1cter t\u00e9cnico se resolvieron en su totalidad, mientras que los puntos que dependen de la empresa (habilitaci\u00f3n de la cuenta en la plataforma de Meta y definici\u00f3n de la interfaz de atenci\u00f3n para los agentes) siguen en espera.',
  'No se identifican factores que impidan la entrega.',
]

// ==========================================
// Utilidades XML
// ==========================================
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function run(texto: string): string {
  return '<w:r><w:t xml:space="preserve">' + esc(texto) + '</w:t></w:r>'
}

function parrafo(texto: string): string {
  return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>' + run(texto) + '</w:p>'
}

const tablasDe = (xml: string): string[] =>
  [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0])
const filasDe = (tabla: string): string[] =>
  [...tabla.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0])
const celdasDe = (fila: string): string[] =>
  [...fila.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((m) => m[0])

/**
 * Sustituye celdas dentro de una fila conservando el envoltorio <w:tr>.
 * celdasDe() solo devuelve los <w:tc>, no la fila completa.
 */
function conCeldasModificadas(fila: string, celdasNuevas: string[]): string {
  const originales = celdasDe(fila)
  if (originales.length !== celdasNuevas.length) {
    throw new Error(
      'numero de celdas distinto: ' + originales.length + ' vs ' + celdasNuevas.length
    )
  }
  // De derecha a izquierda, para que los desplazamientos de las celdas
  // anteriores no se invaliden.
  for (let k = originales.length - 1; k >= 0; k--) {
    if (originales[k] === celdasNuevas[k]) continue
    const idx = fila.indexOf(originales[k])
    if (idx === -1) throw new Error('no se encontro la celda ' + k)
    fila = fila.slice(0, idx) + celdasNuevas[k] + fila.slice(idx + originales[k].length)
  }
  return fila
}

/** Sustituye la fila indicada por una version nueva, sin tocar el resto de la tabla. */
function conFilaModificada(tabla: string, indiceFila: number, celdasNuevas: string[]): string {
  const filas = filasDe(tabla)
  const original = filas[indiceFila]
  if (!original) throw new Error('no existe la fila ' + indiceFila)
  return tabla.replace(original, conCeldasModificadas(original, celdasNuevas))
}

/** Anade un run al final del ultimo parrafo de una celda. */
function anadirEnCelda(celda: string, texto: string): string {
  const cierre = celda.lastIndexOf('</w:p>')
  if (cierre === -1) return celda
  return celda.slice(0, cierre) + run(texto) + celda.slice(cierre)
}

/** Sustituye todos los runs de una celda por un texto nuevo. */
function textoEnCelda(celda: string, texto: string): string {
  return anadirEnCelda(celda.replace(/<w:r[ >][\s\S]*?<\/w:r>/g, ''), texto)
}

/**
 * Anade parrafos antes del cierre de la celda, conservando el <w:tc>.
 */
function anadirParrafosEnCelda(celda: string, parrafos: string[]): string {
  if (parrafos.length === 0) return celda
  const cierre = celda.lastIndexOf('</w:tc>')
  if (cierre === -1) throw new Error('la celda no cierra con </w:tc>')
  return celda.slice(0, cierre) + parrafos.join('') + celda.slice(cierre)
}

// ==========================================
let xml = readFileSync(resolve(EXTRACT, 'intermedio.xml'), 'utf8')
const largoOriginal = xml.length

// ---------- Programa de estudios ----------
const programaAntes = xml
xml = xml.replace(
  /<w:r><w:rPr>(?:(?!<\/w:r>)[\s\S])*?<w:t>_{5,}<\/w:t><\/w:r>/,
  run(DATOS.programa)
)
if (xml === programaAntes) console.log('AVISO: no se sustituyo "Programa de estudios"')

// ---------- Tabla 1: Datos del alumno ----------
{
  let t = tablasDe(xml)[0]
  let c = celdasDe(filasDe(t)[1])
  c[1] = anadirEnCelda(c[1], DATOS.alumno.apellidos)
  c[3] = anadirEnCelda(c[3], DATOS.alumno.nombre)
  t = conFilaModificada(t, 1, c)

  c = celdasDe(filasDe(t)[2])
  c[1] = anadirEnCelda(c[1], DATOS.alumno.correo)
  c[3] = anadirEnCelda(c[3], DATOS.alumno.cedula)
  t = conFilaModificada(t, 2, c)

  c = celdasDe(filasDe(t)[3])
  c[1] = anadirEnCelda(c[1], DATOS.alumno.tel1)
  t = conFilaModificada(t, 3, c)

  xml = xml.replace(tablasDe(xml)[0], t)
}

// ---------- Tabla 2: Centro de practicas ----------
{
  let t = tablasDe(xml)[1]
  for (const [indice, valor] of [
    [1, DATOS.centro.nombre],
    [2, DATOS.centro.direccion],
    [3, DATOS.centro.municipio],
  ] as [number, string][]) {
    const c = celdasDe(filasDe(t)[indice])
    c[1] = anadirEnCelda(c[1], valor)
    t = conFilaModificada(t, indice, c)
  }
  xml = xml.replace(tablasDe(xml)[1], t)
}

// ---------- Tabla 3: Tutor ----------
{
  let t = tablasDe(xml)[2]
  let c = celdasDe(filasDe(t)[1])
  c[1] = anadirEnCelda(c[1], DATOS.tutor.apellidos)
  c[3] = anadirEnCelda(c[3], DATOS.tutor.nombre)
  t = conFilaModificada(t, 1, c)

  c = celdasDe(filasDe(t)[2])
  c[1] = anadirEnCelda(c[1], DATOS.tutor.correo)
  c[3] = anadirEnCelda(c[3], DATOS.tutor.cedula)
  t = conFilaModificada(t, 2, c)

  c = celdasDe(filasDe(t)[3])
  c[1] = anadirEnCelda(c[1], DATOS.tutor.tel1)
  t = conFilaModificada(t, 3, c)

  xml = xml.replace(tablasDe(xml)[2], t)
}

// ---------- Tabla 4: Las tres respuestas ----------
{
  const r1 = readFileSync(resolve(EXTRACT, 'r1.txt'), 'utf8').trim()
  const r2 = readFileSync(resolve(EXTRACT, 'r2.txt'), 'utf8').trim()
  const r3 = readFileSync(resolve(EXTRACT, 'r3.txt'), 'utf8').trim()

  const bloque = (texto: string) =>
    '<w:p><w:pPr><w:spacing w:before="80" w:after="120"/></w:pPr>' +
    '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Respuesta:</w:t></w:r></w:p>' +
    texto
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(parrafo)
      .join('')

  let t = tablasDe(xml)[3]
  const c = celdasDe(filasDe(t)[1])
  let celda = c[0]
  const parrafos = [...celda.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0])

  // Insertar de la ultima a la primera para no invalidar los indices
  for (const [indice, texto] of [
    [4, r3],
    [3, r2],
    [2, r1],
  ] as [number, string][]) {
    celda = celda.replace(parrafos[indice], parrafos[indice] + bloque(texto))
  }
  c[0] = celda
  t = conFilaModificada(t, 1, c)
  xml = xml.replace(tablasDe(xml)[3], t)
}

// ---------- Tabla 5: Cronograma ----------
{
  let t = tablasDe(xml)[4]
  for (let i = 0; i < CRONOGRAMA.length; i++) {
    const indiceFila = 2 + i
    const filas = filasDe(t)
    if (indiceFila >= filas.length) break
    const c = celdasDe(filas[indiceFila])
    if (c.length < 5) continue
    c[0] = anadirEnCelda(c[0], CRONOGRAMA[i])
    c[1] = textoEnCelda(c[1], '____/____/________')
    c[2] = textoEnCelda(c[2], '____/____/________')
    c[3] = textoEnCelda(c[3], 'X')
    c[4] = textoEnCelda(c[4], '')
    t = conFilaModificada(t, indiceFila, c)
  }
  // Comentarios: F7 es el encabezado, F8 el area de texto.
  // Se anaden parrafos dentro de la celda, sin reemplazar su envoltorio.
  const filas = filasDe(t)
  if (filas.length > 7) {
    const c = celdasDe(filas[7])
    if (c.length > 0) {
      c[0] = anadirParrafosEnCelda(c[0], COMENTARIOS.map(parrafo))
      t = conFilaModificada(t, 7, c)
    } else {
      throw new Error('la fila de comentarios no tiene celdas')
    }
  }
  xml = xml.replace(tablasDe(xml)[4], t)
}

// ==========================================
// Validaciones
// ==========================================
const nTablas = tablasDe(xml).length
const abrenT = (xml.match(/<w:t[ >]/g) || []).length
const cierranT = (xml.match(/<\/w:t>/g) || []).length
const abrenTr = (xml.match(/<w:tr[ >]/g) || []).length
const cierranTr = (xml.match(/<\/w:tr>/g) || []).length

console.log('tablas: ' + nTablas + ' (esperado 6)')
console.log('w:t   ' + abrenT + ' / ' + cierranT + '  ' + (abrenT === cierranT ? 'OK' : 'DESBALANCEADO'))
console.log('w:tr  ' + abrenTr + ' / ' + cierranTr + '  ' + (abrenTr === cierranTr ? 'OK' : 'DESBALANCEADO'))
console.log('largo: ' + largoOriginal + ' -> ' + xml.length)

const problemas: string[] = []
if (nTablas !== 6) problemas.push('numero de tablas incorrecto')
if (abrenT !== cierranT) problemas.push('w:t desbalanceado')
if (abrenTr !== cierranTr) problemas.push('w:tr desbalanceado')
// cada tabla debe conservar su tblGrid
const sinGrid = tablasDe(xml).filter((t) => !t.includes('<w:tblGrid>')).length
if (sinGrid > 0) problemas.push(sinGrid + ' tabla(s) sin <w:tblGrid>')
console.log('tablas sin tblGrid: ' + sinGrid)

if (problemas.length > 0) {
  console.error('\nABORTADO: ' + problemas.join('; '))
  process.exit(1)
}

writeFileSync(resolve(EXTRACT, 'intermedio-lleno.xml'), xml, 'utf8')

execSync(
  'powershell -NoProfile -ExecutionPolicy Bypass -File tools\\reempaquetar.ps1' +
    ' -Original "' + ORIGEN + '"' +
    ' -DocumentoXml "' + resolve(EXTRACT, 'intermedio-lleno.xml') + '"' +
    ' -Destino "' + DESTINO + '"',
  { stdio: 'inherit' }
)
console.log('\ndocx escrito: ' + DESTINO)
