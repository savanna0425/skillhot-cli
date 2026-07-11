import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadCatalog, loadCatalogWithMetadata, refreshCatalog } from '../src/index.js'

const validCatalogJson = JSON.stringify({
  version: 1,
  generatedAt: '2026-07-11T00:00:00Z',
  skills: [{
    id: 'example/catalog', fullName: 'example/catalog', name: 'catalog',
    url: 'https://example.test/catalog', sourceUrl: 'https://example.test/catalog#readme',
    summary: 'A valid catalog record.', category: 'Testing', scenarios: ['Tests'], platforms: ['Codex'],
    license: 'MIT', activity: 'active', catalogStatus: 'active', installCommandSource: 'unavailable'
  }]
})

async function withPaths(run: (paths: { bundledPath: string; cachePath: string }) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'skillhot-store-'))
  try {
    const cachePath = join(directory, 'cache', 'catalog.json')
    await mkdir(join(directory, 'cache'), { recursive: true })
    await run({ bundledPath: join(directory, 'bundled.json'), cachePath })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('loads a valid cache before the bundled catalog', async () => {
  await withPaths(async ({ bundledPath, cachePath }) => {
    await writeFile(bundledPath, validCatalogJson.replace('2026-07-11', '2026-07-10'))
    await writeFile(cachePath, validCatalogJson)

    const catalog = await loadCatalog({ bundledPath, cachePath })

    assert.equal(catalog.generatedAt, '2026-07-11T00:00:00Z')
  })
})

test('falls back to the bundled catalog when the cache is invalid', async () => {
  await withPaths(async ({ bundledPath, cachePath }) => {
    await writeFile(bundledPath, validCatalogJson)
    await writeFile(cachePath, '{"skills":[]}')

    const catalog = await loadCatalog({ bundledPath, cachePath })

    assert.equal(catalog.generatedAt, '2026-07-11T00:00:00Z')
  })
})

test('reports the bundled source when an existing cache is invalid', async () => {
  await withPaths(async ({ bundledPath, cachePath }) => {
    await writeFile(bundledPath, validCatalogJson)
    await writeFile(cachePath, '{"skills":[]}')

    const result = await loadCatalogWithMetadata({ bundledPath, cachePath })

    assert.equal(result.metadata.source, 'bundled')
    assert.equal(result.metadata.generatedAt, '2026-07-11T00:00:00Z')
    assert.equal(result.metadata.count, 1)
  })
})

test('preserves a valid cached catalog when a refresh payload is invalid', async () => {
  await withPaths(async ({ cachePath }) => {
    await writeFile(cachePath, validCatalogJson)

    await assert.rejects(() => refreshCatalog({
      url: 'https://invalid.test/catalog.json',
      cachePath,
      fetchImpl: async () => new Response('{"skills":[]}')
    }))

    assert.equal(await readFile(cachePath, 'utf8'), validCatalogJson)
  })
})

test('preserves the cache when the request fails', async () => {
  await withPaths(async ({ cachePath }) => {
    await writeFile(cachePath, validCatalogJson)

    await assert.rejects(() => refreshCatalog({
      url: 'https://invalid.test/catalog.json',
      cachePath,
      fetchImpl: async () => new Response('unavailable', { status: 503 })
    }), { code: 'UPDATE_FAILED' })

    assert.equal(await readFile(cachePath, 'utf8'), validCatalogJson)
  })
})

test('records the refreshed catalog only after schema validation', async () => {
  await withPaths(async ({ cachePath }) => {
    const result = await refreshCatalog({
      url: 'https://valid.test/catalog.json',
      cachePath,
      fetchImpl: async () => new Response(validCatalogJson)
    })

    assert.deepEqual(result, { source: 'cache', generatedAt: '2026-07-11T00:00:00Z', count: 1 })
    assert.equal(await readFile(cachePath, 'utf8'), validCatalogJson)
  })
})
