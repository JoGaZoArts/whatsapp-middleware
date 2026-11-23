import type { LeadClassification } from '../types'

// Capa de IA intercambiable. El proveedor se indica en AI_PROVIDER.

export interface AiEnv {
  AI_PROVIDER?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  AI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
}

const SYSTEM_PROMPT = [
  'Eres un asistente de triaje comercial para un equipo de ventas que usa WhatsApp.',
  'Clasifica el mensaje del cliente potencial y responde EXCLUSIVAMENTE con un objeto JSON,',
  'sin texto alrededor y sin bloques de codigo, con esta forma exacta:',
  '{"priority":"HOT|WARM|COLD","intent":"...","confidence":0.0,"summary":"..."}',
  '',
  'Criterios:',
  '- HOT: intencion de compra explicita, presupuesto o urgencia alta.',
  '- WARM: interes real pero sin intencion de compra clara, o necesita seguimiento.',
  '- COLD: consulta trivial, soporte tecnico, publicidad o sin relacion comercial.',
  '- confidence: 0.0 a 1.0, tu certeza sobre la clasificacion.',
  '- summary: una frase breve en espanol sobre que busca el cliente.',
].join('\n')

interface AiProvider {
  name: string
  call(apiKey: string, system: string, user: string): Promise<string>
}

// ---------- Utilidades ----------

/**
 * Valor no vacio, o el defecto. En .dev.vars, "NOMBRE=" llega como cadena
 * vacia y no como undefined.
 */
function valor(v: string | undefined, porDefecto: string): string {
  const limpio = (v ?? '').trim()
  return limpio === '' ? porDefecto : limpio
}

// ---------- Cliente con formato de chat estandar ----------

function openAiCompatible(baseUrl: string, modelo: string): AiProvider {
  return {
    name: 'compatible',
    async call(apiKey, system, user) {
      const response = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      })
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + (await response.text()))
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content ?? ''
    },
  }
}

// ---------- Registro ----------

interface ResolvedProvider {
  provider: AiProvider
  apiKey: string
  warning?: string
}

function resolveProvider(env: AiEnv): ResolvedProvider {
  const requested = valor(env.AI_PROVIDER, 'deepseek').toLowerCase()
  const genericKey = valor(env.AI_API_KEY, '')

  switch (requested) {
    case 'compatible':
      if (!valor(env.AI_BASE_URL, '')) {
        console.warn('[ai] AI_PROVIDER=compatible sin AI_BASE_URL: se usa DeepSeek.')
        return resolveProvider({ ...env, AI_PROVIDER: 'deepseek' })
      }
      const modelo = valor(env.AI_MODEL, '')
      if (!modelo) {
        console.warn('[ai] AI_PROVIDER=compatible sin AI_MODEL: se usa DeepSeek.')
        return resolveProvider({ ...env, AI_PROVIDER: 'deepseek' })
      }
      return {
        provider: openAiCompatible(valor(env.AI_BASE_URL, ''), modelo),
        apiKey: genericKey,
        warning: 'AI_API_KEY vacia',
      }

    case 'deepseek':
    default:
      // Modelo por defecto: deepseek-flash.
      return {
        provider: openAiCompatible('https://api.deepseek.com', valor(env.AI_MODEL, 'deepseek-flash')),
        apiKey: valor(env.DEEPSEEK_API_KEY, genericKey),
        warning: 'DEEPSEEK_API_KEY vacia',
      }
  }
}

// ---------- Normalizacion de la respuesta ----------

function parseClassification(raw: string): LeadClassification {
  const fallback: LeadClassification = {
    priority: 'WARM',
    intent: 'sin clasificar',
    confidence: 0,
    summary: 'La IA no devolvio una clasificacion valida',
    aiAvailable: false,
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return fallback

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    const priority = String(parsed.priority ?? '').toUpperCase()
    if (priority !== 'HOT' && priority !== 'WARM' && priority !== 'COLD') return fallback

    const confidence = Number(parsed.confidence)
    return {
      priority,
      intent: typeof parsed.intent === 'string' ? parsed.intent : 'sin clasificar',
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      aiAvailable: true,
    }
  } catch {
    return fallback
  }
}

// ---------- API publica ----------

/**
 * Clasifica un lead. Nunca lanza: si la IA falla devuelve un default con
 * aiAvailable=false para que el pipeline continue.
 *
 * @param redactedText texto sin PII. Es lo unico que sale de la infraestructura.
 */
export async function classifyLead(
  env: AiEnv,
  phone: string,
  redactedText: string
): Promise<LeadClassification> {
  const { provider, apiKey, warning } = resolveProvider(env)
  const user = 'Telefono: ' + phone + '\nMensaje: ' + redactedText

  if (!apiKey) {
    console.error('[ai] ' + warning + ': no se puede clasificar.')
    return {
      priority: 'WARM',
      intent: 'sin credencial de IA',
      confidence: 0,
      summary: 'Proveedor ' + provider.name + ' sin API key',
      aiAvailable: false,
    }
  }

  try {
    return parseClassification(await provider.call(apiKey, SYSTEM_PROMPT, user))
  } catch (error) {
    console.error('[ai] Fallo con ' + provider.name + ':', error)
    return {
      priority: 'WARM',
      intent: 'error de ia',
      confidence: 0,
      summary: 'La IA no respondio correctamente',
      aiAvailable: false,
    }
  }
}
