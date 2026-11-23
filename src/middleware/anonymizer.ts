// Enmascarado de PII. El original se conserva aparte en Neon (message_raw);
// aqui solo se produce la version apta para enviar.
//
// El orden importa: de mas largo a mas corto, para que una tarjeta de 16
// digitos no se parta en varios fragmentos.

const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

/** 13-19 digitos, con espacios, guiones o puntos opcionales: tarjeta. */
const RE_CARD = /(?:\d[ .\u002D]?){12,18}\d/g

/** Prefijo internacional explicito: +57..., +1..., etc. */
const RE_PHONE_INTL = /\+\d[\d\s().-]{7,17}\d/g

/**
 * Telefono nacional con separador: 319 653 2981, 319.653.2981, 601 7458800.
 * El lookbehind evita empezar a mitad de una cedula con puntos.
 */
const RE_PHONE_NACIONAL = /(?<![\d.,])\d{3}[ .-](?:\d{3}[ .-]\d{4}|\d{7})\b/g

/** Documento con separador de miles: 1.234.567.890, 900.123.456-7. */
const RE_DOCUMENTO_SEP = /\b\d{1,3}(?:[.,]\d{3}){2,3}(?:-\d)?\b/g

/**
 * 10 digitos que NO empiezan por 3. En Colombia los moviles empiezan por 3,
 * asi que otra cabecera es una cedula y se etiqueta como documento.
 */
const RE_DOC_10 = /\b(?!3\d{9})\d{10}\b/g

/** 10-15 digitos: movil o fijo internacional sin prefijo. */
const RE_PHONE = /\b\d{10,15}\b/g

/** 6-9 digitos: cedula, NIT u otro documento. */
const RE_DOCUMENT = /\b\d{6,9}\b/g

export function anonymizePII(text: string): string {
  if (!text) return text

  let cleaned = text

  // El correo va primero: contiene digitos que tocan las demas reglas.
  cleaned = cleaned.replace(RE_EMAIL, '[REDACTED_EMAIL]')

  // Las fechas no necesitan excepcion: RE_CARD exige 13-19 digitos y una fecha
  // como 2026-09-27 solo tiene 8.
  cleaned = cleaned.replace(RE_CARD, '[REDACTED_CARD]')

  cleaned = cleaned.replace(RE_PHONE_INTL, '[REDACTED_PHONE]')

  // Antes de la regla de documento para que "319.653.2981" se lea como
  // telefono y no se parta en "319.653" + "2981".
  cleaned = cleaned.replace(RE_PHONE_NACIONAL, '[REDACTED_PHONE]')

  cleaned = cleaned.replace(RE_DOCUMENTO_SEP, '[REDACTED_ID]')
  cleaned = cleaned.replace(RE_DOC_10, '[REDACTED_ID]')
  cleaned = cleaned.replace(RE_PHONE, '[REDACTED_PHONE]')
  cleaned = cleaned.replace(RE_DOCUMENT, '[REDACTED_ID]')

  return cleaned
}

/** Sustituye conservando el tipo de dato, para poder contar. */
export function tokenizePII(text: string): string {
  if (!text) return text
  return text
    .replace(RE_EMAIL, '[EMAIL]')
    .replace(RE_CARD, '[CARD]')
    .replace(RE_PHONE_INTL, '[PHONE]')
    .replace(RE_PHONE_NACIONAL, '[PHONE]')
    .replace(RE_DOCUMENTO_SEP, '[DOC]')
    .replace(RE_DOC_10, '[DOC]')
    .replace(RE_PHONE, '[PHONE]')
    .replace(RE_DOCUMENT, '[DOC]')
}

/**
 * Enmascara un telefono para logs: conserva el pais y los ultimos tres digitos.
 * No se usa para la base de datos ni para el CRM; solo para trazas.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(sin telefono)'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return '(telefono oculto)'
  return '+' + digits.slice(0, 3) + '******' + digits.slice(-3)
}

/** Deja un texto apto para logs: sin PII y con un tope de longitud. */
export function safeText(text: string | null | undefined, max = 160): string {
  if (!text) return ''
  const clean = anonymizePII(text)
  return clean.length > max ? clean.slice(0, max) + '...' : clean
}
