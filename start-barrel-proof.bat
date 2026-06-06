@echo off
setlocal

set "PORT=4173"

pushd "%~dp0"
echo Starting Barrel Proof at http://127.0.0.1:%PORT%/
echo Serving: %CD%
echo Press Ctrl+C in this window to stop the server.

python -m http.server %PORT% --bind 127.0.0.1
popd
