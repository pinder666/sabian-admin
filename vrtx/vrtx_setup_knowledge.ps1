$ErrorActionPreference = "Stop"

$root = Get-Location
$knowledgeDir = Join-Path $root "vrtx\knowledge"
$pdfDir = Join-Path $knowledgeDir "pdfs"
$notesDir = Join-Path $knowledgeDir "notes"
$chunksDir = Join-Path $knowledgeDir "chunks"

$paths = @($knowledgeDir, $pdfDir, $notesDir, $chunksDir)

foreach ($p in $paths) {
    if (!(Test-Path $p)) {
        New-Item -ItemType Directory -Path $p | Out-Null
        Write-Host "Created: $p"
    } else {
        Write-Host "Exists: $p"
    }
}

$readmePath = Join-Path $knowledgeDir "README.txt"

if (!(Test-Path $readmePath)) {
@"
VRTX Knowledge Library

pdfs   -> place science books and papers here
notes  -> manual doctrine notes
chunks -> future extracted text for retrieval
"@ | Set-Content -Path $readmePath -Encoding UTF8
}

Write-Host ""
Write-Host "VRTX knowledge folders ready."