/**
 * Prueba end-to-end del detector de SLA contra Neon y el barrido HTTP.
 *
 *   1. Inserta una conversacion con un inbound viejo y sin respuesta
 *   2. Corre GET /admin/sla-scan
 *   3. Verifica que aparece en incumplimientos
 *   4. Verifica que un segundo barrido no lo vuelve a marcar (dedup)
 *   5. Limpia los datos de prueba
 *
 * Uso:  npx tsx test/sla.test.ts
 *       (con TEST_BASE apuntando al server en local)
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const BASE = process.env.TEST_BASE ?? 'http://127.0.0.1:8801'
const ADMIN_KEY = process.env.ADMIN_KEY_TEST ?? ''
const TEST_PHONE = '+573009999999'
const THREAD_META = 'sla-test-meta:' + TEST_PHONE
const THREAD_META_CLEAN = 'sla-test-meta'
const THREAD_KEY = 'sla-test:' + TEST_PHONE

let fallos = 0
let total = 0

function check(nombre: string, ok: boolean, detalle = '') {
  total++
  if (!ok) fallos++
  console.log((ok ? 'OK  ' : 'FALLA') + ' ' + nombre + (detalle ? ' -> ' + detalle : ''))
}

function readDatabaseUrl(): string {
  for (const raw of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '').trim()
    const match = line.match(/^DATABASE_URL=(.+)$/)
    if (match) return match[1].trim()
  }
  throw new Error('No se encontro DATABASE_URL en .dev.vars')
}

const sql = neon(readDatabaseUrl())

function horasAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString()
}

async function cleanup() {
  await sql('DELETE FROM conversations WHERE thread_key = ' + sqlHelper(THREAD_META))
  await sql('DELETE FROM events WHERE thread_key = ' + sqlHelper(THREAD_KEY))
  await sql('DELETE FROM tasks WHERE thread_key = ' + sqlHelper(THREAD_KEY))
  await sql('DELETE FROM conversations WHERE thread_key = ' + sqlHelper(THREAD_KEY))
}

function sqlHelper(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'"
}

interface ScanResult {
  incumplimientos: { threadKey: string; waitingMinutes: number }[]
  umbral: number
}

async function scan(): Promise<ScanResult> {
  const response = await fetch(BASE + '/admin/sla-scan', {
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  return (await response.json()) as ScanResult
}

async function main() {
  console.log('\n=== Detector de SLA contra ' + BASE + ' ===\n')
  await cleanup()

  // Inbound 14 dias atras: el resultado no depende de la hora de ejecucion.
  const inboundLejano = new Date()
  inboundLejano.setDate(inboundLejano.getDate() - 14)

  await sql(
    'INSERT INTO conversations (thread_key, channel, phone, status, last_inbound_at) ' +
      'VALUES (' +
      sqlHelper(THREAD_KEY) +
      ", 'chatwoot', " +
      sqlHelper(TEST_PHONE) +
      ", 'open', " +
      sqlHelper(inboundLejano.toISOString()) +
      ') ON CONFLICT (thread_key) DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at, ' +
      'last_outbound_at = NULL, sla_breached_at = NULL, status = ' + sqlHelper('open')
  )
  console.log('  insertado: ' + TEST_PHONE + ' con inbound hace 14 dias, sin respuesta')

  // 1) Detecta el incumplimiento
  const primero = await scan()
  const incumplimiento = primero.incumplimientos.find((b) => b.threadKey === THREAD_KEY)
  check(
    'un hilo con 14 dias sin respuesta SI se marca como incumplimiento',
    Boolean(incumplimiento),
    incumplimiento
      ? 'esperando ' + incumplimiento.waitingMinutes + ' min laborables'
      : 'no aparecio en la lista'
  )

  if (incumplimiento) {
    check(
      'el tiempo de espera supera el umbral configurado',
      incumplimiento.waitingMinutes >= primero.umbral,
      'esperando ' + incumplimiento.waitingMinutes + ' min vs umbral ' + primero.umbral + ' min'
    )
  }

  // Un segundo barrido no debe duplicar: sla_breached_at ya quedo escrito.
  await scan()
  const tareas = (await sql(
    'SELECT COUNT(*)::int AS n FROM tasks WHERE thread_key = ' +
      sqlHelper(THREAD_KEY) +
      " AND kind = 'sla_breach'"
  )) as { n: number }[]
  check(
    'no se crean tareas duplicadas en barridos sucesivos',
    Number(tareas[0].n) === 1,
    'n=' + tareas[0].n
  )

  // Un hilo recien llegado no debe incumplir.
  const hiloReciente = 'sla-test-reciente'
  await sql(
    'INSERT INTO conversations (thread_key, channel, phone, status, last_inbound_at) ' +
      'VALUES (' +
      sqlHelper(hiloReciente) +
      ", 'chatwoot', '+573008888888', 'open', " +
      sqlHelper(horasAtras(0.02)) +
      ') ON CONFLICT (thread_key) DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at, ' +
      'sla_breached_at = NULL'
  )
  const tercero = await scan()
  check(
    'un hilo de hace 1 minuto NO se marca como incumplimiento',
    !tercero.incumplimientos.some((b) => b.threadKey === hiloReciente)
  )
  await sql('DELETE FROM conversations WHERE thread_key = ' + sqlHelper(hiloReciente))

  // El canal Meta no reporta respuestas del agente: no se audita.
  await sql(
    'INSERT INTO conversations (thread_key, channel, phone, status, last_inbound_at) ' +
      'VALUES (' +
      sqlHelper(THREAD_META) +
      ", 'meta', " +
      sqlHelper(TEST_PHONE) +
      ", 'open', " +
      sqlHelper(inboundLejano.toISOString()) +
      ') ON CONFLICT (thread_key) DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at, ' +
      'sla_breached_at = NULL'
  )
  const conMeta = await scan()
  check(
    'un hilo del canal Meta NO se audita',
    !conMeta.incumplimientos.some((b) => b.threadKey === THREAD_META),
    'auditados: ' + (conMeta.incumplimientos.map((b) => b.threadKey).join(', ') || 'ninguno')
  )
  await sql('DELETE FROM conversations WHERE thread_key = ' + sqlHelper(THREAD_META))

  await cleanup()
  console.log('  datos de prueba limpiados')

  console.log('\n=== ' + (total - fallos) + '/' + total + ' correctos ===')
  if (fallos > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
