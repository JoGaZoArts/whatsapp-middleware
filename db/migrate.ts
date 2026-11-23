/**
 * Aplica db/schema.sql en Neon. El SQL es idempotente.
 *
 *   npx tsx db/migrate.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

function readDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  const varsFile = resolve(process.cwd(), '.dev.vars')
  // split por /\r?\n/ para tolerar CRLF, y se quita el BOM.
  for (const raw of readFileSync(varsFile, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '').trim()
    const match = line.match(/^DATABASE_URL=(.+)$/)
    if (match) return match[1].trim()
  }
  throw new Error('No se encontro DATABASE_URL ni en el entorno ni en .dev.vars')
}

/** Quita comentarios de linea y separa sentencias por ';'. */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function main() {
  const databaseUrl = readDatabaseUrl()
  const sql = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8')
  const statements = splitStatements(sql)

  console.log('Ejecutando ' + statements.length + ' sentencias...\n')
  const client = neon(databaseUrl)

  for (const [index, statement] of statements.entries()) {
    const label = statement.split('\n')[0].slice(0, 68)
    const position = '[' + (index + 1) + '/' + statements.length + ']'
    try {
      await client(statement)
      console.log('  ' + position + ' OK    ' + label)
    } catch (error) {
      console.error('  ' + position + ' FALLA ' + label)
      console.error('         ' + (error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  }

  console.log('\nMigracion aplicada. Verificacion:')
  const tables = (await client(
    'SELECT table_name FROM information_schema.tables ' +
      "WHERE table_schema = 'public' ORDER BY table_name"
  )) as { table_name: string }[]

  const names = tables.map((t) => t.table_name)
  console.log('  Tablas en public: ' + (names.join(', ') || '(ninguna)'))

  const required = ['conversations', 'events', 'tasks', 'lead_logs']
  const missing = required.filter((t) => !names.includes(t))
  if (missing.length > 0) {
    console.error('  FALTAN: ' + missing.join(', '))
    process.exit(1)
  }

  const columns = (await client(
    "SELECT column_name FROM information_schema.columns " +
      "WHERE table_name = 'lead_logs' AND column_name = 'message_raw'"
  )) as { column_name: string }[]
  console.log(
    columns.length > 0
      ? '  lead_logs.message_raw presente (PII original preservada).'
      : '  lead_logs.message_raw AUSENTE'
  )

  console.log('  Todas las tablas requeridas existen.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
