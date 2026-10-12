$ErrorActionPreference = 'Stop'
$applicationDirectory = $PSScriptRoot
$configurationPath = Join-Path $applicationDirectory '.env'
$applicationPort = 3210
if (Test-Path -LiteralPath $configurationPath) {
    $portLine = Get-Content -LiteralPath $configurationPath | Where-Object { $_ -match '^PORT=\d+$' } | Select-Object -First 1
    if ($portLine) { $applicationPort = [int]($portLine -replace '^PORT=', '') }
}
$applicationUrl = "http://127.0.0.1:$applicationPort"
try {
    $health = Invoke-RestMethod "$applicationUrl/api/health" -TimeoutSec 3
    if ($health.ok) { Start-Process $applicationUrl; exit 0 }
} catch {}
if (Get-NetTCPConnection -LocalPort $applicationPort -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $applicationPort is occupied. Change PORT in .env."
}
if (-not (Test-Path -LiteralPath (Join-Path $applicationDirectory 'dist/index.html'))) {
    Push-Location $applicationDirectory
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } } finally { Pop-Location }
}
$logDirectory = Join-Path $applicationDirectory 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$nodeExecutable = (Get-Command node.exe).Source
Start-Process -FilePath $nodeExecutable -ArgumentList 'server/index.mjs' -WorkingDirectory $applicationDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'server.log') -RedirectStandardError (Join-Path $logDirectory 'server-error.log') | Out-Null
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod "$applicationUrl/api/health" -TimeoutSec 2
        if ($health.ok) { Start-Process $applicationUrl; exit 0 }
    } catch {}
}
throw 'Application did not start. Check logs/server-error.log.'
