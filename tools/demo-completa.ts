/**
 * Ejecuta la verificación completa y escribe la evidencia.
 *
 *   npm run demo
 *
 * Salida: terminal y docs/evidencia/demo-visual.html.
 */

import { spawnSync, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { c, sinColor } from './color'
import { anonymizePII } from '../src/middleware/anonymizer'
import { neon } from '@neondatabase/serverless'

// =============================================================================
// Configuracion
// =============================================================================
const PUERTO = 8789
const BASE = 'http://127.0.0.1:' + PUERTO
const VISUAL = 'docs/evidencia/demo-visual.html'

const DEMO_TEL = [
  '+573001112233',
  '+573004445566',
  '+573007778899',
  '+573000000000',
  '+573009999999',
  '+573001234567',
]

const CASOS_ANON = [
  { texto: 'Mi cedula es 1.234.567.890' },
  { texto: 'El NIT de la empresa es 900.123.456-7' },
  { texto: 'Mi numero es 319 653 2981' },
  { texto: 'Escribame al 319.653.2981' },
  { texto: 'WhatsApp +57 319 653 2981' },
  { texto: 'Llame al 3196532981' },
  { texto: 'La linea es 601 7458800' },
  { texto: 'CC 1012345678' },
  { texto: 'documento 43.765.432' },
  { texto: 'Mi correo es contacto@ejemplo.com' },
  { texto: 'Pague con la 4111 1111 1111 1111' },
  { texto: 'Vivo en la Calle 100 #45-67, Bogota' },
  { texto: 'Soy Valentina Rios y quiero informacion' },
  { texto: 'Quiero cotizar un plan empresarial para mi empresa' },
  { texto: 'La reunion es el 2026-09-27 a las 10:00' },
  { texto: 'La reunion es el 12.05.2026' },
  { texto: 'La reunion es el 12/05/2026' },
]

type Fila = Record<string, unknown>
const registro: string[] = []
let fallos = 0
let total = 0

// =============================================================================
// Salida
// =============================================================================
function emitir(linea = ''): void {
  console.log(linea)
  registro.push(linea)
}

function titulo(texto: string): void {
  emitir()
  emitir('  ' + c.azul(c.neg(texto)))
  emitir('  ' + c.ten('-'.repeat(texto.length)))
}

function error(msg: string): void {
  fallos++
  emitir()
  emitir('  ' + c.rojo('>> ' + msg))
}

function check(nombre: string, ok: boolean, detalle = ''): void {
  total++
  if (!ok) fallos++
  const marca = ok ? c.verde('OK  ') : c.rojo('FALLA')
  emitir('  ' + marca + ' ' + nombre + (detalle ? '  ' + c.ten('->') + '  ' + c.morado(detalle) : ''))
}

/** Resultado del bloque: aciertos sobre el total, no el acumulado. */
function bloque(inicio: number, fallos: number): void {
  const n = total - inicio
  const f = fallos
  emitir('  ' + (f === 0 ? c.verde(n + '/' + n + ' correctos') : c.rojo((n - f) + '/' + n + ' correctos')))
}

/** Etiqueta con valor alineado. */
function dato(etiqueta: string, valor: string): void {
  emitir('  ' + c.ten(etiqueta.padEnd(22)) + valor)
}

/** Borra los datos de corridas anteriores. */
async function cleanupDemo(): Promise<void> {
  const conn = neon(DB_URL)
  for (const t of DEMO_TEL) {
    await conn`DELETE FROM lead_logs     WHERE phone = ${t}`
    await conn`DELETE FROM events        WHERE phone = ${t}`
    await conn`DELETE FROM tasks         WHERE phone = ${t}`
    await conn`DELETE FROM conversations WHERE phone = ${t}`
  }
  await cleanupEscenarios()
}

/** Borra solo los escenarios del detector de tiempos. */
async function cleanupEscenarios(): Promise<void> {
  const conn = neon(DB_URL)
  await conn`DELETE FROM tasks         WHERE thread_key LIKE 'demo-sla:%'`
  await conn`DELETE FROM conversations WHERE thread_key LIKE 'demo-sla:%'`
}

const ESCENARIO_TEL = '+573009999999'

/**
 * Instante que deja exactamente `objetivo` minutos de horario laboral
 * (lunes a viernes, 8:00 a 18:00 America/Bogota) hasta ahora.
 */
function instanteConMinutosLaborables(objetivo: number): Date {
  const INICIO_UTC = 13 // 08:00 en Bogota (UTC-5)
  const CIERRE_UTC = 23 // 18:00 en Bogota
  const JORNADA = (CIERRE_UTC - INICIO_UTC) * 60 * 60000 // en milisegundos

  let restante = objetivo
  let t = new Date()

  for (let salto = 0; salto < 40 && restante > 0; salto++) {
    const inicio = new Date(
      Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), INICIO_UTC, 0, 0)
    )
    const habil = t.getUTCDay() !== 0 && t.getUTCDay() !== 6
    const tope = habil ? Math.min(t.getTime(), inicio.getTime() + JORNADA) : inicio.getTime()
    const disponibles = Math.max(0, Math.round((tope - inicio.getTime()) / 60000))

    if (disponibles > 0) {
      if (disponibles >= restante) return new Date(t.getTime() - restante * 60000)
      restante -= disponibles
    }

    // Cierre del dia habil anterior. Sabados y domingos tienen cero minutos
    // disponibles y el ciclo continua.
    t = new Date(inicio.getTime() - 24 * 3600 * 1000 + JORNADA)
  }

  return new Date(t.getTime() - restante * 60000)
}

