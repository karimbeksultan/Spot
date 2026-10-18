param([switch]$AllowHomeKeyCreation, [int]$Port = 11434)
$ErrorActionPreference = 'Stop'
$spotRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$spotRuntime = Join-Path $spotRoot 'work/ollama'
$spotBinary = Join-Path $spotRuntime 'ollama.exe'
$spotLogs = Join-Path $spotRoot 'work/ollama-logs'
$spotModels = Join-Path $spotRoot 'work/models'
$spotState = Join-Path $spotLogs 'state.json'
$spotGuardScript = Join-Path $PSScriptRoot 'watch-local-model-memory.ps1'
if (-not (Test-Path -LiteralPath $spotBinary)) { throw 'Missing portable runtime. See docs/local-model-audit.md. This command downloads nothing.' }
if (-not $AllowHomeKeyCreation -and -not (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.ollama/id_ed25519'))) { throw 'Ollama creates its standard home-directory key. Review this write and use -AllowHomeKeyCreation to approve it.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'The requested port already has a listener. Existing processes will not be replaced.' }
$spotOs = Get-CimInstance Win32_OperatingSystem
if ($spotOs.FreePhysicalMemory / 1MB -lt 3.5) { throw 'At least 3.5 GiB free physical RAM is required before starting the local understanding model.' }
New-Item -ItemType Directory -Force -Path $spotModels,$spotLogs | Out-Null
$spotGuardStop = Join-Path $spotLogs 'guard.stop'
if (Test-Path -LiteralPath $spotGuardStop) { Remove-Item -LiteralPath $spotGuardStop }
# These settings apply only to this process and the hidden child; no global config changes.
$env:OLLAMA_MODELS = $spotModels
$env:OLLAMA_HOST = '127.0.0.1:' + $Port
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_NOHISTORY = '1'
$env:OLLAMA_LLM_LIBRARY = 'cpu'
$env:OLLAMA_VULKAN = '0'
$env:CUDA_VISIBLE_DEVICES = '-1'
$env:ROCR_VISIBLE_DEVICES = '-1'
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_CONTEXT_LENGTH = '2048'
$env:OLLAMA_KEEP_ALIVE = '30s'
$spotServer = Start-Process -FilePath $spotBinary -ArgumentList 'serve' -WorkingDirectory $spotRuntime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $spotLogs 'stdout.log') -RedirectStandardError (Join-Path $spotLogs 'stderr.log')
$spotRecord = @{serverId=$spotServer.Id;serverStartUtc=$spotServer.StartTime.ToUniversalTime().ToString('o');guardId=$null;binary=$spotBinary;port=$Port;startedAt=[DateTime]::UtcNow.ToString('o')}
$spotRecord | ConvertTo-Json | Set-Content -LiteralPath $spotState
try {
  $spotGuard = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-File',('"' + $spotGuardScript + '"'),'-ServerId',$spotServer.Id) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $spotLogs 'guard.stdout.log') -RedirectStandardError (Join-Path $spotLogs 'guard.stderr.log')
  $spotRecord.guardId = $spotGuard.Id
  $spotRecord | ConvertTo-Json | Set-Content -LiteralPath $spotState
} catch { & (Join-Path $PSScriptRoot 'stop-local-models.ps1'); throw }
Write-Output ('Spot Ollama started on http://127.0.0.1:' + $Port + '. Models remain unloaded until requested. Stop with scripts/stop-local-models.ps1.')
