export type WatermarkData = {
  timestamp: Date
  latitude: number
  longitude: number
  address: string
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

export function applyWatermark(
  imageDataUrl: string,
  data: WatermarkData
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Resize ke lebar maksimal 800px, jaga aspect ratio, biar ukuran file kecil
      const maxWidth = 800
      const scale = Math.min(1, maxWidth / img.width)
      const targetWidth = Math.round(img.width * scale)
      const targetHeight = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas tidak didukung'))
        return
      }

      // 1. Gambar foto asli (sudah di-resize)
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

      // 2. Siapkan teks watermark
      const formattedDate = data.timestamp.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      })
      const coords = `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`
      const fontSize = Math.max(14, Math.round(img.width / 30))
      ctx.font = `${fontSize}px sans-serif`

      const padding = fontSize * 0.6
      const maxTextWidth = img.width - padding * 2
      const addressLines = wrapText(ctx, data.address, maxTextWidth)
      const allLines = [formattedDate, coords, ...addressLines]

      const lineHeight = fontSize * 1.3
      const boxHeight = allLines.length * lineHeight + padding * 2

      // 3. Kotak semi-transparan di bawah (pengganti img.BlendMode.alpha versi Flutter)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(0, img.height - boxHeight, img.width, boxHeight)

      // 4. Tulis teks putih di atas kotak
      ctx.fillStyle = '#ffffff'
      ctx.font = `${fontSize}px sans-serif`
      allLines.forEach((line, i) => {
        ctx.fillText(
          line,
          padding,
          img.height - boxHeight + padding + lineHeight * (i + 1) - lineHeight * 0.3
        )
      })

      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => reject(new Error('Gagal load gambar untuk watermark'))
    img.src = imageDataUrl
  })
}