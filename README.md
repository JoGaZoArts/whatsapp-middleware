<div align="center">

# WhatsApp Business Middleware

**Recepción autenticada, anonimización, clasificación con IA y control de tiempos de respuesta para WhatsApp Business.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-74_passing-2ea44f?style=flat-square)
![Chatwoot](https://img.shields.io/badge/Chatwoot-1F93FF?style=flat-square&logo=chatwoot&logoColor=white)
![DeepSeek](https://img.shields.io/badge/DeepSeek-4D6BFE?style=flat-square)
![Neon](https://img.shields.io/badge/Neon-00E599?style=flat-square&logo=neon&logoColor=white)

</div>

> Middleware que recibe los mensajes de WhatsApp de una empresa, anonimiza los datos personales, los clasifica con inteligencia artificial, mide el tiempo de respuesta en horario laboral y los conecta con el CRM. Todo corre sobre Cloudflare Workers (sin servidor propio) y PostgreSQL en Neon.

---

## Arquitectura

Chatwoot autoalojado es la bandeja de los agentes y el canal oficial con Meta. El Worker es la capa que lo extiende con IA, seguridad, SLA y CRM.

```
Meta → Chatwoot (canal oficial) → Worker (webhook) → Procesamiento → CRM
```

## Requisitos

- Node.js 18+
- Cuenta de Cloudflare (Workers)
- Base de datos PostgreSQL (Neon u otra)
- Cuenta de Meta con app de WhatsApp Cloud API
- Chatwoot autoalojado (Docker)
- API key de DeepSeek

## Instalación

```sh
git clone https://github.com/JoGaZoArts/whatsapp-middleware.git
cd whatsapp-middleware
npm install
cp .dev.vars.example .dev.vars
# Completar los valores en .dev.vars
npm run dev
```

## Configuración

Variables principales en `.dev.vars` (local) o Cloudflare (producción):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL |
| `DEEPSEEK_API_KEY` | Clave de la API de DeepSeek |
| `APP_SECRET` | Secreto para validar firma de Meta |
| `WEBHOOK_VERIFY_TOKEN` | Token de verificación del webhook de Meta |
| `ADMIN_KEY` | Clave de administración para endpoints protegidos |
| `CHATWOOT_WEBHOOK_SECRET` | Secreto compartido con Chatwoot |
| `PHONE_NUMBER_ID` | ID del número de WhatsApp (solo envío de prueba) |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso a la API de WhatsApp (solo envío de prueba) |
| `AI_PROVIDER` | `deepseek` o `compatible` |
| `CRM_PROVIDER` | `mock` o `rdstation` |
| `SLA_THRESHOLD_MINUTES` | Umbral de SLA en minutos (default: 60) |
| `BUSINESS_START_HOUR` | Hora de inicio del horario laboral (default: 8) |
| `BUSINESS_END_HOUR` | Hora de fin del horario laboral (default: 18) |
| `BUSINESS_HOLIDAYS` | Días festivos (YYYY-MM-DD, separados por coma) |

## Comandos

```sh
npm run dev            # Servidor local
npm test               # Pruebas de lógica (61)
npm run demo           # Verificación completa (9 endpoints + 4 SLA)
npm run typecheck      # Verificación de tipos
npm run deploy         # Publicar en Cloudflare
npm run migrate        # Ejecutar migraciones de BD
```

## Pruebas

74 pruebas automatizadas:

| Suite | Pruebas |
|---|---:|
| Horario laboral | 26 |
| Anonimización | 35 |
| Endpoints | 9 |
| Tiempos de respuesta (SLA) | 4 |

## Estructura del proyecto

```
src/
├── index.ts        rutas, autenticación y orquestación
├── types.ts        contrato interno del mensaje
├── ingest/         meta.ts · chatwoot.ts (adaptadores por canal)
├── services/       ai.ts · db.ts · crm.ts
├── middleware/     anonymizer.ts
└── lib/            businesstime.ts
db/
├── schema.sql
└── migrate.ts
```

## Seguridad

- Firma HMAC-SHA256 para webhooks de Meta.
- Secreto compartido para webhooks de Chatwoot.
- Clave de administración para endpoints protegidos.
- Anonimización de PII antes de enviar texto a la IA.
- Logs enmascarados (teléfonos, correos, cédulas, tarjetas).
- Secretos en `.dev.vars` (local) o Cloudflare (producción), nunca en el repositorio.

## Licencia

MIT