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
  canvas: HTMLCanvasElement,
  data: WatermarkData
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = canvas.getContext('2d')
    if (!ctx || !canvas.width || !canvas.height) {
      reject(new Error('Foto kamera belum siap. Ambil ulang foto.'))
      return
    }

    // Siapkan teks watermark
    const formattedDate = data.timestamp.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }) + ' WIB'
    const coords = `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`
    const fontSize = Math.max(14, Math.round(canvas.width / 30))
    ctx.font = `${fontSize}px sans-serif`

    const padding = fontSize * 0.6
    const maxTextWidth = canvas.width - padding * 2
    const addressLines = wrapText(ctx, data.address, maxTextWidth)
    // Keep the face visible even when the address is unusually long.
    const visibleAddress = addressLines.slice(0, 3)
    if (addressLines.length > 3) visibleAddress[2] += '…'
    const allLines = [formattedDate, coords, ...visibleAddress]

    const lineHeight = fontSize * 1.3
    const boxHeight = allLines.length * lineHeight + padding * 2

    // Kotak semi-transparan di bagian bawah foto
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight)

    // Tulis teks putih di atas kotak
    ctx.fillStyle = '#ffffff'
    ctx.font = `${fontSize}px sans-serif`
    allLines.forEach((line, i) => {
      ctx.fillText(
        line,
        padding,
        canvas.height - boxHeight + padding + lineHeight * (i + 1) - lineHeight * 0.3
      )
    })

    // Encode only once, asynchronously, after adding the watermark.
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Gagal memproses foto. Ambil ulang foto.'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result) : reject(new Error('Gagal membaca foto.'))
      reader.onerror = () => reject(new Error('Gagal membaca foto.'))
      reader.readAsDataURL(blob)
    }, 'image/jpeg', 0.8)
  })
}
