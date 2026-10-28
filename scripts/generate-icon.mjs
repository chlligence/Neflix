import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = resolve(root, 'build')
mkdirSync(buildDir, { recursive: true })

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function roundedRectCoverage(x, y, size, inset, radius) {
  const min = inset
  const max = size - inset
  if (x < min || x > max || y < min || y > max) return 0
  const cx = clamp(x, min + radius, max - radius)
  const cy = clamp(y, min + radius, max - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius ? 1 : 0
}

function triangleCoverage(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by)
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive) ? 1 : 0
}

function colorAt(x, y, size) {
  const nx = x / size
  const ny = y / size
  const warmth = clamp(1 - Math.hypot(nx - 0.25, ny - 0.2) * 1.5, 0, 1)
  const diagonal = clamp((nx + ny) / 2, 0, 1)

  let r = 232 - diagonal * 54 + warmth * 26
  let g = 85 - diagonal * 40 + warmth * 20
  let b = 68 - diagonal * 35 + warmth * 18

  if (ny > 0.66) {
    const shade = (ny - 0.66) / 0.34
    r *= 1 - shade * 0.26
    g *= 1 - shade * 0.32
    b *= 1 - shade * 0.28
  }

  return [r, g, b]
}

function render(size, scale = 2) {
  const supersampled = size * scale
  const pixels = new Uint8ClampedArray(size * size * 4)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let alpha = 0
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const x = px * scale + sx + 0.5
          const y = py * scale + sy + 0.5
          const coverage = roundedRectCoverage(
            x,
            y,
            supersampled,
            supersampled * 0.02,
            supersampled * 0.215
          )
          if (!coverage) continue

          const base = colorAt(x, y, supersampled)
          const border = roundedRectCoverage(
            x,
            y,
            supersampled,
            supersampled * 0.048,
            supersampled * 0.18
          )
          const borderLight = 1 - border

          const triangle = triangleCoverage(
            x,
            y,
            supersampled * 0.395,
            supersampled * 0.29,
            supersampled * 0.395,
            supersampled * 0.71,
            supersampled * 0.715,
            supersampled * 0.5
          )
          const highlight = triangleCoverage(
            x,
            y,
            supersampled * 0.4,
            supersampled * 0.32,
            supersampled * 0.4,
            supersampled * 0.68,
            supersampled * 0.66,
            supersampled * 0.5
          )

          let localR = base[0] + borderLight * 22
          let localG = base[1] + borderLight * 18
          let localB = base[2] + borderLight * 18
          if (triangle) {
            localR = 255
            localG = 248 - (1 - highlight) * 7
            localB = 239 - (1 - highlight) * 10
          }

          alpha += coverage
          r += localR * coverage
          g += localG * coverage
          b += localB * coverage
        }
      }

      const samples = scale * scale
      const index = (py * size + px) * 4
      if (alpha > 0) {
        pixels[index] = Math.round(r / alpha)
        pixels[index + 1] = Math.round(g / alpha)
        pixels[index + 2] = Math.round(b / alpha)
        pixels[index + 3] = Math.round((alpha / samples) * 255)
      }
    }
  }

  return pixels
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * stride + 1)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function encodeIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)

  return Buffer.concat([header, entry, png])
}

const png1024 = encodePng(1024, render(1024))
writeFileSync(resolve(buildDir, 'icon.png'), png1024)

const png256 = encodePng(256, render(256, 3))
writeFileSync(resolve(buildDir, 'icon.ico'), encodeIco(png256, 256))

console.log(`Generated build/icon.png (${png1024.length} bytes) and build/icon.ico (${png256.length} bytes)`)