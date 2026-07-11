import assert from 'node:assert/strict'
import test from 'node:test'
import { runCli } from '../dist/main.js'

test('find JSON returns a single valid document with recommendation reasons', async () => {
  const result = await runCli(['find', '帮我写长文', '--format', 'json'])

  assert.equal(result.exitCode, 0)
  assert.ok(JSON.parse(result.stdout).recommendations[0].reasons.length)
  assert.equal(result.stderr, '')
})

test('unknown show reference exits nonzero and suggests find', async () => {
  const result = await runCli(['show', 'missing/skill'])

  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /SKILL_NOT_FOUND/)
  assert.match(result.stderr, /find/)
})

test('rejects a value-taking flag when its value is omitted', async () => {
  const result = await runCli(['find', '帮我写长文', '--format'])

  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /INVALID_ARGUMENT/)
  assert.equal(result.stdout, '')
})

test('prompt install preserves command provenance and requires user approval', async () => {
  const result = await runCli(['prompt', 'install', '1073224795', '--agent', 'codex', '--format', 'json'])
  const prompt = JSON.parse(result.stdout)

  assert.equal(result.exitCode, 0)
  assert.equal(prompt.commandSource, 'catalog-extracted')
  assert.equal(prompt.skill.sourceUrl, 'https://github.com/obra/superpowers')
  assert.match(prompt.markdown, /请先阅读上游 README/)
  assert.match(prompt.markdown, /最终用户明确批准前/)
  assert.equal(result.stderr, '')
})

test('skill install emits only user-owned copy instructions', async () => {
  const result = await runCli(['skill', 'install', '--agent', 'codex', '--format', 'json'])
  const instructions = JSON.parse(result.stdout)

  assert.equal(result.exitCode, 0)
  assert.equal(instructions.destination, '~/.codex/skills/skillhot-discovery/SKILL.md')
  assert.match(instructions.copyCommand, /^mkdir -p /)
  assert.match(instructions.notice, /No files were written/)
  assert.equal(result.stderr, '')
})
