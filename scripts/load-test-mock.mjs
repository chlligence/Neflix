#!/usr/bin/env node
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8899'
const concurrency = Number(process.argv[3] ?? '200')
const segmentPath = '/media/test/hls/2/segment_00000.ts'

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index] ?? 0
}

async function runRound(label, requestFactory) {
  const latencies = []
  const statuses = new Map()
  const errors = []
  const startedAt = performance.now()

  await Promise.all(
    Array.from({ length: concurrency }, async (_, index) => {
      const start = performance.now()
      try {
        const response = await requestFactory(index)
        await response.arrayBuffer()
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1)
        if (!response.ok) errors.push(`HTTP ${response.status}`)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      } finally {
        latencies.push(performance.now() - start)
      }
    })
  )

  const elapsed = performance.now() - startedAt
  console.log(
    JSON.stringify(
      {
        round: label,
        concurrency,
        elapsedMs: Math.round(elapsed),
        requestsPerSecond: Math.round((concurrency / elapsed) * 1000),
        statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0])),
        latencyMs: {
          p50: Math.round(percentile(latencies, 0.5)),
          p95: Math.round(percentile(latencies, 0.95)),
          max: Math.round(Math.max(...latencies))
        },
        errors: errors.slice(0, 5)
      },
      null,
      2
    )
  )
}

for (let index = 0; index < 5; index += 1) {
  await fetch(`${baseUrl}/api/videos?page=1&pageSize=2`).then((response) => response.arrayBuffer())
}

const health = await fetch(`${baseUrl}/health`)
if (!health.ok) {
  console.error(`Mock CDN is not healthy: ${health.status}`)
  process.exit(1)
}

await runRound('manifest-api', (index) => {
  const page = (index % 4) + 1
  return fetch(`${baseUrl}/api/videos?page=${page}&pageSize=2`)
})

await runRound('range-segment', () =>
  fetch(`${baseUrl}${segmentPath}`, {
    headers: { Range: 'bytes=0-65535' }
  })
)