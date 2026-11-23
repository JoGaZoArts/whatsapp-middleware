/**
 * Apaga el servidor local que dejo levantado `npm run demo`.
 *
 *   npm run demo:parar
 *
 * Se busca por puerto y no por el PID del lanzador: ese proceso muere con la
 * consola intermedia. Se cierra el arbol completo o wrangler se vuelve a
 * levantar.
 */
import { spawnSync } from 'node:child_process'

const PUERTO = 8789

const CONSULTA = `
$puerto = ${PUERTO}
$hoja = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty OwningProcess
if (-not $hoja) { Write-Output 'VACIO'; exit }
$pids = @()
$actual = $hoja
while ($actual -and $actual -ne 0) {
  $proceso = Get-CimInstance Win32_Process -Filter "ProcessId=$actual" -ErrorAction SilentlyContinue
  if (-not $proceso) { break }
  if ($proceso.CommandLine -notmatch 'npm') { $pids += $actual }
  $actual = $proceso.ParentProcessId
}
Write-Output ($pids -join ' ')
`

const salida = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', CONSULTA],
  { encoding: 'utf8' }
)

const pids = (salida.stdout ?? '').trim().split(/\s+/).filter((p) => /^\d+$/.test(p))

if (pids.length === 0) {
  console.log('No hay servidor de la demo corriendo: nada escucha en el puerto ' + PUERTO + '.')
  process.exit(0)
}

for (const pid of pids) {
  spawnSync('taskkill', ['/F', '/T', '/PID', pid], { stdio: 'ignore' })
}

console.log(
  'Servidor detenido en el puerto ' + PUERTO + ' (procesos: ' + pids.join(', ') + ').'
)