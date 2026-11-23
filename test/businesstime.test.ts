import { businessMinutesBetween, colombianHolidays, describeSlaBreach, isWithinBusinessHours, slaConfigFromEnv } from '../src/lib/businesstime'
import type { SlaConfig } from '../src/types'

// Colombia es UTC-5 fijo. Fechas de referencia de 2026:
//   dom 27, lun 28, mar 29, mié 30, jue 01, vie 02, sáb 03, dom 04, lun 05

let fallos = 0
let total = 0

function check(nombre: string, obtenido: number, esperado: number) {
  total++
  const ok = Math.abs(obtenido - esperado) < 0.001
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}: ${obtenido} min (esperado ${esperado})`)
}

const base: SlaConfig = {
  thresholdMinutes: 60,
  startHour: 8,
  endHour: 18,
  holidays: new Set(),
  channels: new Set(['chatwoot', 'meta']),
  maxPerRun: 100,
}

console.log('\n--- businessMinutesBetween ---')

check(
  ' mismo dia, dentro de horario (mié 09:00-10:00)',
  businessMinutesBetween('2026-09-30T09:00:00-05:00', '2026-09-30T10:00:00-05:00', base),
  60
)

check(
  ' inicio antes de abrir (mié 06:00-10:00)',
  businessMinutesBetween('2026-09-30T06:00:00-05:00', '2026-09-30T10:00:00-05:00', base),
  120
)

check(
  ' cruza fin de semana (vie 17:00 -> lun 09:00)',
  businessMinutesBetween('2026-10-02T17:00:00-05:00', '2026-10-05T09:00:00-05:00', base),
  120
)

check(
  ' noche: lunes 22:00 -> martes 09:00 (si pasa por la apertura del martes)',
  businessMinutesBetween('2026-10-05T22:00:00-05:00', '2026-10-06T09:00:00-05:00', base),
  // mar 08:00-09:00 = 60 min de horario laboral. Antes de las 8 NO cuenta nada.
  60
)

check(
  ' noche cerrada: lunes 22:00 -> martes 07:00 (0 min laborables)',
  businessMinutesBetween('2026-10-05T22:00:00-05:00', '2026-10-06T07:00:00-05:00', base),
  0
)

check(
  ' solo fin de semana (sáb -> dom)',
  businessMinutesBetween('2026-10-03T10:00:00-05:00', '2026-10-04T10:00:00-05:00', base),
  0
)

check(
  ' festivo en medio: mié 30 es festivo, se salta y se cuenta hasta mié 7',
  businessMinutesBetween('2026-09-30T09:00:00-05:00', '2026-10-07T09:00:00-05:00', {
    ...base,
    holidays: new Set(['2026-09-30']),
  }),
  // El mié 30 es festivo -> 0 (habria aportado 09:00-18:00).
  // ju 1, vi 2, lu 5, ma 6: 08:00-18:00 = 600 min cada uno = 2400
  // mié 7: 08:00-09:00 = 60
  // sab 3 y dom 4: fin de semana -> 0
  2460
)

check(
  ' mismo rango SIN festivo (control): el mié 30 si cuenta',
  businessMinutesBetween('2026-09-30T09:00:00-05:00', '2026-10-07T09:00:00-05:00', base),
  // mié 30 aporta 09:00-18:00 = 540, mas los 2400 + 60 del otro caso
  3000
)

check(
  ' rango invertido o vacio',
  businessMinutesBetween('2026-09-30T10:00:00-05:00', '2026-09-30T09:00:00-05:00', base),
  0
)

check(
  ' umbral exacto: 59 min NO es incumplimiento',
  businessMinutesBetween('2026-09-30T09:00:00-05:00', '2026-09-30T09:59:00-05:00', base),
  59
)

console.log('\n--- isWithinBusinessHours ---')
function checkBool(nombre: string, obtenido: boolean, esperado: boolean) {
  total++
  const ok = obtenido === esperado
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}: ${obtenido} (esperado ${esperado})`)
}

checkBool('miércoles 10:00 (dentro)', isWithinBusinessHours(new Date('2026-09-30T10:00:00-05:00'), base), true)
checkBool('miércoles 19:00 (fuera)', isWithinBusinessHours(new Date('2026-09-30T19:00:00-05:00'), base), false)
checkBool('sábado 10:00 (fin de semana)', isWithinBusinessHours(new Date('2026-10-03T10:00:00-05:00'), base), false)
checkBool(
  'miércoles 10:00 pero festivo',
  isWithinBusinessHours(new Date('2026-09-30T10:00:00-05:00'), { ...base, holidays: new Set(['2026-09-30']) }),
  false
)
checkBool(
  'UTC vs Bogotá: 15:00 UTC = 10:00 Bogotá (dentro)',
  isWithinBusinessHours(new Date('2026-09-30T15:00:00Z'), base),
  true
)
checkBool(
  'UTC vs Bogotá: 04:00 UTC = 23:00 Bogotá (fuera)',
  isWithinBusinessHours(new Date('2026-10-01T04:00:00Z'), base),
  false
)

