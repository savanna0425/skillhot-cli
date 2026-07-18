import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadCatalog, loadCatalogWithMetadata, loadLiveCatalogWithMetadata, refreshCatalog } from '../src/index.js'

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

test('loads the live SkillHot skills.json shape as the discovery catalog', async () => {
  const publicCatalogJson = JSON.stringify({
    meta: { generatedAt: '2026-07-17T03:43:25.915Z' },
    skills: [{
      id: 1136590548,
      fullName: 'affaan-m/ECC',
      name: 'ECC',
      url: 'https://github.com/affaan-m/ECC',
      readmeUrl: 'https://github.com/affaan-m/ECC#readme',
      summary: 'ECC：面向 Claude Code、Codex 等编程 Agent 的性能优化与工程方法系统。',
      projectProfile: { plainIntro: 'ECC：侧边栏同款项目简介。' },
      description: 'The agent harness performance optimization system.',
      category: '编程开发',
      scenarios: ['软件开发', '代码质量'],
      platforms: ['Claude', 'Codex'],
      sourceTopics: ['codex-skill'],
      repoTopics: ['agent-skills', 'workflow'],
      discoveredBy: ['GitHub 搜索'],
      license: 'MIT',
      activity: '本周活跃',
      installCommand: 'git clone https://github.com/affaan-m/ECC.git',
      language: 'JavaScript',
      stars: 230403,
      score: 166.7,
      pushedAt: '2026-07-14T01:31:12Z',
      skillCount: 278,
      detailPath: 'data/details/affaan__m__ecc.json',
      media: { socialPreview: 'https://opengraph.githubassets.com/skillhot/affaan-m/ECC', videoUrl: '' },
      catalogStatus: 'active'
    }]
  })

  const result = await loadLiveCatalogWithMetadata({
    url: 'https://skillhot.example.test/data/skills.json',
    fetchImpl: async () => new Response(publicCatalogJson)
  })

  assert.equal(result.metadata.source, 'live')
  assert.equal(result.metadata.url, 'https://skillhot.example.test/data/skills.json')
  assert.equal(result.catalog.skills[0].fullName, 'affaan-m/ECC')
  assert.equal(result.catalog.skills[0].summary, 'ECC：侧边栏同款项目简介。')
  assert.equal(result.catalog.skills[0].detailPath, 'data/details/affaan__m__ecc.json')
  assert.equal(result.catalog.skills[0].stars, 230403)
  assert.deepEqual(result.catalog.skills[0].keywords, ['codex-skill', 'agent-skills', 'workflow', 'GitHub 搜索'])
})

test('derives the conventional detailPath while older live indexes are being refreshed', async () => {
  const publicCatalogJson = JSON.stringify({
    meta: { generatedAt: '2026-07-17T03:43:25.915Z' },
    skills: [{
      id: 1073224795,
      fullName: 'obra/superpowers',
      name: 'superpowers',
      url: 'https://github.com/obra/superpowers',
      summary: '一套面向智能体的软件开发方法与技能框架',
      category: '编程开发',
      scenarios: ['规范化 Agent 工作流'],
      platforms: ['Claude', 'Codex'],
      license: 'MIT',
      activity: '本周活跃',
      catalogStatus: 'active'
    }]
  })

  const result = await loadLiveCatalogWithMetadata({
    url: 'https://skillhot.example.test/data/skills.json',
    fetchImpl: async () => new Response(publicCatalogJson)
  })

  assert.equal(result.catalog.skills[0].detailPath, 'data/details/obra__superpowers.json')
})

test('does not fall back when the live SkillHot catalog is unavailable', async () => {
  await assert.rejects(() => loadLiveCatalogWithMetadata({
    url: 'https://skillhot.example.test/data/skills.json',
    fetchImpl: async () => new Response('unavailable', { status: 503 })
  }), { code: 'LIVE_CATALOG_UNAVAILABLE' })
})
