$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 4173

Write-Host "Starting Barrel Proof at http://127.0.0.1:$port/"
Write-Host "Serving: $appRoot"
Write-Host "Press Ctrl+C in this window to stop the server."

python -m http.server $port --bind 127.0.0.1 --directory $appRoot