function ejecutar(cmd: string): string {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', env: ENTORNO })
  const salida = (r.stdout ?? '') + (r.stderr ?? '')
  const limpio = salida.split(/\r?\n/).filter((l) => !l.includes('DEP0190') && !l.includes('trace-deprecation'))
  for (const l of limpio) emitir(l)
  if (r.status !== 0) error('el comando "' + cmd + '" termino con codigo ' + r.status)
  return limpio.join('\n')
}

// =============================================================================
// Configuracion del entorno
// =============================================================================
function leerClave(nombre: string): string {
  if (!existsSync('.dev.vars')) return ''
  for (const crudo of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const linea = crudo.replace(/^\uFEFF/, '').trim()
    const m = linea.match(new RegExp('^' + nombre + '=(.+)$'))
    if (m) return m[1].trim()
  }
  return ''
}

const APP_SECRET = leerClave('APP_SECRET')
const ADMIN_KEY = leerClave('ADMIN_KEY')
const DB_URL = leerClave('DATABASE_URL')

const ENTORNO: Record<string, string> = {
  ...(process.env as Record<string, string>),
  TEST_BASE: BASE,
  APP_SECRET_TEST: APP_SECRET,
  ADMIN_KEY_TEST: ADMIN_KEY,
  VERIFY_TOKEN_TEST: leerClave('WEBHOOK_VERIFY_TOKEN'),
  CHATWOOT_SECRET_TEST: leerClave('CHATWOOT_WEBHOOK_SECRET'),
}

async function esperarServidor(msMax: number): Promise<boolean> {
  const limite = Date.now() + msMax
  while (Date.now() < limite) {
    try {
      if ((await fetch(BASE + '/health')).ok) return true
    } catch {
      // todavia no levanta
    }
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

function detener(p: ChildProcess | undefined): void {
  if (!p || p.killed) return
  try {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(p.pid)], { stdio: 'ignore' })
  } catch {
    p.kill()
  }
}

// =============================================================================
// Salida de wrangler
// =============================================================================
// wrangler dev imprime el runtime, la version y las variables que cargo.
// =============================================================================
// Recoleccion de evidencia
// =============================================================================
interface Evidencia {
  entorno: { node: string; archivoConfig: boolean; baseDatos: boolean; conversaciones: number }
  salud: Fila
  pipeline: Fila[]
  seguridad: string
  endpoints: string
  sla: string
  tareas: Fila[]
  eventos: Fila[]
  anon: { entrada: string; salida: string; cambia: boolean }[]
  modelo: string
  latencias: Record<string, number>
}

function latencia(tel: string): string {
  const ms = evidencia.latencias[tel]
  return ms === undefined ? 'n/d' : ms + ' ms'
}

