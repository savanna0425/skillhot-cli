#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { Writable } from 'node:stream'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDiscoveryEngine, loadCatalog, refreshCatalog, SkillHotError } from '@skillhot/core'
import { print, type OutputFormat } from './format.js'

type FlagValue = string | true

interface ParsedArguments {
  flags: Record<string, FlagValue>
  positionals: string[]
}

export interface CliIo {
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  env?: NodeJS.ProcessEnv
}

export function parseArguments(argv: string[]): ParsedArguments {
  const flags: Record<string, FlagValue> = {}
  const positionals: string[] = []
  let positionalOnly = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (positionalOnly) {
      positionals.push(argument)
    } else if (argument === '--') {
      positionalOnly = true
    } else if (argument.startsWith('--')) {
      const [name, inlineValue] = argument.slice(2).split('=', 2)
      if (!name) throw new SkillHotError('INVALID_ARGUMENT', 'Flag names cannot be empty.')
      if (inlineValue !== undefined) {
        flags[name] = inlineValue
      } else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith('--')) {
        flags[name] = argv[index + 1]
        index += 1
      } else {
        flags[name] = true
      }
    } else {
      positionals.push(argument)
    }
  }

  return { flags, positionals }
}

export function bundledCatalogPath(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const packagedPath = join(moduleDirectory, '..', 'data', 'catalog.json')
  if (existsSync(packagedPath)) return packagedPath
  return join(moduleDirectory, '..', '..', 'data', 'catalog.json')
}

export function defaultCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'skillhot', 'catalog.json')
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new SkillHotError('INVALID_ARGUMENT', `Missing ${label}.`)
  return value
}

function numberFlag(value: FlagValue | undefined, fallback: number): number {
  if (value === true) throw new SkillHotError('INVALID_ARGUMENT', 'limit requires a value.')
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new SkillHotError('INVALID_ARGUMENT', 'limit must be an integer from 1 to 20.')
  }
  return parsed
}

function stringFlag(value: FlagValue | undefined, fallback: string, name = 'flag'): string {
  if (value === true) throw new SkillHotError('INVALID_ARGUMENT', `${name} requires a value.`)
  return typeof value === 'string' ? value : fallback
}

function outputFormat(value: FlagValue | undefined): OutputFormat {
  const format = stringFlag(value, 'text', 'format')
  if (format === 'text' || format === 'markdown' || format === 'json') return format
  throw new SkillHotError('INVALID_ARGUMENT', 'format must be text, markdown, or json.')
}

function platforms(value: FlagValue | undefined): string[] | undefined {
  const platform = typeof value === 'string' ? value : undefined
  return platform === undefined ? undefined : platform.split(',').map((item) => item.trim()).filter(Boolean)
}

function skillInstallInstructions(agent: string): { agent: string; destination: string; copyCommand: string; notice: string } {
  if (agent !== 'codex') throw new SkillHotError('INVALID_ARGUMENT', 'skill install currently supports --agent codex only.')
  const destination = '~/.codex/skills/skillhot-discovery/SKILL.md'
  return {
    agent,
    destination,
    copyCommand: 'mkdir -p "$HOME/.codex/skills/skillhot-discovery" && cp /path/to/skillhot-discovery/SKILL.md "$HOME/.codex/skills/skillhot-discovery/SKILL.md"',
    notice: 'No files were written. Review the source and run the copy command yourself only when you approve it.'
  }
}

async function runOperationalCommand(command: string | undefined, positionals: string[], flags: Record<string, FlagValue>, env: NodeJS.ProcessEnv) {
  if (command === 'update') {
    return refreshCatalog({
      url: required(typeof flags.url === 'string' ? flags.url : undefined, 'normalized catalog URL (--url)'),
      cachePath: defaultCachePath(env)
    })
  }
  if (command === 'skill' && positionals[0] === 'install') {
    return skillInstallInstructions(stringFlag(flags.agent, 'codex', 'agent'))
  }
  if (command === 'serve') {
    throw new SkillHotError('NOT_IMPLEMENTED', 'The HTTP server is not available in this CLI build.')
  }
  throw new SkillHotError('INVALID_COMMAND', `Unknown command ${command ?? '(missing)'}. Try skillhot find "<need>".`)
}

function diagnostic(error: unknown): string {
  if (error instanceof SkillHotError) {
    const suggestion = error.code === 'SKILL_NOT_FOUND' ? ' Try skillhot find "<need>".' : ''
    return `${error.code}: ${error.message}${suggestion}\n`
  }
  const message = error instanceof Error ? error.message : String(error)
  return `UNEXPECTED_ERROR: ${message}\n`
}

export async function main(argv: string[], io: CliIo = process): Promise<number> {
  try {
    const [command, ...rest] = argv
    const { flags, positionals } = parseArguments(rest)
    const env = io.env ?? process.env
    const engine = createDiscoveryEngine(await loadCatalog({ bundledPath: bundledCatalogPath(), cachePath: defaultCachePath(env) }))
    const value = command === 'find'
      ? engine.find({
        query: required(positionals.join(' '), 'query'),
        limit: numberFlag(flags.limit, 5),
        category: typeof flags.category === 'string' ? flags.category : undefined,
        platforms: platforms(flags.platform),
        license: typeof flags.license === 'string' ? flags.license : undefined,
        catalogStatus: flags.status === 'active' || flags.status === 'archived' ? flags.status : undefined
      })
      : command === 'show'
        ? engine.show(required(positionals[0], 'skill reference'))
        : command === 'compare'
          ? engine.compare(positionals)
          : command === 'alternatives'
            ? engine.alternatives(required(positionals[0], 'skill reference'), numberFlag(flags.limit, 5))
            : command === 'prompt' && positionals[0] === 'install'
              ? engine.installPrompt({ skill: required(positionals[1], 'skill reference'), agent: stringFlag(flags.agent, 'generic', 'agent') })
              : await runOperationalCommand(command, positionals, flags, env)
    print(value, outputFormat(flags.format), io.stdout)
    return 0
  } catch (error) {
    io.stderr.write(diagnostic(error))
    return 1
  }
}

export async function runCli(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] }
  const stream = (target: Buffer[]): Writable => new Writable({
    write(chunk, _encoding, callback) {
      target.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    }
  })
  const exitCode = await main(argv, {
    stdout: stream(chunks.stdout),
    stderr: stream(chunks.stderr),
    env: { ...process.env, XDG_CACHE_HOME: join(tmpdir(), 'skillhot-cli-test-cache') }
  })
  return { exitCode, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode
  })
}
