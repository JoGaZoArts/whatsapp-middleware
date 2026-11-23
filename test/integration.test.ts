// Integracion contra `wrangler dev` en local.
// Cubre el handshake de suscripcion de Meta y el candado de /admin.
//
// Uso:  npx tsx test/integration.test.ts   (con el server corriendo en :8789)
// Requiere: ADMIN_KEY_TEST, VERIFY_TOKEN_TEST

import { readFileSync } from 'node:fs'
import { c } from '../tools/color'

const BASE = process.env.TEST_BASE ?? 'http://127.0.0.1:8789'

function leerClave(nombre: string): string {
  const directo = process.env[nombre + '_TEST'] ?? process.env[nombre] ?? ''
  if (directo) return directo
  try {
    for (const crudo of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
      const linea = crudo.replace(/^\uFEFF/, '').trim()
      const m = linea.match(new RegExp('^' + nombre + '=(.+)$'))
      if (m) return m[1].trim()
    }
  } catch {
    // Sin .dev.vars se usan las variables de entorno.
  }
  return ''
}

const ADMIN_KEY = leerClave('ADMIN_KEY')
const VERIFY_TOKEN = leerClave('WEBHOOK_VERIFY_TOKEN')
const CHATWOOT_SECRET = leerClave('CHATWOOT_WEBHOOK_SECRET')

let fallos = 0
let total = 0

function check(nombre: string, ok: boolean, detalle = ''): void {
  total++
  if (!ok) fallos++
  const marca = ok ? c.verde('OK  ') : c.rojo('FALLA')
  console.log('  ' + marca + ' ' + nombre + (detalle ? '  ' + c.ten('->') + '  ' + c.morado(detalle) : ''))
}

async function main(): Promise<void> {
  console.log('')
  console.log('  ' + c.azul(c.neg('Suscripcion del webhook')))

  // Handshake de Meta: GET /webhook?hub.mode=subscribe&hub.verify_token=...
  const bueno = encodeURIComponent(VERIFY_TOKEN || 'x')
  const okVerify = await fetch(
    `${BASE}/webhook?hub.mode=subscribe&hub.verify_token=${bueno}&hub.challenge=ECHO123`
  )
  const badVerify = await fetch(
    `${BASE}/webhook?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=ECHO123`
  )

  check(
    'token incorrecto -> 403',
    badVerify.status === 403,
    'status ' + badVerify.status
  )
  check(
    'token correcto -> 200 + challenge',
    okVerify.status === 200 && (await okVerify.text()) === 'ECHO123',
    'status ' + okVerify.status
  )

  console.log('')
  console.log('  ' + c.azul(c.neg('Acceso a las rutas de administracion')))

  // Toda ruta /admin exige clave.
  const sinClave = await fetch(`${BASE}/admin/sla-scan`)
  check('sin clave -> 401', sinClave.status === 401, 'status ' + sinClave.status)

  const conClave = await fetch(`${BASE}/admin/sla-scan`, {
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  check('con clave -> 200', conClave.status === 200, 'status ' + conClave.status)

  const claveMala = await fetch(`${BASE}/admin/audit`, {
    headers: { 'x-admin-key': ADMIN_KEY.slice(0, -2) + 'xx' },
  })
  check(
    'clave incorrecta -> 401',
    claveMala.status === 401,
    'status ' + claveMala.status
  )

  console.log('')
  console.log('  ' + c.azul(c.neg('Webhook de Chatwoot')))

  const cwSinToken = await fetch(`${BASE}/chatwoot/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'noop' }),
  })
  check('sin token -> 401', cwSinToken.status === 401, 'status ' + cwSinToken.status)

  const cwConToken = await fetch(`${BASE}/chatwoot/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-chatwoot-token': CHATWOOT_SECRET,
    },
    body: JSON.stringify({ event: 'noop' }),
  })
  check('con token -> 200', cwConToken.status === 200, 'status ' + cwConToken.status)

  console.log('')
  console.log('  ' + c.azul(c.neg('Envio de prueba')))

  const sendSinClave = await fetch(`${BASE}/admin/test/send`, { method: 'POST' })
  check('sin clave -> 401', sendSinClave.status === 401, 'status ' + sendSinClave.status)

  const sendSinDestino = await fetch(`${BASE}/admin/test/send`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  check('sin destino -> 400', sendSinDestino.status === 400, 'status ' + sendSinDestino.status)

  console.log('')
  console.log('  ' + (fallos === 0 ? c.verde((total - fallos) + '/' + total + ' correctos') : c.rojo((total - fallos) + '/' + total + ' correctos')))
  if (fallos > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