const evidencia: Evidencia = {
  entorno: { node: process.versions.node, archivoConfig: existsSync('.dev.vars'), baseDatos: false, conversaciones: 0 },
  salud: {},
  pipeline: [],
  seguridad: '',
  endpoints: '',
  sla: '',
  tareas: [],
  eventos: [],
  anon: [],
  modelo: 'deepseek-flash',
  latencias: {},
}

// =============================================================================
// Programa
// =============================================================================
async function main(): Promise<void> {
  emitir('  DEMOSTRACION - Integracion WhatsApp, IA y CRM')
  emitir('  ' + new Date().toString().slice(0, 24))
  emitir()
  if (!DB_URL) {
    error('no hay DATABASE_URL en .dev.vars')
    cerrar()
    return
  }

  const sql = neon(DB_URL)

  // -------------------------------------------------------------------
  titulo('1. Entorno')
  // -------------------------------------------------------------------
  const cuenta = (await sql`SELECT count(*)::int AS n FROM conversations`) as Fila[]
  evidencia.entorno.baseDatos = true
  evidencia.entorno.conversaciones = Number(cuenta[0].n)
  emitir('  Node ' + process.versions.node + '   .dev.vars ' + (existsSync('.dev.vars') ? 'presente' : 'AUSENTE') + '   base de datos accesible')
  emitir('  Levantando el servidor local ...')

  emitir('  Runtime: wrangler dev (local)')
  emitir()
  if (!existsSync('docs/evidencia')) mkdirSync('docs/evidencia', { recursive: true })
  const LOG = 'docs/evidencia/wrangler.log'
  // La redireccion va en el comando de cmd: con shell, los handles no llegan al
  // proceso nieto. Sin detached, wrangler hereda esta consola y escribe de
  // inmediato; unref() permite que el script termine y lo deje corriendo.
  const cmd = 'npx wrangler dev --port ' + PUERTO + ' --ip 127.0.0.1 > ' + LOG + ' 2>&1'
  const w = spawn('cmd.exe', ['/d', '/c', cmd], {
    shell: false,
    windowsVerbatimArguments: true,
    stdio: 'ignore',
    env: ENTORNO,
  })
  w.unref()

  if (!(await esperarServidor(90000))) {
    error('el servidor no levanto. Revisa ' + LOG)
    detener(w)
    cerrar()
    return
  }

  await new Promise((r) => setTimeout(r, 1200))
  // De la salida de wrangler solo se toma lo que identifica el runtime. La
  // tabla completa de variables queda en docs/evidencia/wrangler.log.
  if (existsSync(LOG)) {
    const texto = readFileSync(LOG, 'utf8')
    const lineas = texto.split(/\r?\n/)
    const limpio = (l: string) =>
      l
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/[\u2500-\u27ff\uf000-\uf8ff\ufe0f\u20e3]/g, '')
        .replace(/\u26a1|\u2b50/g, '')
        .trim()

    const version = lineas.map(limpio).find((l) => /wrangler \d/.test(l))
    const secretos = lineas.some((l) => /Using secrets defined/.test(l))
    const variables = (texto.match(/^env\./gm) || []).length
    const listo = lineas.some((l) => /Ready on/.test(l))

    if (version) emitir('  ' + c.ten('runtime         ') + c.verde(version.replace(/^[^\w]*/, '')))
    dato('secretos', secretos ? c.verde('cargados desde .dev.vars') : c.rojo('no cargados'))
    dato('variables', variables + ' enlazadas al Worker')
    dato('estado', listo ? c.verde('listo') : c.ambar('iniciando'))
  }
  dato('servidor', BASE)
  emitir()

  // -------------------------------------------------------------------
  titulo('2. Estado del servicio')
  // -------------------------------------------------------------------
  const salud = (await (await fetch(BASE + '/health')).json()) as Fila
  evidencia.salud = salud
  const sla = salud.sla as Fila
  dato('base de datos', salud.database ? c.verde('ok') : c.rojo('no'))
  dato('firma webhook', salud.firmaValidada ? c.verde('validada') : c.ambar('sin validar'))
  dato('endpoints admin', salud.adminProtegido ? c.verde('protegidos') : c.rojo('sin clave'))
  dato('conector CRM', String(salud.crm))
  dato('umbral SLA', sla.umbralMinutos + ' min')
  dato('canales auditados', (sla.canales as string[]).join(', '))
  dato('horario', String(sla.horario))
  emitir()

  // -------------------------------------------------------------------
  titulo('3. Anonimizacion de datos personales')
  // -------------------------------------------------------------------
  // La terminal muestra dos casos; aqui van los diecisiete.
  ejecutar('npx tsx tools/probar-anonimizacion.ts --breve')
  emitir()
  for (const e of CASOS_ANON) {
    const salida = anonymizePII(e.texto)
    evidencia.anon.push({ entrada: e.texto, salida, cambia: salida !== e.texto })
  }

  // -------------------------------------------------------------------
  titulo('4. Firma del webhook y clasificacion')
  // -------------------------------------------------------------------
  await cleanupDemo()
  ejecutar('npx tsx test/demo-live.ts')
  emitir()

  // El filtro se aplica aqui y no en SQL: la version del cliente no admite
  // el cast de array, y la tabla es pequena.
  const todosLeads = (await sql`
    SELECT phone, message_raw, message_cleaned, ai_analysis
    FROM lead_logs ORDER BY id
  `) as Fila[]
  // +573000000000 es el numero que usa la prueba de firma: no es una
  // conversacion de negocio y no debe aparecer en la vista.
  const NEGOCIO = ['+573001112233', '+573004445566', '+573007778899']
  evidencia.pipeline = todosLeads.filter((l) => NEGOCIO.indexOf(String(l.phone)) !== -1)

  const eventos = (await sql`SELECT event_id, direction, phone FROM events ORDER BY id`) as Fila[]
  evidencia.eventos = eventos

  // -------------------------------------------------------------------
  titulo('5. Seguridad de los endpoints')
  // -------------------------------------------------------------------
  evidencia.endpoints = ejecutar('npx tsx test/integration.test.ts')
  emitir()

  // -------------------------------------------------------------------
  titulo('6. Deteccion de tiempos de respuesta')
  // -------------------------------------------------------------------
  // Se ejecuta aqui y no como subproceso: muestra la fila antes y despues del
  // barrido. No se borra al final.
  await cleanupEscenarios()
  const escenario = 'demo-sla:' + ESCENARIO_TEL
  const bloqueTotal = total
  const bloqueFallos = fallos
  // 180 minutos de horario laboral sin responder, por encima del umbral de 60.
  const haceHoras = instanteConMinutosLaborables(180).toISOString()

  emitir('  Escenario: un mensaje sin responder de hace unas horas')
  emitir()
  emitir('    INSERT INTO conversations')
  emitir('      (thread_key, channel, phone, status, last_inbound_at)')
  emitir("    VALUES ('" + escenario + "', 'chatwoot',")
  emitir('            ' + "'" + ESCENARIO_TEL + "', 'open',")
  emitir("            '" + haceHoras + "');")
  emitir()
  await sql`
    INSERT INTO conversations (thread_key, channel, phone, status, last_inbound_at)
    VALUES (${escenario}, 'chatwoot', ${ESCENARIO_TEL}, 'open', ${haceHoras})
  `

  const isoLegible = (v: unknown): string => {
    // Postgres devuelve TIMESTAMPTZ como Date de Node, que al imprimirlo sale
    // como "Thu Oct 01 2026 17:10:17 GMT-0500". Se pasa a ISO UTC para que se
    // lea igual que el valor almacenado.
    const fecha = v instanceof Date ? v : null
    const utc = fecha
      ? fecha.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
      : String(v ?? '').replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace('+00:00', ' UTC')

    if (!utc || utc === '(vacio)') return '(vacio)'

    // La hora de Bogota va al lado: el barrido corre cada quince minutos,
    // tambien fuera del horario de atencion.
    const instante = fecha ?? new Date(String(v))
    if (Number.isNaN(instante.getTime())) return utc

    const bogota = new Date(instante.getTime() - 5 * 60 * 60 * 1000)
    const hh = String(bogota.getUTCHours()).padStart(2, '0')
    const mm = String(bogota.getUTCMinutes()).padStart(2, '0')
    return utc + '   (' + hh + ':' + mm + ' Bogota)'
  }

  const filaAntes = (await sql`
    SELECT status, last_inbound_at, last_outbound_at, sla_breached_at
    FROM conversations WHERE thread_key = ${escenario}
  `) as Fila[]
  emitir('  Estado previo:')
  for (const k of ['status', 'last_inbound_at', 'last_outbound_at', 'sla_breached_at']) {
    emitir('    ' + String(k).padEnd(18) + isoLegible(filaAntes[0]?.[k]))
  }
  emitir()
  emitir('  Barrido programado:')
  emitir()
  emitir('    GET /admin/sla-scan')
  emitir()
  const rBarrido = await fetch(BASE + '/admin/sla-scan', {
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  const cuerpoBarrido = (await rBarrido.json()) as {
    incumplimientos: { threadKey: string; waitingMinutes: number }[]
    umbral: number
  }
  emitir('    ' + rBarrido.status + '  ' + JSON.stringify(cuerpoBarrido))
  emitir()

  const filaDespues = (await sql`
    SELECT status, last_inbound_at, last_outbound_at, sla_breached_at
    FROM conversations WHERE thread_key = ${escenario}
  `) as Fila[]
  emitir('  Estado posterior:')
  for (const k of ['status', 'last_inbound_at', 'last_outbound_at', 'sla_breached_at']) {
    emitir('    ' + String(k).padEnd(18) + isoLegible(filaDespues[0]?.[k]))
  }
  emitir()

  const tareasDemo = (await sql`
    SELECT phone, kind, severity, description FROM tasks
    WHERE thread_key = ${escenario} ORDER BY id
  `) as Fila[]
  emitir('  Tarea generada:')
  for (const t of tareasDemo) {
    emitir('    ' + String(t.phone) + '  ' + String(t.kind) + '  ' + String(t.severity))
    emitir('      ' + String(t.description))
  }
  emitir()
  evidencia.tareas = [
    ...(await sql`SELECT thread_key, phone, kind, severity, description FROM tasks ORDER BY id`) as Fila[],
  ]

  const rBarrido2 = await fetch(BASE + '/admin/sla-scan', {
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  const c2 = (await rBarrido2.json()) as { incumplimientos: unknown[] }
  emitir('  Segundo barrido: ' + c2.incumplimientos.length + ' incumplimientos')
  emitir()

  const tareasRepetidas = (await sql`
    SELECT COUNT(*)::int AS n FROM tasks
    WHERE thread_key = ${escenario} AND kind = 'sla_breach'
  `) as Fila[]
  check(
    'el segundo barrido no duplica la tarea',
    Number(tareasRepetidas[0].n) === 1,
    'tareas con kind=sla_breach: ' + tareasRepetidas[0].n
  )
  check(
    'la conversacion quedo marcada en la base',
    Boolean(filaDespues[0]?.sla_breached_at),
    'sla_breached_at = ' + isoLegible(filaDespues[0]?.sla_breached_at)
  )
  check(
    'el tiempo de espera supero el umbral',
    cuerpoBarrido.incumplimientos.some((b) => b.threadKey === escenario),
    'umbral ' + cuerpoBarrido.umbral + ' min laborables'
  )

  // El canal Meta no reporta respuestas: se excluye de la auditoria.
  const escenarioMeta = 'demo-sla-meta:' + ESCENARIO_TEL
  await sql`
    INSERT INTO conversations (thread_key, channel, phone, status, last_inbound_at)
    VALUES (${escenarioMeta}, 'meta', ${ESCENARIO_TEL}, 'open', ${haceHoras})
    ON CONFLICT (thread_key) DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at,
      last_outbound_at = NULL, sla_breached_at = NULL
  `
  const rMeta = await fetch(BASE + '/admin/sla-scan', {
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  const cMeta = (await rMeta.json()) as { incumplimientos: { threadKey: string }[] }
  const seAuditoMeta = cMeta.incumplimientos.some((b) => b.threadKey === escenarioMeta)
  emitir('  Escenario: canal directo de Meta')
  emitir("    channel = 'meta'   ->   auditada: " + (seAuditoMeta ? 'si' : 'no'))
  emitir()
  check(
    'el canal directo de Meta no se audita',
    !seAuditoMeta,
    seAuditoMeta ? 'aparecio en la lista' : 'excluido'
  )
  await sql`DELETE FROM conversations WHERE thread_key = ${escenarioMeta}`
  emitir()
  bloque(bloqueTotal, fallos - bloqueFallos)
  emitir()

  const tareas = (await sql`SELECT thread_key, phone, kind, severity, description FROM tasks ORDER BY id`) as Fila[]
  evidencia.tareas = tareas

  // Latencias y modelo medidos por test/demo-live.ts.
  if (existsSync('docs/evidencia/.latencias.json')) {
    try {
      const j = JSON.parse(readFileSync('docs/evidencia/.latencias.json', 'utf8')) as {
        modelo?: string
        latencias?: Record<string, number>
      }
      evidencia.modelo = j.modelo ?? evidencia.modelo
      evidencia.latencias = j.latencias ?? {}
    } catch {
      // si no se puede leer, la vista lo muestra como n/d
    }
  }

  escribirVisual()

  cerrar()
}

// =============================================================================
// Vista visual
// =============================================================================
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function clase(v: unknown): string {
  const s = String(v ?? '').toUpperCase()
  if (s.includes('HOT')) return 'hot'
  if (s.includes('WARM')) return 'warm'
  if (s.includes('COLD')) return 'cold'
  return ''
}

function escribirVisual(): void {
  const anon = evidencia.anon.map((a) => {
    const estado = !a.cambia ? 'igual' : ''
    return `
      <div class="fila ${estado}">
        <div class="antes">${esc(a.entrada)}</div>
        <div class="flechita">&rarr;</div>
        <div class="despues">${esc(a.salida)}</div>
      </div>`
  }).join('')

  const filas = evidencia.pipeline.map((l) => {
    let an: Fila = {}
    try {
      an = JSON.parse(String(l.ai_analysis)) as Fila
    } catch {
      an = {}
    }
    const texto = String(l.message_cleaned ?? '')
    const limpio =
      !/\d{13,19}/.test(texto.replace(/\s/g, '')) &&
      !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(texto)

    return `
    <article class="caso">
      <div class="burbuja">${esc(l.message_raw)}</div>
      <div class="flecha">&darr;&nbsp; lo que sale hacia el modelo</div>
      <div class="modelo">${esc(l.message_cleaned)}</div>
      <div class="etiquetas">
        <span class="pri ${clase(an.priority)}">${esc(an.priority)}</span>
        <span class="conf">confianza ${esc(an.confidence)}</span>
        ${limpio ? '<span class="limpio">sin datos identificables</span>' : '<span class="sucio">REVISAR: hay un dato sin enmascarar</span>'}
      </div>
      <p class="resumen">${esc(an.summary ?? '')}</p>
      <code class="ref">${esc(l.phone)}</code>
      <div class="origen">clasificado por <strong>${esc(String(evidencia.modelo ?? 'deepseek-flash'))}</strong>
        <span class="sep">&middot;</span> respuesta en ${esc(latencia(String(l.phone)))}</div>
    </article>`
  })

  const eventos = evidencia.eventos
    .map((e) => `<tr><td>${esc(e.event_id)}</td><td>${esc(e.direction)}</td><td>${esc(e.phone)}</td></tr>`)
    .join('')

  const tareas = evidencia.tareas
    .map(
      (t) =>
        `<tr><td>${esc(t.phone)}</td><td>${esc(t.kind)}</td><td>${esc(t.severity)}</td><td class="desc">${esc(t.description)}</td></tr>`
    )
    .join('')

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Demostración — evidencia de la ejecución</title>
<style>
  :root{--fondo:#0d1117;--panel:#161b22;--linea:#30363d;--texto:#e6edf3;--tenue:#9198a1;
        --acento:#58a6ff;--ok:#3fb950;--aviso:#d29922;--rojo:#f85149;
        --verde:#25d366;--burbuja-out:#005c4b}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--fondo);color:var(--texto);
       font-family:"Segoe UI",-apple-system,Roboto,Helvetica,Arial,sans-serif;
       line-height:1.6;padding:34px 26px}
  .caja{max-width:1180px;margin:0 auto}
  h1{font-size:26px;margin-bottom:6px}
  .sub{color:var(--tenue);font-size:15px;margin-bottom:30px}
  h2{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--acento);
     margin:36px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--linea)}
  .tarjetas{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
  .tarjeta{background:var(--panel);border:1px solid var(--linea);border-radius:8px;padding:14px 16px}
  .tarjeta .k{font-size:12px;color:var(--tenue);letter-spacing:.08em;text-transform:uppercase}
  .tarjeta .v{font-size:20px;margin-top:4px}
  .casos{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}
  .caso{background:var(--panel);border:1px solid var(--linea);border-radius:10px;padding:18px}
  .burbuja{background:var(--burbuja-out);border-radius:10px 10px 10px 3px;padding:12px 14px;
           font-size:15px;max-width:88%}
  .flecha{color:var(--tenue);font-size:12.5px;margin:12px 0 8px;letter-spacing:.03em}
  .modelo{background:#0b0f14;border:1px dashed var(--linea);border-radius:8px;padding:11px 13px;
          font-family:"Cascadia Mono",Consolas,monospace;font-size:13.5px;word-break:break-word}
  .etiquetas{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px;align-items:center}
  .pri{padding:3px 11px;border-radius:20px;font-size:12.5px;font-weight:700;letter-spacing:.04em}
  .pri.hot{background:rgba(248,81,73,.15);color:#ff7b72}
  .pri.warm{background:rgba(210,153,34,.15);color:#e3b341}
  .pri.cold{background:rgba(88,166,255,.15);color:#79c0ff}
  .conf,.limpio,.sucio{font-size:13px;color:var(--tenue)}
  .limpio{color:var(--ok)}
  .sucio{color:var(--rojo)}
  .resumen{margin-top:11px;font-size:14.5px;color:var(--texto)}
  .ref{display:block;margin-top:10px;font-size:12px;color:var(--tenue)}
  .origen{margin-top:12px;padding-top:10px;border-top:1px dashed var(--linea);
         font-size:12.5px;color:var(--tenue)}
  .origen strong{color:var(--acento);font-weight:600}
  .origen .sep{margin:0 6px;opacity:.5}
  .anon{display:grid;gap:5px}
  .anon .fila{display:grid;grid-template-columns:1fr 22px 1fr;align-items:center;gap:8px;
              background:var(--panel);border:1px solid var(--linea);border-radius:6px;padding:7px 12px;
              font-family:"Cascadia Mono",Consolas,monospace;font-size:12.5px}
  .anon .antes{color:var(--tenue);text-align:right}
  .anon .flechita{color:var(--acento);text-align:center;font-size:14px}
  .anon .despues{color:var(--ok)}
  .anon .fila.igual .despues{color:var(--tenue);opacity:.75}
  .leyenda{display:flex;gap:16px;margin-top:12px;font-size:12.5px;color:var(--tenue)}
  .lg::before{content:"";display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;
              vertical-align:baseline}
  .lg.ok::before{background:var(--ok)}
  .lg.igual::before{background:var(--tenue)}
  .leyenda .nota{margin-left:auto;font-size:12.5px;opacity:.8}
  table{width:100%;border-collapse:collapse;font-size:14px;background:var(--panel);
        border:1px solid var(--linea);border-radius:8px;overflow:hidden}
  th,td{padding:9px 12px;border-bottom:1px solid var(--linea);text-align:left;vertical-align:top}
  th{color:var(--tenue);font-size:12px;letter-spacing:.07em;text-transform:uppercase}
  td.desc{color:var(--tenue);font-size:13.5px}
  pre{background:#0b0f14;border:1px solid var(--linea);border-radius:8px;padding:14px;
      overflow-x:auto;font-family:"Cascadia Mono",Consolas,monospace;font-size:13px;color:#c9d1d9}
  .nota{background:rgba(210,153,34,.08);border-left:3px solid var(--aviso);
        padding:13px 16px;border-radius:0 6px 6px 0;font-size:14.5px;margin-top:12px}
  .pie{margin-top:40px;padding-top:16px;border-top:1px solid var(--linea);color:var(--tenue);font-size:13px}
  @media print{body{background:#fff;color:#000}table,pre,.caso{background:#fff}}
</style></head><body><div class="caja">

<h1>Demostración — evidencia de la ejecución</h1>
<p class="sub">Generado el ${esc(new Date().toString().slice(0, 24))} · todos los datos provienen de esta ejecución</p>

<h2>Estado del servicio</h2>
<div class="tarjetas">
  <div class="tarjeta"><div class="k">Base de datos</div><div class="v">${esc(evidencia.salud.database)}</div></div>
  <div class="tarjeta"><div class="k">Firma del webhook</div><div class="v">${evidencia.salud.firmaValidada ? 'validada' : 'NO'}</div></div>
  <div class="tarjeta"><div class="k">Administración</div><div class="v">${evidencia.salud.adminProtegido ? 'protegida' : 'sin protección'}</div></div>
  <div class="tarjeta"><div class="k">Conector de CRM</div><div class="v">${esc(evidencia.salud.crm)}</div></div>
  <div class="tarjeta"><div class="k">Umbral de SLA</div><div class="v">${esc((evidencia.salud.sla as Fila)?.umbralMinutos)} min</div></div>
  <div class="tarjeta"><div class="k">Canales auditados</div><div class="v">${esc(((evidencia.salud.sla as Fila)?.canales as string[])?.join(', '))}</div></div>
</div>
<div class="nota">El canal directo de Meta no reporta las respuestas del agente, así que queda fuera de la auditoría de tiempos.</div>

<h2>Mensajes: qué entra y qué sale</h2>
<div class="casos">${filas.join('')}</div>

<h2>Bitácora de eventos</h2>
<table><tr><th>event_id</th><th>sentido</th><th>teléfono</th></tr>${eventos}</table>

<h2>Tareas generadas</h2>
<table><tr><th>teléfono</th><th>tipo</th><th>severidad</th><th>descripción</th></tr>${tareas}</table>

<h2>Filtro de datos personales</h2>
<div class="anon">${anon}</div>
<div class="leyenda">
  <span class="lg ok">enmascarado</span>
  <span class="lg igual">sin cambio</span>
  <span class="nota">Las fechas quedan intactas: no identifican a nadie.</span>
</div>

<p class="pie">Los números y los mensajes son sintéticos. No hay información de clientes reales en este material.</p>
</div></body></html>`

  if (!existsSync('docs/evidencia')) mkdirSync('docs/evidencia', { recursive: true })
  writeFileSync(VISUAL, html, 'utf8')
}

function esc2(s: string): string {
  return esc(s)
}

function cerrar(): void {
  emitir()
  emitir('  Comandos que fallaron: ' + fallos)
  emitir()
  emitir('  ' + '-'.repeat(64))
  emitir('  Servidor activo en ' + BASE)
  emitir('  ' + '-'.repeat(64))
  emitir()
  emitir('  ' + BASE + '/health')
  emitir('      estado del servicio')
  emitir()
  emitir('  Rutas de administración (sustituye <ADMIN_KEY> por el valor de .dev.vars):')
  emitir('  ' + BASE + '/admin/audit?key=<ADMIN_KEY>')
  emitir('      conversaciones abiertas y tareas')
  emitir()
  emitir('  ' + BASE + '/admin/leads?key=<ADMIN_KEY>')
  emitir('      mensajes, original y enmascarado')
  emitir()
  emitir('  ' + BASE + '/admin/tasks?key=<ADMIN_KEY>')
  emitir('      pendientes de publicar en RD Station')
  emitir()
  emitir('  ' + c.ten('Y el resumen visual de todo lo anterior:'))
  emitir('  ' + c.ten('  docs/evidencia/demo-visual.html'))
  emitir()
  emitir('  Detener: npm run demo:parar')
  emitir()

  // El archivo se escribe al final, para que incluya el bloque de cierre.
  try {
    if (!existsSync('docs/evidencia')) mkdirSync('docs/evidencia', { recursive: true })
    writeFileSync('docs/evidencia/demo-consola.txt', registro.join('\n') + '\n', 'utf8')
  } catch {
    // si no se puede escribir, la salida ya esta en pantalla
  }

  if (fallos > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  error('error inesperado: ' + (e as Error).message)
  cerrar()
})