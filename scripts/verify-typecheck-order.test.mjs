import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('root typecheck builds core declarations before checking the CLI', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )
  const typecheck = packageJson.scripts.typecheck
  const coreBuild = 'pnpm --filter @skillhot/core build'
  const cliTypecheck = 'pnpm --filter @skillhot/cli typecheck'

  assert.equal(typeof typecheck, 'string')
  assert.ok(typecheck.includes(coreBuild))
  assert.ok(typecheck.includes(cliTypecheck))
  assert.ok(
    typecheck.indexOf(coreBuild) < typecheck.indexOf(cliTypecheck),
    'root typecheck must build @skillhot/core before checking @skillhot/cli',
  )
})
