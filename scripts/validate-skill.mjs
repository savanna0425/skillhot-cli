import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const requiredBodyRules = [
  'skillhot find',
  'skillhot show',
  'skillhot prompt install',
  'https://skillhot.savs-ai.com/data/skills.json',
  'do not recommend local installed skills',
]

export function validateSkillText(skillText) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(skillText)
  if (!match) throw new Error('SKILL.md must contain YAML frontmatter and a body')

  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-z_]+):\s*(.+)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  )
  const { name, description } = fields

  if (!name || !namePattern.test(name)) {
    throw new Error('name must be lowercase and hyphenated')
  }
  if (!description?.startsWith('Use when') || /\bskillhot\b|\brun\b|\bexecute\b/i.test(description)) {
    throw new Error('description must begin with "Use when" and contain triggers only')
  }

  const body = match[2].toLowerCase()
  for (const rule of requiredBodyRules) {
    if (!body.includes(rule)) throw new Error(`body must require ${rule}`)
  }
  if (!body.includes('explicit user approval before command execution')) {
    throw new Error('body must require explicit user approval before command execution')
  }
}

async function main() {
  const [skillPath] = process.argv.slice(2)
  if (!skillPath) throw new Error('Usage: node scripts/validate-skill.mjs <SKILL.md>')
  validateSkillText(await readFile(skillPath, 'utf8'))
  console.log(`${skillPath}: valid`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
