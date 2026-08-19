$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..'))
$trackedRuntimeData = @(
    git -C $projectRoot ls-files -- 'data/uploads/**' 'data/outputs/**' 'data/history.json'
)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect tracked runtime data.' }
if ($trackedRuntimeData.Count -gt 0) {
    Write-Error ("Runtime/user data is tracked by Git:`n" + ($trackedRuntimeData -join "`n"))
    exit 1
}
Write-Host 'Repository hygiene check passed: no runtime/user conversion data is tracked.'
