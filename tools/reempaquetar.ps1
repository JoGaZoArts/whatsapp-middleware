param(
  [Parameter(Mandatory=$true)][string]$Original,
  [Parameter(Mandatory=$true)][string]$DocumentoXml,
  [Parameter(Mandatory=$true)][string]$Destino,
  [Parameter(Mandatory=$true)][string]$Trabajo
)

# Reempaqueta un .docx sustituyendo word/document.xml.
#
# Se trabaja sobre una copia intermedia en $Trabajo para no tocar nunca el
# original ni el destino hasta saber que el resultado es correcto.
#
# Validacion: el resultado debe tener exactamente las mismas entradas que el
# original y el mismo tamano en todas salvo document.xml. Si no, se descarta.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$Base = Join-Path $Trabajo 'base.docx'
$Tmp  = Join-Path $Trabajo 'salida.docx'

foreach ($f in @($Base, $Tmp)) {
  if (Test-Path $f) { Remove-Item $f -Force }
}

# 1. Copia limpia del original. Si esta bloqueado, se avisa y se detiene.
try { Copy-Item $Original $Base -ErrorAction Stop }
catch {
  Write-Output 'ERROR: el archivo original esta abierto o bloqueado.'
  Write-Output 'Cierralo en Word y vuelve a ejecutar.'
  exit 2
}

# 2. Indice de la base
$zipBase = [System.IO.Compression.ZipFile]::OpenRead($Base)
$indiceBase = @{}
foreach ($ent in $zipBase.Entries) { $indiceBase[$ent.FullName] = $ent.Length }
$zipBase.Dispose()
Write-Output ("Base verificada: {0} entradas" -f $indiceBase.Count)

# 3. Copia de trabajo y sustitucion de document.xml
Copy-Item $Base $Tmp
$zip = [System.IO.Compression.ZipFile]::Open($Tmp, 'Update')
$entradaXml = $null
foreach ($ent in $zip.Entries) {
  if ($ent.FullName -eq 'word/document.xml') { $entradaXml = $ent }
}
if ($null -eq $entradaXml) { $zip.Dispose(); Write-Output 'ERROR: no hay document.xml'; exit 3 }
$entradaXml.Delete()
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
  $zip, $DocumentoXml, 'word/document.xml', [System.IO.Compression.CompressionLevel]::Optimal
) | Out-Null
$zip.Dispose()

# 4. Validacion
$zipSalida = [System.IO.Compression.ZipFile]::OpenRead($Tmp)
$indiceSalida = @{}
foreach ($ent in $zipSalida.Entries) { $indiceSalida[$ent.FullName] = $ent.Length }
$zipSalida.Dispose()

$problemas = New-Object System.Collections.Generic.List[string]
if ($indiceSalida.Count -ne $indiceBase.Count) {
  $problemas.Add("entradas: $($indiceBase.Count) -> $($indiceSalida.Count)")
}
foreach ($nombre in $indiceBase.Keys) {
  if (-not $indiceSalida.ContainsKey($nombre)) {
    $problemas.Add("falta $nombre")
  }
  elseif ($nombre -ne 'word/document.xml') {
    if ($indiceSalida[$nombre] -ne $indiceBase[$nombre]) {
      $problemas.Add("tamano distinto en ${nombre}: $($indiceBase[$nombre]) -> $($indiceSalida[$nombre])")
    }
  }
}
foreach ($nombre in $indiceSalida.Keys) {
  if (-not $indiceBase.ContainsKey($nombre)) { $problemas.Add("sobrante $nombre") }
}

if ($problemas.Count -gt 0) {
  Write-Output 'VALIDACION FALLIDA:'
  foreach ($p in $problemas) { Write-Output "  - $p" }
  Remove-Item $Tmp -Force -ErrorAction SilentlyContinue
  exit 4
}

# 5. Solo ahora se publica el resultado
if (Test-Path $Destino) {
  try { Remove-Item $Destino -Force -ErrorAction Stop }
  catch { Write-Output 'ERROR: el destino esta abierto en Word. Cierralo.'; exit 5 }
}
Move-Item $Tmp $Destino -Force
Remove-Item $Base -Force -ErrorAction SilentlyContinue

Write-Output ("VALIDADO: {0} entradas, todas intactas salvo document.xml" -f $indiceSalida.Count)
Write-Output ("  destino: {0} ({1} bytes)" -f $Destino, (Get-Item $Destino).Length)
exit 0
