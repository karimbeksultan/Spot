param([Parameter(Mandatory=$true)][int]$ServerId, [double]$MinimumFreeGiB = 1.0)
$ErrorActionPreference = 'Stop'
$spotRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$spotPrefix = [IO.Path]::GetFullPath((Join-Path $spotRoot 'work/ollama')).TrimEnd('\') + '\'
$spotLogs = Join-Path $spotRoot 'work/ollama-logs'
$spotMinimum = [double]::PositiveInfinity
[double]$spotPeak = 0
while (-not (Test-Path -LiteralPath (Join-Path $spotLogs 'guard.stop'))) {
  $spotServer = Get-Process -Id $ServerId -ErrorAction SilentlyContinue
  $spotServerPath = if ($spotServer) { try { $spotServer.Path } catch { $null } } else { $null }
  if (-not $spotServerPath -or -not $spotServerPath.StartsWith($spotPrefix,[StringComparison]::OrdinalIgnoreCase)) { break }
  try { $spotFree = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB }
  catch { & (Join-Path $PSScriptRoot 'stop-local-models.ps1'); throw 'Memory guard cannot read physical RAM; stopped the tracked local runtime.' }
  $spotProcesses = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $spotProcessPath = $_.Path; $spotProcessPath -and $spotProcessPath.StartsWith($spotPrefix,[StringComparison]::OrdinalIgnoreCase) }
    catch { $false }
  })
  [double]$spotWorking = ($spotProcesses | Measure-Object WorkingSet64 -Sum).Sum
  $spotMinimum = [Math]::Min($spotMinimum,$spotFree)
  $spotPeak = [Math]::Max($spotPeak,$spotWorking)
  $spotRecord = @{at=[DateTime]::UtcNow.ToString('o');freeGiB=[Math]::Round($spotFree,3);minimumFreeGiB=[Math]::Round($spotMinimum,3);ollamaWorkingSetMiB=[Math]::Round($spotWorking/1MB,1);peakOllamaWorkingSetMiB=[Math]::Round($spotPeak/1MB,1);stopped=($spotFree -lt $MinimumFreeGiB)}
  $spotRecord | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $spotLogs 'memory.jsonl')
  if ($spotRecord.stopped) { & (Join-Path $PSScriptRoot 'stop-local-models.ps1'); break }
  Start-Sleep -Seconds 2
}
