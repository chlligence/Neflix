#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const port = Number(argValue('--port', '8899'))
const rootDir = resolve(argValue('--root', '.tmp/local-cdn'))
const catalogPath = resolve(argValue('--catalog', 'examples/local-acceptance-catalog.json'))
const coverDir = resolve('src/renderer/public/covers')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Origin, Accept, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
  'Timing-Allow-Origin': '*'
}

const MIME_TYPES = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8'
}

function baseHeaders(contentType) {
  return {
    ...CORS_HEADERS,
    'Content-Type': contentType ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Mock-CDN': 'neflix-local-acceptance'
  }
}

function sendJson(response, status, body) {
  const data = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    ...baseHeaders('application/json; charset=utf-8'),
    'Content-Length': data.length
  })
  response.end(data)
}

function parseRange(value, size) {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return null
  const startText = match[1]
  const endText = match[2]
  let start
  let end
  if (startText === '') {
    const suffixLength = Number(endText)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText === '' ? size - 1 : Number(endText)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { invalid: true }
  }
  return { start, end: Math.min(end, size - 1) }
}

function serveFile(request, response, filePath, contentType) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(response, 404, { error: 'not_found', path: filePath })
    return
  }

  const stats = statSync(filePath)
  const range = parseRange(request.headers.range, stats.size)
  if (range?.invalid) {
    response.writeHead(416, {
      ...baseHeaders(contentType),
      'Content-Range': `bytes */${stats.size}`
    })
    response.end()
    return
  }

  const headers = baseHeaders(contentType)
  if (range) {
    const length = range.end - range.start + 1
    response.writeHead(206, {
      ...headers,
      'Content-Length': length,
      'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(response)
    return
  }

  response.writeHead(200, {
    ...headers,
    'Content-Length': stats.size
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
}

function safeResolve(base, pathname) {
  const decoded = decodeURIComponent(pathname)
  const target = resolve(base, `.${decoded}`)
  if (target !== base && !target.startsWith(`${base}${sep}`)) return null
  return target
}

function handleManifestApi(request, response, url) {
  let items
  try {
    items = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (error) {
    sendJson(response, 500, { error: 'catalog_unreadable', message: String(error) })
    return
  }

  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') ?? '2')))
  const start = (page - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  sendJson(response, 200, {
    page,
    pageSize,
    total: items.length,
    items: pageItems
  })
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`)

  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS)
    response.end()
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'method_not_allowed' })
    return
  }

  if (url.pathname === '/api/videos') {
    handleManifestApi(request, response, url)
    return
  }

  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (url.pathname === '/media/broken/master.m3u8') {
    const body = Buffer.from(
      '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\n'
    )
    response.writeHead(200, {
      ...baseHeaders(MIME_TYPES['.m3u8']),
      'Content-Length': body.length
    })
    response.end(request.method === 'HEAD' ? undefined : body)
    return
  }

  if (url.pathname === '/media/stall/master.m3u8') {
    const body = Buffer.from(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"\nmedia.m3u8\n'
    )
    response.writeHead(200, {
      ...baseHeaders(MIME_TYPES['.m3u8']),
      'Content-Length': body.length
    })
    response.end(request.method === 'HEAD' ? undefined : body)
    return
  }

  if (url.pathname === '/media/stall/media.m3u8') {
    const body = Buffer.from(
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:120\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\n../test/hls/2/segment_00000.ts\n#EXTINF:120,\nsegment0.ts\n#EXT-X-ENDLIST\n'
    )
    response.writeHead(200, {
      ...baseHeaders(MIME_TYPES['.m3u8']),
      'Content-Length': body.length
    })
    response.end(request.method === 'HEAD' ? undefined : body)
    return
  }

  if (url.pathname === '/media/stall/segment0.ts') {
    // 永远不结束响应，模拟 CDN 建立连接后迟迟不返回视频分片。
    response.writeHead(200, baseHeaders(MIME_TYPES['.ts']))
    response.flushHeaders()
    return
  }

  if (url.pathname.startsWith('/covers/')) {
    const path = safeResolve(coverDir, url.pathname.slice('/covers'.length))
    if (!path) {
      sendJson(response, 400, { error: 'bad_path' })
      return
    }
    serveFile(request, response, path, MIME_TYPES[extname(path).toLowerCase()])
    return
  }

  if (url.pathname.startsWith('/media/')) {
    const path = safeResolve(rootDir, url.pathname.slice('/media'.length))
    if (!path) {
      sendJson(response, 400, { error: 'bad_path' })
      return
    }
    serveFile(request, response, path, MIME_TYPES[extname(path).toLowerCase()])
    return
  }

  sendJson(response, 404, { error: 'not_found', path: url.pathname })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock manifest API: http://127.0.0.1:${port}/api/videos`)
  console.log(`Mock CDN root:     http://127.0.0.1:${port}/media/`)
  console.log(`Static root:       ${rootDir}`)
  console.log(`Catalog:           ${catalogPath}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}