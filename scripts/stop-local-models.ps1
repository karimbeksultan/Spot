$ErrorActionPreference = 'Stop'
$spotRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$spotRuntime = [IO.Path]::GetFullPath((Join-Path $spotRoot 'work/ollama'))
$spotPrefix = $spotRuntime.TrimEnd('\') + '\'
$spotLogs = Join-Path $spotRoot 'work/ollama-logs'
$spotStatePath = Join-Path $spotLogs 'state.json'
if (-not (Test-Path -LiteralPath $spotStatePath)) { Write-Output 'No tracked Spot runtime state. No process was stopped.'; return }
$spotState = Get-Content -LiteralPath $spotStatePath -Raw | ConvertFrom-Json
$spotExpectedBinary = Join-Path $spotRuntime 'ollama.exe'
if (-not [string]::Equals($spotState.binary,$spotExpectedBinary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime state binary does not match this repository.' }
$spotServer = Get-Process -Id ([int]$spotState.serverId) -ErrorAction SilentlyContinue
if ($spotServer) {
  $spotExpectedStart = ([DateTime]$spotState.serverStartUtc).ToUniversalTime()
  if (-not [string]::Equals($spotServer.Path,$spotExpectedBinary,[StringComparison]::OrdinalIgnoreCase) -or $spotServer.StartTime.ToUniversalTime().Ticks -ne $spotExpectedStart.Ticks) { throw 'PID or start time no longer matches the tracked server. No process was stopped.' }
  # Only terminate the tracked server and its direct runtime children with a validated executable path.
  $spotChildren = @(Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $spotServer.Id) | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($spotPrefix,[StringComparison]::OrdinalIgnoreCase) })
  foreach ($spotChild in $spotChildren) { Stop-Process -Id $spotChild.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $spotServer.Id -Force -ErrorAction SilentlyContinue
}
'stop' | Set-Content -LiteralPath (Join-Path $spotLogs 'guard.stop')
# The first approved setup used this older guard path; allow it to exit as well.
$spotOldGuardDir = Join-Path $spotRoot 'work/ollama-audit'
if (Test-Path -LiteralPath $spotOldGuardDir) { 'stop' | Set-Content -LiteralPath (Join-Path $spotOldGuardDir 'monitor.stop') }
Write-Output 'Tracked Spot Ollama runtime stopped; model files remain available for the next start.'
