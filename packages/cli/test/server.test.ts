import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createDiscoveryEngine, parseCatalog, type CatalogMetadata } from '@skillhot/core'
import { createServer, validateHost } from '../dist/server.js'

const catalog = parseCatalog({
  version: 1,
  generatedAt: '2026-07-11T00:00:00.000Z',
  skills: [
    {
      id: 'writer/longform', fullName: 'writer/longform', name: 'longform',
      url: 'https://example.test/writer/longform', sourceUrl: 'https://example.test/writer/longform',
      summary: 'Write long-form Chinese articles.', category: 'writing', scenarios: ['写长文'],
      platforms: ['codex'], license: 'MIT', activity: 'active', catalogStatus: 'active',
      installCommandSource: 'unavailable'
    },
    {
      id: 'writer/editor', fullName: 'writer/editor', name: 'editor',
      url: 'https://example.test/writer/editor', sourceUrl: 'https://example.test/writer/editor',
      summary: 'Edit long-form articles.', category: 'writing', scenarios: ['长文编辑'],
      platforms: ['claude'], license: 'MIT', activity: 'active', catalogStatus: 'active',
      installCommandSource: 'unavailable'
    }
  ]
})

const metadata: CatalogMetadata = { source: 'bundled', generatedAt: catalog.generatedAt, count: catalog.skills.length }

async function startServer() {
  const server = createServer(createDiscoveryEngine(catalog), metadata)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const { server, baseUrl } = await startServer()
  try {
    await run(baseUrl)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('returns explained recommendations over HTTP', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/recommendations?q=%E5%86%99%E9%95%BF%E6%96%87&limit=2`)

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(body.data.recommendations[0].reasons.length)
    assert.deepEqual(body.meta, metadata)
  })
})

test('serves each public API route with the documented envelope', async () => {
  await withServer(async (baseUrl) => {
    for (const [path, method, body] of [
      ['/health', 'GET', undefined],
      ['/v1/skills/writer%2Flongform', 'GET', undefined],
      ['/v1/skills/writer%2Flongform/alternatives?limit=1', 'GET', undefined],
      ['/v1/compare', 'POST', JSON.stringify({ refs: ['writer/longform', 'writer/editor'] })],
      ['/v1/agent-prompt', 'POST', JSON.stringify({ skill: 'writer/longform', agent: 'codex' })]
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, { method, body })
      assert.equal(response.status, 200, path)
      const payload = await response.json()
      assert.ok('data' in payload, path)
      if (path !== '/health') assert.deepEqual(payload.meta, metadata, path)
    }
  })
})

test('accepts a conventional unencoded owner/repository skill reference', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/skills/writer/longform`)

    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.id, 'writer/longform')
  })
})

test('rejects malformed JSON and a remote binding without explicit opt-in', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/compare`, { method: 'POST', body: '{' })

    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'INVALID_JSON')
  })
  assert.throws(() => validateHost('0.0.0.0', false), /explicit/)
})

test('rejects invalid requests with JSON errors, method Allow headers, and a 64 KiB body cap', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      [`${baseUrl}/v1/recommendations`, {}, 400, 'INVALID_ARGUMENT'],
      [`${baseUrl}/v1/recommendations?q=x&limit=0`, {}, 400, 'INVALID_ARGUMENT'],
      [`${baseUrl}/v1/compare`, { method: 'GET' }, 405, 'METHOD_NOT_ALLOWED'],
      [`${baseUrl}/missing`, {}, 404, 'NOT_FOUND'],
      [`${baseUrl}/v1/compare`, { method: 'POST', body: JSON.stringify({ refs: ['writer/longform', 'writer/editor'], ignored: 'x'.repeat(65 * 1024) }) }, 413, 'BODY_TOO_LARGE']
    ] as const

    for (const [url, init, status, code] of cases) {
      const response = await fetch(url, init)
      assert.equal(response.status, status, url)
      assert.equal((await response.json()).error.code, code, url)
      if (status === 405) assert.equal(response.headers.get('allow'), 'POST')
    }
  })
})
