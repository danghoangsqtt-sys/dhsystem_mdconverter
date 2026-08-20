[CmdletBinding()]
param(
    [string]$PythonExe = ''
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))
$lockFile = Join-Path $projectRoot 'backend\requirements.lock.txt'
$generator = Join-Path $scriptRoot 'generate_lock.py'

if (-not $PythonExe) {
    $PythonExe = Join-Path $projectRoot 'docling-env\Scripts\python.exe'
}
if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) {
    throw "Python executable not found: $PythonExe. Pass -PythonExe, or set up docling-env first (this must be the same validated environment the test suite runs against, not an arbitrary interpreter)."
}

$tempDir = Join-Path $env:TEMP "documark-lock-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $tempDir | Out-Null
try {
    $frozen = Join-Path $tempDir 'frozen.txt'
    $report = Join-Path $tempDir 'report.json'

    Write-Host 'Freezing the currently-installed, already-tested dependency versions...'
    & $PythonExe -m pip freeze | Out-File -LiteralPath $frozen -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'pip freeze failed.' }

    Write-Host 'Resolving package hashes for the frozen dependency tree (needs internet)...'
    & $PythonExe -m pip install --dry-run --ignore-installed --no-deps --report $report -r $frozen
    if ($LASTEXITCODE -ne 0) { throw 'pip install --dry-run --report failed.' }

    & $PythonExe $generator --report $report --output $lockFile
    if ($LASTEXITCODE -ne 0) { throw 'Failed to write lock file.' }
}
finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Validating $lockFile installs cleanly under hash-checking mode..."
& $PythonExe -m pip install --require-hashes --dry-run --ignore-installed -r $lockFile *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Generated lock file failed --require-hashes validation. Run without output suppression to see why: $PythonExe -m pip install --require-hashes --dry-run --ignore-installed -r `"$lockFile`""
}

Write-Host "Done. Review the diff in $lockFile, then run the backend test suite before committing."
