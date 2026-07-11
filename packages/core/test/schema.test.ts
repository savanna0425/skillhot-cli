import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCatalog, SkillHotError } from '../src/index.js'

test('accepts a public catalog record and preserves command provenance', () => {
  const catalog = parseCatalog({ version: 1, generatedAt: '2026-07-11T00:00:00Z', skills: [{
    id: 'obra/superpowers', fullName: 'obra/superpowers', name: 'superpowers',
    url: 'https://github.com/obra/superpowers', sourceUrl: 'https://github.com/obra/superpowers#readme',
    summary: '工程工作流', category: '编程开发', scenarios: ['复杂软件开发'], platforms: ['Codex'],
    license: 'MIT', activity: '本周活跃', catalogStatus: 'active', installCommand: 'git clone https://github.com/obra/superpowers.git',
    installCommandSource: 'catalog-extracted'
  }] })
  assert.equal(catalog.skills[0].installCommandSource, 'catalog-extracted')
})

test('rejects a record without an upstream source URL', () => {
  assert.throws(() => parseCatalog({ version: 1, generatedAt: 'x', skills: [{}] }), SkillHotError)
})

test('rejects malformed catalog values with a stable error', () => {
  const invalidCatalogs = [
    null,
    { version: 1, skills: [{ id: 'example/skill', fullName: 'example/skill', sourceUrl: 'https://example.com' }] },
    { version: 1, generatedAt: '2026-07-11T00:00:00Z', skills: [{
      id: 'example/skill', fullName: 'example/skill', name: 'skill', url: 'https://example.com', sourceUrl: 'https://example.com/source',
      summary: 'Example', category: 'Coding', scenarios: [], platforms: [], license: 'MIT', activity: 'active', catalogStatus: 'active',
      installCommandSource: 'unknown'
    }] }
  ]

  for (const catalog of invalidCatalogs) {
    assert.throws(() => parseCatalog(catalog), SkillHotError)
  }
})
