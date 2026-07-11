import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateSkillText } from './validate-skill.mjs'

assert.throws(
  () => validateSkillText('---\nname: Bad Name\ndescription: Does discovery\n---\n'),
  /name|description/,
)

const validSkill = `---
name: skillhot-discovery
description: Use when a coding agent needs to discover, compare, explain, or safely hand off installation of reusable Agent Skills from a vague user need.
---

# SkillHot Discovery

Run \`skillhot find "<need>" --format json\`, explain returned reasons, then run \`skillhot show <owner/repo>\` before stating facts. For installation, run \`skillhot prompt install <owner/repo> --agent <agent>\` and present its upstream link and command-source label. Require explicit user approval before command execution; never execute its command without it.
`

assert.doesNotThrow(() => validateSkillText(validSkill))
assert.throws(
  () => validateSkillText(validSkill.replace('skillhot show <owner/repo>', 'skillhot inspect <owner/repo>')),
  /skillhot show/,
)
assert.throws(
  () => validateSkillText(validSkill.replace('Require explicit user approval before command execution', 'Ask first')),
  /explicit user approval/,
)

const validatorSource = await readFile(new URL('./validate-skill.mjs', import.meta.url), 'utf8')
assert.match(validatorSource, /pathToFileURL/)
assert.doesNotMatch(validatorSource, /import\.meta\.main/)
