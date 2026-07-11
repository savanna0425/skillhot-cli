import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const execFile = promisify(execFileCallback)
const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const buildCatalogPath = join(projectRoot, 'scripts', 'build-catalog.mjs')
const outputPath = join(projectRoot, 'packages', 'cli', 'data', 'catalog.json')

test('rejects a source record without a usable ID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skillhot-build-catalog-'))
  const sourcePath = join(directory, 'invalid-source.json')
  const originalSnapshot = await readFile(outputPath)
  await writeFile(sourcePath, JSON.stringify({
    meta: { generatedAt: '2026-07-11T00:00:00Z' },
    skills: [{
      fullName: 'example/catalog', name: 'catalog', url: 'https://example.test/catalog',
      summary: 'A valid record with an invalid source ID.', category: 'Testing', scenarios: ['Tests'], platforms: ['Codex'],
      license: 'MIT', activity: 'active', catalogStatus: 'active'
    }]
  }))

  try {
    await assert.rejects(() => execFile(process.execPath, [buildCatalogPath], {
      cwd: projectRoot,
      env: { ...process.env, SKILLHOT_SOURCE_CATALOG: sourcePath }
    }))
  } finally {
    await writeFile(outputPath, originalSnapshot)
    await rm(directory, { recursive: true, force: true })
  }
})

test('preserves upstream usage guidance in the public catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skillhot-build-catalog-'))
  const sourcePath = join(directory, 'usage-source.json')
  const originalSnapshot = await readFile(outputPath)
  await writeFile(sourcePath, JSON.stringify({
    meta: { generatedAt: '2026-07-11T00:00:00Z' },
    skills: [{
      id: 1, fullName: 'example/usage', name: 'usage', url: 'https://example.test/usage',
      summary: 'A record with user-facing usage guidance.', category: 'Testing', scenarios: ['Tests'], platforms: ['Codex'],
      howToUse: 'Read the upstream README, install the Skill, then run a small task.',
      license: 'MIT', activity: 'active', catalogStatus: 'active'
    }]
  }))

  try {
    await execFile(process.execPath, [buildCatalogPath], {
      cwd: projectRoot,
      env: { ...process.env, SKILLHOT_SOURCE_CATALOG: sourcePath }
    })
    const catalog = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(catalog.skills[0].howToUse, 'Read the upstream README, install the Skill, then run a small task.')
  } finally {
    await writeFile(outputPath, originalSnapshot)
    await rm(directory, { recursive: true, force: true })
  }
})
