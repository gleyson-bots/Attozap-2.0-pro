Add-Type -AssemblyName System.Drawing

$out = Join-Path $PWD 'build\appx'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function New-AttoTile([string]$name, [int]$width, [int]$height) {
  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $purple = [System.Drawing.Color]::FromArgb(255, 118, 87, 255)
  $white = [System.Drawing.Color]::White
  $brush = New-Object System.Drawing.SolidBrush($purple)
  $g.FillRectangle($brush, 0, 0, $width, $height)

  $side = [Math]::Min($width, $height)
  $diameter = [int]($side * 0.58)
  $x = [int](($width - $diameter) / 2)
  $y = [int](($height - $diameter) / 2)
  $whiteBrush = New-Object System.Drawing.SolidBrush($white)
  $g.FillEllipse($whiteBrush, $x, $y, $diameter, $diameter)

  $fontSize = [Math]::Max(8, [int]($side * 0.19))
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = New-Object System.Drawing.SolidBrush($purple)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF($x, $y, $diameter, $diameter)
  $g.DrawString('AZ', $font, $textBrush, $rect, $format)

  $path = Join-Path $out $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose(); $textBrush.Dispose(); $font.Dispose(); $whiteBrush.Dispose(); $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
  Write-Host "Generated $path (${width}x${height})"
}

New-AttoTile 'StoreLogo.png' 50 50
New-AttoTile 'Square44x44Logo.png' 44 44
New-AttoTile 'Square150x150Logo.png' 150 150
New-AttoTile 'Wide310x150Logo.png' 310 150
New-AttoTile 'LargeTile.png' 310 310
New-AttoTile 'SmallTile.png' 71 71
New-AttoTile 'SplashScreen.png' 620 300