console.log('\n--- describeSlaBreach ---')
const ahora = new Date('2026-09-30T10:30:00-05:00')
const sinIncumplir = describeSlaBreach('2026-09-30T10:00:00-05:00', null, ahora, base)
total++
if (sinIncumplir !== null) { fallos++; console.log(`FALLA 30 min no deberia incumplir, devolvio ${JSON.stringify(sinIncumplir)}`) }
else console.log('OK   30 min de espera -> sin incumplimiento')

const incumpliendo = describeSlaBreach('2026-09-30T09:00:00-05:00', null, ahora, base)
total++
if (incumpliendo === null) { fallos++; console.log('FALLA 90 min deberia incumplir, devolvio null') }
else {
  console.log(`OK   90 min de espera -> "${incumpliendo.text}"`)
  if (incumpliendo.minutesWaiting !== 90) { fallos++; console.log(`FALLA minutos esperados 90, obtenida ${incumpliendo.minutesWaiting}`) }
}

total++
{
  // Lunes 15:13 de Bogota -> martes 08:12:49: 179,8 minutos, que redondean a 180.
  const r = describeSlaBreach(
    '2026-10-19T20:13:00.000Z',
    null,
    new Date('2026-10-20T13:12:49.000Z'),
    base
  )
  const texto = r?.text ?? ''
  if (!r || !texto.includes('3h 0min') || r.minutesWaiting !== 180) {
    fallos++
    console.log('FALLA redondeo del texto -> ' + texto)
  } else {
    console.log('OK   redondeo del texto: 3h 0min (180 min)')
  }
}

console.log('\n--- slaConfigFromEnv: valores por defecto y clamps ---')
const cfg = slaConfigFromEnv({})
total++
if (cfg.thresholdMinutes !== 60 || cfg.startHour !== 8 || cfg.endHour !== 18) {
  fallos++; console.log('FALLA defaults', JSON.stringify(cfg))
} else console.log(`OK   defaults: ${JSON.stringify(cfg)}`)

const cfg2 = slaConfigFromEnv({ SLA_THRESHOLD_MINUTES: '99999', BUSINESS_START_HOUR: '99', BUSINESS_END_HOUR: '-5' })
total++
if (cfg2.thresholdMinutes !== 1440 || cfg2.startHour !== 23 || cfg2.endHour !== 1) {
  fallos++; console.log('FALLA clamps', JSON.stringify(cfg2))
} else console.log(`OK   clamps aplicados: ${JSON.stringify(cfg2)}`)

const cfg3 = slaConfigFromEnv({ BUSINESS_HOLIDAYS: '2026-01-01, 2026-04-03 ,,2026-04-17 ' })
total++
if (cfg3.holidays.size !== 3) { fallos++; console.log(`FALLA festivos, esperaba 3, obtuve ${cfg3.holidays.size}`) }
else console.log(`OK   festivos parseados: ${[...cfg3.holidays].join(', ')}`)

// ---------------------------------------------------------------------------
// Calendario de festivos
// ---------------------------------------------------------------------------
console.log('\n--- colombianHolidays ---')

function checkFestivos(anio: number, esperados: string[]) {
  const obtenidos = colombianHolidays(anio)
  const faltan = esperados.filter((d) => !obtenidos.includes(d))
  const sobran = obtenidos.filter((d) => !esperados.includes(d))
  total++
  if (faltan.length > 0 || sobran.length > 0) {
    fallos++
    console.log(`FALLA ${anio}: faltan [${faltan.join(', ')}] sobran [${sobran.join(', ')}]`)
  } else {
    console.log(`OK   ${anio}: ${obtenidos.length} festivos`)
  }
}

checkFestivos(2026, [
  '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03',
  '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29',
  '2026-07-13', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12',
  '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
])

checkFestivos(2027, [
  '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26',
  '2027-05-01', '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05',
  '2027-07-12', '2027-07-20', '2027-08-07', '2027-08-16', '2027-10-18',
  '2027-11-01', '2027-11-15', '2027-12-08', '2027-12-25',
])

total++
{
  // Solo los seis fijos pueden caer en fin de semana: el resto se traslada.
  const FIJOS = new Set(['01-01', '05-01', '07-20', '08-07', '12-08', '12-25'])
  const anios = [2026, 2027, 2028, 2029, 2030]
  const mal = anios.flatMap(colombianHolidays).filter((f) => {
    const d = new Date(f + 'T00:00:00Z')
    const finDeSemana = d.getUTCDay() === 6 || d.getUTCDay() === 0
    return finDeSemana && !FIJOS.has(f.slice(5))
  })
  if (mal.length > 0) {
    fallos++
    console.log('FALLA trasladables en fin de semana: ' + mal.join(', '))
  } else console.log('OK   los trasladables siempre caen en dia habil (2026-2030)')
}

total++
{
  const sinManual = slaConfigFromEnv({})
  const anio = new Date().getUTCFullYear()
  const esperado = colombianHolidays(anio).every((f) => sinManual.holidays.has(f))
  if (!esperado) {
    fallos++
    console.log('FALLA sin BUSINESS_HOLIDAYS el calendario queda vacio')
  } else {
    console.log(`OK   sin BUSINESS_HOLIDAYS se calcula el calendario (${sinManual.holidays.size} fechas)`)
  }
}

console.log(`\n=== ${total - fallos}/${total} correctos ===`)
if (fallos > 0) {
  console.error(`${fallos} prueba(s) fallaron`)
  process.exit(1)
}
