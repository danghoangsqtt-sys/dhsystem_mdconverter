[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptPath = $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        throw 'Cannot resolve script path.'
    }
    $ProjectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$publicDir = Join-Path $resolvedProjectRoot 'frontend\public'
$iconDir = Join-Path $resolvedProjectRoot 'frontend\build\icons'

function Assert-ProjectPath {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $fullPath = [IO.Path]::GetFullPath($Path)
    $rootPrefix = $resolvedProjectRoot.TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes project root: $fullPath"
    }
    return $fullPath
}

$source = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class TiniIconTools
{
    private static bool IsExteriorBlack(byte[] pixels, int offset)
    {
        int blue = pixels[offset];
        int green = pixels[offset + 1];
        int red = pixels[offset + 2];
        int maximum = Math.Max(red, Math.Max(green, blue));
        int minimum = Math.Min(red, Math.Min(green, blue));
        return maximum <= 48 && maximum - minimum <= 24;
    }

    public static void RemoveConnectedBlackBackground(string sourcePath, string destinationPath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var output = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.DrawImageUnscaled(source, 0, 0);
            }

            var rectangle = new Rectangle(0, 0, output.Width, output.Height);
            var data = output.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                var pixels = new byte[stride * output.Height];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);

                int width = output.Width;
                int height = output.Height;
                var visited = new bool[width * height];
                var queue = new Queue<int>();

                Action<int, int> enqueue = (x, y) =>
                {
                    int index = y * width + x;
                    if (visited[index]) return;
                    int offset = y * stride + x * 4;
                    if (!IsExteriorBlack(pixels, offset)) return;
                    visited[index] = true;
                    queue.Enqueue(index);
                };

                for (int x = 0; x < width; x++)
                {
                    enqueue(x, 0);
                    enqueue(x, height - 1);
                }
                for (int y = 1; y < height - 1; y++)
                {
                    enqueue(0, y);
                    enqueue(width - 1, y);
                }

                while (queue.Count > 0)
                {
                    int index = queue.Dequeue();
                    int x = index % width;
                    int y = index / width;
                    int offset = y * stride + x * 4;
                    pixels[offset + 3] = 0;

                    if (x > 0) enqueue(x - 1, y);
                    if (x + 1 < width) enqueue(x + 1, y);
                    if (y > 0) enqueue(x, y - 1);
                    if (y + 1 < height) enqueue(x, y + 1);
                }

                Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
            }
            finally
            {
                output.UnlockBits(data);
            }

            output.Save(destinationPath, ImageFormat.Png);
        }
    }

    private static byte[] RenderPng(Bitmap source, int size)
    {
        using (var resized = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(resized))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.DrawImage(source, new Rectangle(0, 0, size, size));
            }

            using (var stream = new MemoryStream())
            {
                resized.Save(stream, ImageFormat.Png);
                return stream.ToArray();
            }
        }
    }

    public static void WriteMultiSizeIco(string sourcePath, string destinationPath, int[] sizes)
    {
        using (var source = new Bitmap(sourcePath))
        {
            var images = new List<byte[]>();
            foreach (int size in sizes) images.Add(RenderPng(source, size));

            using (var file = File.Create(destinationPath))
            using (var writer = new BinaryWriter(file))
            {
                writer.Write((ushort)0);
                writer.Write((ushort)1);
                writer.Write((ushort)images.Count);

                int offset = 6 + images.Count * 16;
                for (int index = 0; index < images.Count; index++)
                {
                    int size = sizes[index];
                    writer.Write((byte)(size == 256 ? 0 : size));
                    writer.Write((byte)(size == 256 ? 0 : size));
                    writer.Write((byte)0);
                    writer.Write((byte)0);
                    writer.Write((ushort)1);
                    writer.Write((ushort)32);
                    writer.Write((uint)images[index].Length);
                    writer.Write((uint)offset);
                    offset += images[index].Length;
                }

                foreach (byte[] image in images) writer.Write(image);
            }
        }
    }

    public static int CornerAlpha(string sourcePath)
    {
        using (var bitmap = new Bitmap(sourcePath))
        {
            return bitmap.GetPixel(0, 0).A;
        }
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies @('System.Drawing')

$markPng = Assert-ProjectPath (Join-Path $publicDir 'mark-tini.png')
$ocrPng = Assert-ProjectPath (Join-Path $publicDir 'tini-ocr.png')
$suitePng = Assert-ProjectPath (Join-Path $publicDir 'tini-suite.png')

foreach ($asset in @($markPng, $ocrPng, $suitePng)) {
    if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) {
        throw "Missing brand asset: $asset"
    }
    $item = Get-Item -LiteralPath $asset -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Brand asset is a reparse point: $asset"
    }
}

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

foreach ($asset in @($markPng, $ocrPng)) {
    $temporary = Assert-ProjectPath ($asset + '.alpha.tmp.png')
    [TiniIconTools]::RemoveConnectedBlackBackground($asset, $temporary)
    if ([TiniIconTools]::CornerAlpha($temporary) -ne 0) {
        throw "Transparency validation failed: $temporary"
    }
    Move-Item -LiteralPath $temporary -Destination $asset -Force
}

$sizes = [int[]]@(16, 24, 32, 48, 64, 128, 256)
$icoTargets = @(
    @{ Source = $suitePng; Target = (Assert-ProjectPath (Join-Path $iconDir 'tini-suite.ico')) },
    @{ Source = $ocrPng; Target = (Assert-ProjectPath (Join-Path $iconDir 'tini-ocr.ico')) },
    @{ Source = $markPng; Target = (Assert-ProjectPath (Join-Path $iconDir 'mark-tini.ico')) }
)

foreach ($target in $icoTargets) {
    [TiniIconTools]::WriteMultiSizeIco($target.Source, $target.Target, $sizes)
}

Write-Output 'Prepared Tini Suite brand icons:'
foreach ($asset in @($markPng, $ocrPng, $suitePng) + @($icoTargets.Target)) {
    $item = Get-Item -LiteralPath $asset
    [pscustomobject]@{
        Path = $item.FullName
        Length = $item.Length
        Sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
    }
}
