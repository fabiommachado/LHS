<#
.SYNOPSIS
    Creates or updates the LHS candidate module database.

.DESCRIPTION
    Runs the numbered SQL scripts in this folder, in order, with sqlcmd and Windows authentication.
    Every script is re-runnable: re-deploying updates views, procedures, reference data and roles
    without touching existing candidate data.

.EXAMPLE
    .\deploy.ps1                                  # localhost\SQLEXPRESS, database LHS
    .\deploy.ps1 -IncludeDemoData                 # also load the demo candidates (only if the table is empty)
    .\deploy.ps1 -Server myserver -Database LHS_Test
#>
[CmdletBinding()]
param(
    [string] $Server = 'localhost\SQLEXPRESS',
    [string] $Database = 'LHS',
    [switch] $IncludeDemoData
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    throw 'sqlcmd was not found. Install the SQL Server command-line tools and try again.'
}

$scripts = @(
    '01_create_database.sql',
    '02_tables.sql',
    '03_reference_data.sql',
    '04_programmability.sql',
    '05_security.sql'
)
if ($IncludeDemoData) { $scripts += '06_demo_data.sql' }

foreach ($script in $scripts) {
    $path = Join-Path $PSScriptRoot $script
    Write-Host "Running $script ..." -ForegroundColor Cyan
    # -E Windows auth, -b fail on error, -I QUOTED_IDENTIFIER ON (needed for computed-column indexes),
    # -f 65001 read scripts as UTF-8 (they contain characters such as – and →)
    & sqlcmd -S $Server -E -b -I -f 65001 -v "DatabaseName=$Database" -i $path
    if ($LASTEXITCODE -ne 0) { throw "$script failed (exit code $LASTEXITCODE). Deployment stopped." }
}

Write-Host "Database '$Database' on '$Server' is up to date." -ForegroundColor Green
