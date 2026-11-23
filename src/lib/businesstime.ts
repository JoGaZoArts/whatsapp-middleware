import type { SlaConfig } from '../types'

// Colombia es UTC-5 fijo todo el ano. El calculo se hace sobre Dates cuyas
// horas UTC se leen como hora de pared de Bogota: como el desplazamiento es
// constante, las diferencias entre instantes no cambian.

const BOGOTA_SHIFT_HOURS = 5

/** Date cuyas horas UTC son la hora de pared de Bogota. */
function toBogotaWall(date: Date): Date {
  return new Date(date.getTime() - BOGOTA_SHIFT_HOURS * 60 * 60 * 1000)
}

export function bogotaDateKey(date: Date): string {
  return toBogotaWall(date).toISOString().slice(0, 10)
}

function minutesSinceMidnightBogota(date: Date): number {
  const d = toBogotaWall(date)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** Dia habil. Recibe un instante ya en marco desplazado. */
function isBusinessDay(wallDate: Date, holidays: Set<string>): boolean {
  const weekday = wallDate.getUTCDay() // 0 domingo ... 6 sabado
  if (weekday === 0 || weekday === 6) return false
  return !holidays.has(wallDate.toISOString().slice(0, 10))
}

// ==========================================
// Calendario de festivos
// ==========================================

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Domingo de Pascua, por el algoritmo gregoriano de Butcher-Meeus. */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

/** Ley Emiliani: si no cae lunes, el descanso pasa al lunes siguiente. */
function toNextMonday(date: Date): Date {
  const weekday = date.getUTCDay()
  if (weekday === 1) return date
  return addDays(date, weekday === 0 ? 1 : 8 - weekday)
}

/** Festivos nacionales de Colombia para un ano. */
export function colombianHolidays(year: number): string[] {
  const easter = easterSunday(year)
  const fechas: Date[] = []

  // Fijos: no se trasladan.
  const fijos: [number, number][] = [
    [1, 1], // Ano Nuevo
    [5, 1], // Dia del Trabajo
    [7, 20], // Independencia
    [8, 7], // Batalla de Boyaca
    [12, 8], // Inmaculada Concepcion
    [12, 25], // Navidad
  ]
  for (const [month, day] of fijos) {
    fechas.push(new Date(Date.UTC(year, month - 1, day)))
  }

  // Semana Santa: no se trasladan.
  fechas.push(addDays(easter, -3)) // Jueves Santo
  fechas.push(addDays(easter, -2)) // Viernes Santo

  // Trasladables al lunes.
  const trasladables: [number, number][] = [
    [1, 6], // Reyes Magos
    [3, 19], // San Jose
    [6, 29], // San Pedro y San Pablo
    [8, 15], // Asuncion
    [10, 12], // Dia de la Raza
    [11, 1], // Todos los Santos
    [11, 11], // Independencia de Cartagena
  ]
  if (year >= 2026) trasladables.push([7, 9]) // Ley 2578 de 2026
  for (const [month, day] of trasladables) {
    fechas.push(toNextMonday(new Date(Date.UTC(year, month - 1, day))))
  }

  // Dependen de la Pascua y tambien se trasladan.
  fechas.push(toNextMonday(addDays(easter, 39))) // Ascension
  fechas.push(toNextMonday(addDays(easter, 60))) // Corpus Christi
  fechas.push(toNextMonday(addDays(easter, 68))) // Sagrado Corazon

  return [...new Set(fechas.map(isoDate))].sort()
}

// ==========================================
// Horas Laborables
// ==========================================
/**
 * Minutos de horario laboral entre dos instantes. No cuenta noches, fines de
 * semana ni festivos.
 */
export function businessMinutesBetween(startISO: string, endISO: string, cfg: SlaConfig): number {
  const start = new Date(startISO)
  const end = new Date(endISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0

  const startWall = toBogotaWall(start)
  const endWall = toBogotaWall(end)

  // Medianoche del dia de inicio y del dia de fin, en marco de Bogota.
  const cursor = new Date(
    Date.UTC(startWall.getUTCFullYear(), startWall.getUTCMonth(), startWall.getUTCDate())
  )
  const lastDay = new Date(
    Date.UTC(endWall.getUTCFullYear(), endWall.getUTCMonth(), endWall.getUTCDate())
  )

  const MAX_DAYS = 400
  let iterations = 0

  let total = 0
  while (cursor.getTime() <= lastDay.getTime() && iterations < MAX_DAYS) {
    iterations++
    if (isBusinessDay(cursor, cfg.holidays)) {
      const windowStart = cursor.getTime() + cfg.startHour * 60 * 60 * 1000
      const windowEnd = cursor.getTime() + cfg.endHour * 60 * 60 * 1000

      const from = Math.max(startWall.getTime(), windowStart)
      const to = Math.min(endWall.getTime(), windowEnd)
      if (to > from) total += (to - from) / 60_000
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return total
}

export function isWithinBusinessHours(date: Date, cfg: SlaConfig): boolean {
  const wall = toBogotaWall(date)
  if (!isBusinessDay(wall, cfg.holidays)) return false
  const minutes = minutesSinceMidnightBogota(date)
  return minutes >= cfg.startHour * 60 && minutes < cfg.endHour * 60
}

/** Texto del incumplimiento para la tarea. null si todavia no hay. */
export function describeSlaBreach(
  lastInboundISO: string,
  lastOutboundISO: string | null,
  now: Date,
  cfg: SlaConfig
): { minutesWaiting: number; text: string } | null {
  const reference = lastOutboundISO ?? lastInboundISO
  const waited = businessMinutesBetween(reference, now.toISOString(), cfg)
  if (waited < cfg.thresholdMinutes) return null

  // Se redondea el total antes de separar horas y minutos.
  const total = Math.round(waited)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  const human = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`

  const lastOut = lastOutboundISO
    ? `Ultima respuesta del agente: ${new Date(lastOutboundISO).toISOString()}.`
    : 'El cliente escribio y nunca se respondio.'

  return {
    minutesWaiting: total,
    text: `Sin respuesta durante ${human} de horario laboral (umbral: ${cfg.thresholdMinutes}min). ${lastOut}`,
  }
}

/**
 * Festivos vigentes: la lista explicita si existe; si no, se calculan para el
 * ano actual y los vecinos.
 */
function holidaysFromEnv(explicit: string | undefined): Set<string> {
  const manual = (explicit ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  if (manual.length > 0) return new Set(manual)

  const currentYear = new Date().getUTCFullYear()
  return new Set([currentYear - 1, currentYear, currentYear + 1].flatMap(colombianHolidays))
}

export function slaConfigFromEnv(env: {
  SLA_THRESHOLD_MINUTES?: string
  BUSINESS_START_HOUR?: string
  BUSINESS_END_HOUR?: string
  BUSINESS_HOLIDAYS?: string
  SLA_CHANNELS?: string
  SLA_MAX_PER_RUN?: string
}): SlaConfig {
  const num = (value: string | undefined, fallback: number, min: number, max: number) => {
    const parsed = Number.parseInt(value ?? '', 10)
    if (Number.isNaN(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
  }

  return {
    thresholdMinutes: num(env.SLA_THRESHOLD_MINUTES, 60, 1, 24 * 60),
    startHour: num(env.BUSINESS_START_HOUR, 8, 0, 23),
    endHour: num(env.BUSINESS_END_HOUR, 18, 1, 24),
    holidays: holidaysFromEnv(env.BUSINESS_HOLIDAYS),

    // Por defecto solo se audita el canal que reporta respuestas salientes.
    channels: new Set(
      (env.SLA_CHANNELS ?? 'chatwoot')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    ),

    maxPerRun: num(env.SLA_MAX_PER_RUN, 100, 1, 1000),
  }
}
