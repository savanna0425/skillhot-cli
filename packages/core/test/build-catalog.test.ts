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
