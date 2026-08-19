[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [string]$PythonVersion = '3.14.0',
    [string]$SmokeDocument = ''
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))
$runtimeDir = Join-Path $projectRoot 'python_runtime'
$pythonExe = Join-Path $runtimeDir 'python.exe'
$modelsDir = Join-Path $projectRoot 'offline_models'
$translationDir = Join-Path $modelsDir 'translation'
$requirements = Join-Path $projectRoot 'backend\requirements.txt'

function Invoke-CheckedPython {
    param([string[]]$Arguments)
    & $pythonExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Python command failed with exit code $LASTEXITCODE."
    }
}

if (-not $ValidateOnly -and -not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    New-Item -ItemType Directory -Path $runtimeDir | Out-Null
    $versionParts = $PythonVersion.Split('.')
    $versionCompact = "$($versionParts[0])$($versionParts[1])"
    $archiveName = "python-$PythonVersion-embed-amd64.zip"
    $archivePath = Join-Path $env:TEMP $archiveName
    $downloadUrl = "https://www.python.org/ftp/python/$PythonVersion/$archiveName"
    Write-Host "Downloading official Python embeddable runtime $PythonVersion..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDir

    $pthFile = Join-Path $runtimeDir "python$versionCompact._pth"
    if (-not (Test-Path -LiteralPath $pthFile -PathType Leaf)) {
        throw "Embedded Python path file was not found: $pthFile"
    }
    $pth = Get-Content -LiteralPath $pthFile -Raw
    $pth = $pth -replace '#import site', 'import site'
    Set-Content -LiteralPath $pthFile -Value $pth -Encoding ascii

    $getPipPath = Join-Path $env:TEMP 'documark-get-pip.py'
    Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPipPath
    & $pythonExe $getPipPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not bootstrap pip in the portable runtime.' }
}

if (-not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    throw "Portable Python runtime is missing: $pythonExe"
}

if (-not $ValidateOnly) {
    Write-Host 'Installing pinned backend dependencies into the portable runtime...'
    Invoke-CheckedPython @('-s', '-m', 'pip', 'install', '--disable-pip-version-check', '-r', $requirements)
    New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
    Write-Host 'Downloading the exact Docling and EasyOCR artifacts used by the application...'
    Invoke-CheckedPython @(
        '-s', '-m', 'docling.cli.tools', 'models', 'download',
        'layout', 'tableformer', 'easyocr', 'code_formula', '--output-dir', $modelsDir
    )

    Write-Host 'Downloading the offline EN->VI translation model (VietAI/envit5-translation)...'
    $env:DOCUMARK_TRANSLATION_DOWNLOAD_DIR = $translationDir
    Invoke-CheckedPython @(
        '-s', '-c',
        'import os; from huggingface_hub import snapshot_download; snapshot_download(repo_id="VietAI/envit5-translation", local_dir=os.environ["DOCUMARK_TRANSLATION_DOWNLOAD_DIR"], allow_patterns=["*.json", "*.model", "pytorch_model.bin"])'
    )
}

$modelFiles = @(Get-ChildItem -LiteralPath $modelsDir -File -Recurse -ErrorAction SilentlyContinue)
if ($modelFiles.Count -eq 0 -or ($modelFiles | Measure-Object -Property Length -Sum).Sum -lt 10MB) {
    throw "Offline model bundle is missing or incomplete: $modelsDir"
}

$env:DOCUMARK_OFFLINE_MODE = '1'
$env:DOCLING_ARTIFACTS_PATH = $modelsDir
$env:DOCUMARK_TRANSLATION_MODEL_PATH = $translationDir
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:PYTHONNOUSERSITE = '1'
$env:PYTHONPATH = $projectRoot
Invoke-CheckedPython @(
    '-s', '-c',
    "import sys; assert sys.prefix == sys.base_prefix; import asyncio, fastapi, uvicorn, docling, easyocr; from backend.src.services.docling_service import get_converter; get_converter(); from backend.src.services.translation_service import translate_to_vietnamese; result = asyncio.run(translate_to_vietnamese('The energy of a photon is given by the formula `$E=hf`$, where h is the Planck constant.')); assert result.strip(); assert '`$E=hf`$' in result, f'formula not preserved verbatim: {result!r}'; print('offline-runtime-ok')"
)

if ($SmokeDocument) {
    $resolvedSmoke = (Resolve-Path -LiteralPath $SmokeDocument).Path
    $env:DOCUMARK_SMOKE_DOCUMENT = $resolvedSmoke
    Invoke-CheckedPython @(
        '-s', '-c',
        "import os; from backend.src.services.docling_service import convert_document_to_markdown; text=convert_document_to_markdown(os.environ['DOCUMARK_SMOKE_DOCUMENT']); assert text.strip(); print(f'offline-smoke-ok:{len(text)}')"
    )
}

$totalMiB = [math]::Round((($modelFiles | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Host "Offline bundle validated: runtime + $($modelFiles.Count) model files ($totalMiB MiB)."
