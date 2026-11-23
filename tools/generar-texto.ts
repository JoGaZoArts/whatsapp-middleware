import { readFileSync, writeFileSync } from 'node:fs'

const r = ['r1', 'r2', 'r3'].map((f) => readFileSync('docs/_extract/' + f + '.txt', 'utf8').trim())

const COMENTARIOS = [
  'El proyecto se desarrolla desde el 4 de septiembre y avanza conforme a lo previsto, con un ritmo de trabajo sostenido dentro de las actividades acordadas.',
  'El sistema ha venido operando sobre una línea de prueba con el comportamiento previsto. Cubre los cuatro frentes definidos en el proyecto: recepción autenticada, anonimización de la información personal, clasificación con inteligencia artificial y auditoría de tiempos de respuesta.',
  'El trabajo continúa en esta línea. La presentación de resultados a la empresa forma parte de esta evolución, y lo que en ella se observe quedará recogido en el informe del período restante de prácticas.',
  'El alcance de la interfaz de atención autoalojada se sigue definiendo junto con la tutora del centro.',
]

const ACTIVIDADES = [
  'Revisión inicial del proyecto y definición del alcance con el área de sistemas',
  'Prototipo de la conexión con WhatsApp Business (Cloud API de Meta)',
  'Construcción del servicio y migración a la infraestructura corporativa (entorno sin servidor y PostgreSQL)',
  'Evolución de la integración: evaluación de la interfaz de atención autoalojada y de la conexión con las plataformas internas de la empresa',
]

const DATOS: [string, string][] = [
  ['Programa de estudios', 'Ingeniería Informática'],
  ['Alumno', 'Juan Diego Ladino Ramírez'],
  ['Correo', 'juanladinoxp@gmail.com'],
  ['Cédula', '1020820609'],
  ['Teléfono 1', '3133766995'],
  ['Centro de prácticas', 'ITACA SOLUCIONES SAS'],
  ['Dirección', 'Av. Carrera 72 # 49-29'],
  ['Municipio', 'Bogotá'],
  ['Tutor (profesional)', 'Tatiana Fique'],
  ['Correo del tutor', 'Tfique@itacasoluciones.com'],
  ['Cédula del tutor', 'N/A'],
  ['Teléfono del tutor', '57-3009570727'],
]

const linea = (c = '=') => c.repeat(74)
const titulo = (t: string) => t + '\n' + linea('-') + '\n'

let out = ''
out += 'INFORME INTERMEDIO - PRÁCTICA EMPRESARIAL\n'
out += 'ITACA SOLUCIONES SAS\n'
out += linea() + '\n\n'

out += titulo('1. ESTADO DEL PROYECTO DE PRÁCTICAS') + r[0] + '\n\n'
out += titulo('2. RIESGOS IDENTIFICADOS') + r[1] + '\n\n'
out += titulo('3. MODIFICACIONES AL PLAN DE PRÁCTICAS') + r[2] + '\n\n'
out += titulo('COMENTARIOS Y OBSERVACIONES ADICIONALES') + COMENTARIOS.join('\n\n') + '\n\n'

out += titulo('CRONOGRAMA')
for (let i = 0; i < ACTIVIDADES.length; i++) {
  out += '\n' + (i + 1) + '. ' + ACTIVIDADES[i] + '\n'
  out += '   Revisión inicial (fecha):  ____/____/________\n'
  out += '   Primera entrega (fecha):    ____/____/________\n'
  out += '   Actividades desarrolladas:  [ X ] SÍ     [   ] NO\n'
}

out += '\n\n' + titulo('DATOS DEL ALUMNO Y DEL CENTRO')
for (const [k, v] of DATOS) out += (k + ':').padEnd(22) + ' ' + v + '\n'

writeFileSync('docs/TEXTO-PARA-COPIAR.txt', out, 'utf8')

// ---------------- VALIDACION ----------------
console.log('=== VALIDACION ===')
for (const [i, t] of r.entries()) {
  const p = t.split(/\s+/).filter((w) => /[\wÀ-ÿ]/.test(w)).length
  console.log('  Respuesta ' + (i + 1) + ': ' + p + ' palabras  ' + (p <= 300 ? 'OK' : 'EXCEDE'))
}
console.log('  Comentarios: ' + COMENTARIOS.join(' ').split(/\s+/).length + ' palabras (sin limite)')

const checks: [string, boolean][] = [
  ['caracteres no latinos', [...out.matchAll(/[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uFFFD]/g)].length === 0],
  ['palabras pegadas', [...out.matchAll(/[a-z\u00F1][A-Z][a-z]{2,}/g)].map((m) => m[0]).filter((x) => !['sApp','pApp'].includes(x)).length === 0],
  ['entidades sin resolver', (out.match(/&[a-z]+;/g) || []).length === 0],
  ['sin fechas de corte inventadas', (out.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length === 0],
  ['sin casillas de fecha en comentarios', !COMENTARIOS.join(' ').includes('____')],
  ['8 casillas de fecha', (out.match(/____\/____\/________/g) || []).length === 8],
  ['4 actividades', ACTIVIDADES.length === 4],
  ['4 marcas SI', (out.match(/\[ X \] S\u00CD/g) || []).length === 4],
  ['actividad 3 incluye la construccion', ACTIVIDADES[2].includes('Construcci\u00f3n')],
  ['actividad 4 es la evolucion de la integracion', ACTIVIDADES[3].includes('Evoluci\u00f3n de la integraci\u00f3n')],
  ['actividad 4 menciona la interfaz autoalojada', ACTIVIDADES[3].includes('autoalojada')],
  ['actividad 4 no es entrega ni demostracion', !/entrega|demostraci\u00f3n/i.test(ACTIVIDADES[3])],
  ['servicio ha venido operando', COMENTARIOS[1].includes('ha venido operando')],
  ['sin palabra concluida', !COMENTARIOS.join(' ').includes('concluida')],
  ['el informe a la empresa es parte de la evolucion', COMENTARIOS[2].includes('forma parte de esta evoluci\u00f3n')],
  ['se recogera en el siguiente informe', COMENTARIOS[2].includes('per\u00edodo restante de pr\u00e1cticas')],
  ['sin atribucion de autoria externa', !/asistido|generado con|ayuda de (una )?inteligencia artificial/i.test(out)],
  ['comentarios sin comprometer a la empresa', !COMENTARIOS.join(' ').match(/Meta|Chatwoot|dependen de la empresa|bloquea/)],
]
console.log('')
for (const [que, ok] of checks) console.log('  ' + (ok ? 'OK   ' : 'FALLA') + ' ' + que)

const fallos = checks.filter(([, ok]) => !ok).length
console.log('')
console.log('  archivo: docs/TEXTO-PARA-COPIAR.txt (' + out.length + ' caracteres)')
console.log(fallos === 0 ? '  TODO OK' : '  ' + fallos + ' COMPROBACIONES FALLIDAS')
