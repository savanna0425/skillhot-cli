import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFile = promisify(execFileCallback)
const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

async function packageVersion(directory) {
  return JSON.parse(await readFile(join(projectRoot, directory, 'package.json'), 'utf8')).version
}

async function main() {
  const packageDirectory = await mkdtemp(join(tmpdir(), 'skillhot-packages-'))
  const verificationDirectory = await mkdtemp(join(tmpdir(), 'skillhot-package-smoke-'))

  try {
    await execFile(packageManager, ['--filter', '@skillhot/core', 'pack', '--pack-destination', packageDirectory], { cwd: projectRoot })
    await execFile(packageManager, ['--filter', '@skillhot/cli', 'pack', '--pack-destination', packageDirectory], { cwd: projectRoot })

    const [coreVersion, cliVersion] = await Promise.all([packageVersion('packages/core'), packageVersion('packages/cli')])
    const coreTarball = join(packageDirectory, `skillhot-core-${coreVersion}.tgz`)
    const cliTarball = join(packageDirectory, `skillhot-cli-${cliVersion}.tgz`)

    await execFile(npm, ['init', '--yes'], { cwd: verificationDirectory })
    await execFile(npm, ['install', '--ignore-scripts', coreTarball], { cwd: verificationDirectory })
    await execFile(npm, ['install', '--ignore-scripts', cliTarball], { cwd: verificationDirectory })
    const { stdout } = await execFile(npx, ['--no-install', 'skillhot', 'find', '写长文', '--format', 'json'], { cwd: verificationDirectory })
    const result = JSON.parse(stdout)

    if (!Array.isArray(result.recommendations) || result.recommendations.length === 0) {
      throw new Error('Packed CLI smoke test returned no recommendations.')
    }
    console.log(`Packed CLI smoke test passed (${result.recommendations.length} recommendations).`)
  } finally {
    await Promise.all([
      rm(packageDirectory, { recursive: true, force: true }),
      rm(verificationDirectory, { recursive: true, force: true })
    ])
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
