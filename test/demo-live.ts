/**
 * Demostración del pipeline completo: envía webhooks firmados al servidor
 * local y comprueba en la base de datos que cada etapa se ejecutó.
 *
 * Uso:  npx tsx test/demo-live.ts
 *       (con `npm run dev` corriendo en otro terminal)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { c } from '../tools/color'
import { neon } from '@neondatabase/serverless'

const BASE = process.env.TEST_BASE ?? 'http://127.0.0.1:8787'

function leerClave(nombre: string): string {
  for (const raw of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const linea = raw.replace(/^\uFEFF/, '').trim()
    const m = linea.match(new RegExp('^' + nombre + '=(.+)$'))
    if (m) return m[1].trim()
  }
  return ''
}

const APP_SECRET = leerClave('APP_SECRET')
const ADMIN_KEY = leerClave('ADMIN_KEY')
const DB_URL = leerClave('DATABASE_URL')

function sello(marca: string): void {
  console.log('  ' + c.azul(c.neg(marca)))
}

async function firmarCon(secreto: string, cuerpo: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(cuerpo))
  const hex = Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return 'sha256=' + hex
}

const firmar = (cuerpo: string) => firmarCon(APP_SECRET, cuerpo)

/** Payload con la estructura real de Meta. */
function webhookMeta(telefono: string, wamid: string, texto: string, marcaTiempo: number) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DEMO',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15551797781', phone_number_id: 'DEMO' },
              contacts: [{ profile: { name: 'Lead Demo' }, wa_id: telefono }],
              messages: [
                {
                  from: telefono,
                  id: wamid,
                  timestamp: String(marcaTiempo),
                  type: 'text',
                  text: { body: texto },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

async function enviarCon(cuerpo: string, firma: string) {
  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hub-signature-256': firma,
  }
  const r = await fetch(BASE + '/webhook', { method: 'POST', headers: cabeceras, body: cuerpo })
  return r.status + ' ' + (await r.text())
}

async function enviar(cuerpo: string, conFirma: boolean) {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' }
  if (conFirma) cabeceras['x-hub-signature-256'] = await firmar(cuerpo)
  const r = await fetch(BASE + '/webhook', { method: 'POST', headers: cabeceras, body: cuerpo })
  return r.status + ' ' + (await r.text())
}

async function main() {
  const sql = neon(DB_URL)
  const ahora = Math.floor(Date.now() / 1000)
  const marca = (n: number) => ahora - 600 + n * 120

  sello('PIPELINE - verificacion de extremo a extremo')
  console.log('')
  sello('Servidor: ' + BASE)

  // ---------------------------------------------------------------
  sello('ETAPA 0 - Seguridad del webhook')
  // ---------------------------------------------------------------
  // Numero aparte: no contamina la lectura de los tres escenarios de negocio.
  const numeroPrueba = '573000000000'
  const selloMalFormato = 'sha256=' + '0'.repeat(64)

  const cuerpoDemo = webhookMeta(numeroPrueba, 'wamid.DEMO_SIN_FIRMA', 'hola', marca(0))
  console.log('  ' + c.ten('sin firma          ') + (await enviar(cuerpoDemo, false)) + '   ' + c.ten('esperado 403'))

  const cuerpoFalso = webhookMeta(numeroPrueba, 'wamid.DEMO_FIRMA_MAL', 'hola', marca(0))
  console.log('  ' + c.ten('firma invalida     ') + (await enviarCon(cuerpoFalso, selloMalFormato)) + '   ' + c.ten('esperado 403'))

  const firmaAjena = await firmarCon('un-secreto-que-no-es-el-de-la-aplicacion', cuerpoFalso)
  console.log('  ' + c.ten('firma ajena        ') + (await enviarCon(cuerpoFalso, firmaAjena)) + '   ' + c.ten('esperado 403'))

  console.log('  ' + c.ten('firma correcta     ') + c.verde(await enviar(cuerpoDemo, true)) + '   ' + c.ten('esperado 200'))
  console.log('')
  sello('ETAPA 1 - Recepcion de mensajes (3 escenarios)')
  // ---------------------------------------------------------------
  const escenarios = [
    {
      telefono: '573001112233',
      wamid: 'wamid.DEMO_1_CALIENTE',
      texto: 'Hola, estoy interesado en contratar el plan empresarial para 10 personas. Mi correo es juan.demo@ejemplo.com',
      nota: 'Lead con intencion de compra clara y correo para el CRM',
    },
    {
      telefono: '573004445566',
      wamid: 'wamid.DEMO_2_SOPORTE',
      texto: 'Buenas tardes, la app no me deja cargar la nomina de marzo, que error es ese?',
      nota: 'Consulta tecnica, no es lead comercial',
    },
    {
      telefono: '573007778899',
      wamid: 'wamid.DEMO_3_PAGO',
      texto: 'Quiero pagar la factura. Mi tarjeta es 4111111111111111 y mi cedula es 1020304050',
      nota: 'Contiene tarjeta de credito: debe quedar enmascarada',
    },
  ]

  const enviados: { tel: string; t: number }[] = []
  for (const [i, e] of escenarios.entries()) {
    const cuerpo = webhookMeta(e.telefono, e.wamid, e.texto, marca(i + 1))
    const respuesta = await enviar(cuerpo, true)
    enviados.push({ tel: '+' + e.telefono, t: Date.now() })
    console.log('  ' + c.ten('+' + e.telefono + '  ') + respuesta + '   ' + c.ten(e.nota))
  }
  console.log('')

  // ---------------------------------------------------------------
  sello('ETAPA 2 - Control de duplicados')
  // ---------------------------------------------------------------
  const duplicado = webhookMeta(
    escenarios[0].telefono,
    escenarios[0].wamid,
    escenarios[0].texto,
    marca(1)
  )
  console.log('  ' + c.ten('reenvio mismo id   ') + (await enviar(duplicado, true)))
  console.log('')

  sello('Esperando clasificaciones ...')

  // Espera activa: en cuanto llegan las tres clasificaciones se sigue.
  const limiteEspera = Date.now() + 40000
  let clasificados = 0
  while (Date.now() < limiteEspera) {
    await new Promise((r) => setTimeout(r, 1000))
    const r = (await sql(
      "SELECT count(*)::int AS n FROM lead_logs WHERE phone IN " +
      "('+573001112233','+573004445566','+573007778899')"
    )) as Record<string, number>[]
    clasificados = Number(r[0].n)
    if (clasificados >= 3) break
  }
  console.log('  ' + c.ten('clasificaciones   ') + c.verde(clasificados + ' de 3') +
    c.ten('  en ' + Math.round((40000 - (limiteEspera - Date.now())) / 1000) + ' s'))

  // ---------------------------------------------------------------
  sello('ETAPA 3 - Lectura desde la base de datos')
  // ---------------------------------------------------------------
  const leads = (await sql(
    "SELECT phone, message_raw, message_cleaned, ai_analysis FROM lead_logs " +
      "WHERE phone IN ('+573001112233','+573004445566','+573007778899') ORDER BY id"
  )) as Record<string, string>[]

  console.log('')
  const latencias: Record<string, number> = {}
  for (const l of leads) {
    const an = JSON.parse(l.ai_analysis as string) as Record<string, unknown>
    const tarjetaVisible = /\d{13,19}/.test((l.message_cleaned as string).replace(/\s/g, ''))
    const clase = String(an.priority) === 'HOT' ? c.ambar('HOT ') : String(an.priority) === 'WARM' ? c.morado('WARM') : c.azul('COLD')
    // Latencia desde el envio hasta la lectura del resultado.
    const envio = enviados.find((x) => x.tel === l.phone)
    const ms = envio ? Date.now() - envio.t : 0
    latencias[l.phone] = ms
    console.log('  ' + c.ten(l.phone) + '  ' + clase + '  ' + c.ten('conf ' + an.confidence) +
      '  ' + c.ten(String(ms) + ' ms') + '  ' +
      (tarjetaVisible ? c.rojo('dato sin enmascarar') : c.verde('sin dato sensible')))
  }
  console.log('')

  // Datos para la vista visual.
  if (existsSync('docs/evidencia')) {
    writeFileSync(
      'docs/evidencia/.latencias.json',
      JSON.stringify({ modelo: leerClave('AI_MODEL') || 'deepseek-flash', latencias }),
      'utf8'
    )
  }

  const eventos = (await sql(
    "SELECT event_id, direction, phone FROM events WHERE thread_key LIKE 'meta:+57300%' " +
      "AND phone IN ('+573001112233','+573004445566','+573007778899') ORDER BY id"
  )) as Record<string, string>[]
  const distintos = new Set(eventos.map((e) => e.event_id))
  console.log('  ' + c.ten('eventos en bitacora') + '   ' + eventos.length + '   ' +
    c.ten('unicos ') + distintos.size + '   ' +
    (eventos.length === distintos.size ? c.verde('sin duplicados') : c.rojo('duplicados')))
  console.log('')

  // ---------------------------------------------------------------
  sello('ETAPA 4 - Deteccion de tiempos de respuesta')
  // ---------------------------------------------------------------
  const r = await fetch(BASE + '/admin/sla-scan', { headers: { 'x-admin-key': ADMIN_KEY } })
  const sla = (await r.json()) as { incumplimientos: unknown[]; umbral: number }

  const acceso = await fetch(BASE + '/admin/audit', { headers: { 'x-admin-key': ADMIN_KEY } })
  const auditoria = (await acceso.json()) as { total: number; conversaciones: Record<string, unknown>[] }

  console.log('  ' + c.ten('umbral            ') + sla.umbral + ' min de horario laboral')
  console.log('  ' + c.ten('conversaciones    ') + auditoria.total)
  console.log('  ' + c.ten('en incumplimiento ') +
    (sla.incumplimientos.length ? c.rojo(String(sla.incumplimientos.length)) : c.verde('0')))
  console.log('')
  sello('Fin del pipeline')
}

main().catch((e) => {
  console.error('Error en la demostracion:', e)
  process.exit(1)
})
