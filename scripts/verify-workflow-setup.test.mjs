import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const workflows = ['.github/workflows/ci.yml', '.github/workflows/release.yml']

test('installs pnpm before setup-node enables the pnpm cache', async () => {
  for (const workflow of workflows) {
    const source = await readFile(new URL(`../${workflow}`, import.meta.url), 'utf8')
    const lines = source.split('\n')
    const nodeSetupLines = lines.reduce((indexes, line, index) => {
      if (line.includes('uses: actions/setup-node@')) indexes.push(index)
      return indexes
    }, [])

    assert.ok(nodeSetupLines.length > 0, `${workflow} must install Node`)
    for (const nodeSetupLine of nodeSetupLines) {
      const precedingSteps = lines.slice(Math.max(0, nodeSetupLine - 4), nodeSetupLine).join('\n')
      assert.match(precedingSteps, /uses: pnpm\/action-setup@/, `${workflow} must install pnpm before each setup-node cache step`)
    }
  }
})
