$ErrorActionPreference = 'Stop'
if ((Resolve-Path '.').Path -ne $PSScriptRoot) { throw 'Entrar primero en la carpeta del prototipo.' }
$previousModCache = $env:GOMODCACHE
$previousBuildCache = $env:GOCACHE
try {
    $env:GOMODCACHE = Join-Path $PSScriptRoot '.cache/gomod'
    $env:GOCACHE = Join-Path $PSScriptRoot '.cache/go-build'
    node cases.mjs
    if ($LASTEXITCODE) { throw 'No se pudieron generar los casos.' }
    node node.mjs
    if ($LASTEXITCODE) { throw 'Falló TypeScript.' }
    go run .
    if ($LASTEXITCODE) { throw 'Falló Go.' }
    node report.mjs
    if ($LASTEXITCODE) { throw 'Los resultados no coinciden.' }
} finally {
    $env:GOMODCACHE = $previousModCache
    $env:GOCACHE = $previousBuildCache
}
