# Builds dist\MeloirSetup.exe with the C# compiler that ships with Windows.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
New-Item -ItemType Directory -Force dist | Out-Null

# The icon is drawn from the same code as the installer's logo.
Add-Type -Path 'src\Logo.cs' -ReferencedAssemblies System.Drawing
Add-Type -AssemblyName System.Drawing
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    [MeloirLogo]::Draw($graphics, (New-Object System.Drawing.RectangleF 0, 0, $size, $size), [System.Drawing.Color]::White, [System.Drawing.Color]::Black)
    $graphics.Dispose()
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    if ($size -eq 256) { $bitmap.Save("$PSScriptRoot\assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png) }
    $bitmap.Dispose()
    , $stream.ToArray()
}
$icon = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter $icon
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $edge = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$edge); $writer.Write([byte]$edge); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($image in $images) { $writer.Write([byte[]]$image) }
[IO.File]::WriteAllBytes("$PSScriptRoot\assets\meloir.ico", $icon.ToArray())

$stage = 'dist\stage'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

$scripts = 'bridge.js', 'audio.js', 'data.js', 'ui.js' | ForEach-Object { "/resource:app\$_,$_" }
& $csc /nologo /target:winexe /optimize+ /platform:anycpu "/out:$stage\Meloir.exe" '/win32icon:assets\meloir.ico' `
    /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll @scripts 'src\Meloir.cs'
if ($LASTEXITCODE) { throw 'Meloir.exe did not build.' }

& $csc /nologo /target:winexe /optimize+ /platform:anycpu "/out:$stage\Uninstall.exe" '/win32icon:assets\meloir.ico' 'src\Uninstall.cs'
if ($LASTEXITCODE) { throw 'Uninstall.exe did not build.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'dist\meloir.zip'
if (Test-Path $zip) { Remove-Item -Force $zip }
[IO.Compression.ZipFile]::CreateFromDirectory((Resolve-Path $stage).Path, "$PSScriptRoot\$zip", [IO.Compression.CompressionLevel]::Optimal, $false)

& $csc /nologo /target:winexe /optimize+ /platform:anycpu '/out:dist\MeloirSetup.exe' '/win32icon:assets\meloir.ico' `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
    /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll `
    "/resource:$zip,meloir.zip" 'src\Setup.cs' 'src\Logo.cs'
if ($LASTEXITCODE) { throw 'MeloirSetup.exe did not build.' }
Remove-Item -Force $zip

Get-Item dist\MeloirSetup.exe | ForEach-Object { "$($_.Name)  $([math]::Round($_.Length / 1KB)) KB" }
