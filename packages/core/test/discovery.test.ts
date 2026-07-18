import assert from 'node:assert/strict'
import test from 'node:test'
import { createDiscoveryEngine, createInstallPrompt, parseCatalog, SkillHotError } from '../src/index.js'

const catalog = parseCatalog({
  version: 1,
  generatedAt: '2026-07-11T00:00:00Z',
  skills: [
    {
      id: 'obra/superpowers', fullName: 'obra/superpowers', name: 'superpowers',
      url: 'https://github.com/obra/superpowers', sourceUrl: 'https://github.com/obra/superpowers#readme',
      summary: '一套面向智能体的软件开发方法与技能框架', description: 'An agentic skills framework & software development methodology that works.',
      category: '编程开发', scenarios: ['复杂软件开发', '规范化 Agent 工作流', '团队工程实践'], platforms: ['Codex'],
      license: 'MIT', activity: '本周活跃', catalogStatus: 'active', installCommand: 'git clone https://github.com/obra/superpowers.git',
      installCommandSource: 'catalog-extracted', keywords: ['sdlc', 'skills', 'superpowers']
    },
    {
      id: 'aaa/general-code-helper', fullName: 'aaa/general-code-helper', name: 'general-code-helper',
      url: 'https://github.com/aaa/general-code-helper', sourceUrl: 'https://github.com/aaa/general-code-helper#readme',
      summary: '普通编程工具集合', category: '编程开发', scenarios: ['软件开发'], platforms: ['Codex'],
      license: 'MIT', activity: '本周活跃', catalogStatus: 'active', installCommandSource: 'unavailable'
    },
    {
      id: 'anthropics/skills', fullName: 'anthropics/skills', name: 'skills',
      url: 'https://github.com/anthropics/skills', sourceUrl: 'https://github.com/anthropics/skills#readme',
      summary: '可复用的 coding agent skill 集合', category: '技能集合', scenarios: ['编码辅助', '编程开发'], platforms: ['Claude Code', 'Codex'],
      license: 'MIT', activity: '本周活跃', catalogStatus: 'active', installCommand: 'npx skills add anthropics/skills',
      installCommandSource: 'upstream'
    },
    {
      id: 'sav/content-writer', fullName: 'sav/content-writer', name: 'content-writer',
      url: 'https://github.com/sav/content-writer', sourceUrl: 'https://github.com/sav/content-writer#readme',
      summary: '将素材整理成有结构的内容', description: '适合访谈、公众号文章和长文文案。', category: '内容创作', scenarios: ['访谈整理', '长文写作'], platforms: ['Codex'],
      license: 'MIT', activity: '本月活跃', catalogStatus: 'active', installCommandSource: 'unavailable'
    },
    {
      id: 'data/chart-maker', fullName: 'data/chart-maker', name: 'chart-maker',
      url: 'https://github.com/data/chart-maker', sourceUrl: 'https://github.com/data/chart-maker#readme',
      summary: '分析 CSV 数据并生成图表', category: '数据分析', scenarios: ['表格分析'], platforms: ['Codex'],
      license: 'Apache-2.0', activity: '本月活跃', catalogStatus: 'active', installCommandSource: 'unavailable'
    },
    {
      id: 'secure/vulnerability-review', fullName: 'secure/vulnerability-review', name: 'vulnerability-review',
      url: 'https://github.com/secure/vulnerability-review', sourceUrl: 'https://github.com/secure/vulnerability-review#readme',
      summary: '检查安全漏洞', category: '安全', scenarios: ['安全审查'], platforms: ['Codex'],
      license: 'MIT', activity: '本月活跃', catalogStatus: 'archived', installCommandSource: 'unavailable'
    }
  ]
})

const engine = createDiscoveryEngine(catalog)

test('maps an imprecise Chinese writing request to the content-writing record with a synonym reason', () => {
  const result = engine.find({ query: '帮我把访谈写成长文', limit: 3 })

  assert.equal(result.recommendations[0].skill.category, '内容创作')
  assert.match(result.recommendations[0].reasons.map((item) => item.explanation).join('\n'), /写作|内容/)
})

test('never reports a catalog-extracted command as upstream', () => {
  const prompt = engine.installPrompt({ skill: 'obra/superpowers', agent: 'codex' })

  assert.equal(prompt.commandSource, 'catalog-extracted')
  assert.match(prompt.markdown, /请先阅读上游 README/)
  assert.doesNotMatch(prompt.markdown, /上游提供的安装命令/)
})

test('does not surface a command when its provenance is unavailable', () => {
  const prompt = createInstallPrompt({
    ...catalog.skills[0],
    installCommandSource: 'unavailable'
  }, 'codex')

  assert.equal(prompt.command, undefined)
  assert.doesNotMatch(prompt.markdown, /git clone/)
})

test('comparison accepts two to five unique known skills', () => {
  assert.equal(engine.compare(['obra/superpowers', 'anthropics/skills']).skills.length, 2)
  assert.throws(() => engine.compare(['obra/superpowers']), /2 to 5/)
  assert.throws(() => engine.compare(['obra/superpowers', 'OBRA/SUPERPOWERS']), /unique/)
})

test('ranks matching repository names before topic matches and keeps ties deterministic', () => {
  const result = engine.find({ query: 'skills', limit: 5 })

  assert.equal(result.recommendations[0].skill.id, 'anthropics/skills')
  assert.equal(result.recommendations[0].score, 50)
  assert.equal(result.recommendations[0].reasons[0].field, 'name')
})

test('filters results by category, platform, and catalog status', () => {
  const result = engine.find({
    query: '代码',
    category: '编程开发',
    platforms: ['codex'],
    catalogStatus: 'active'
  })

  assert.deepEqual(new Set(result.recommendations.map((item) => item.skill.id)), new Set(['aaa/general-code-helper', 'obra/superpowers']))
})

test('ranks workflow collections over generic coding matches for plan test review requests', () => {
  const result = engine.find({
    query: '我希望你写代码的时候别一上来就改，先做计划，再写测试，最后自己做一遍代码评审',
    limit: 3
  })

  assert.equal(result.recommendations[0].skill.id, 'obra/superpowers')
  assert.match(result.recommendations[0].reasons.map((item) => item.explanation).join('\n'), /计划|测试|评审|工作流/)
})

test('resolves an exact name case-insensitively and rejects unknown references', () => {
  assert.equal(engine.show('CONTENT-WRITER').id, 'sav/content-writer')
  assert.throws(() => engine.show('missing/skill'), (error: unknown) => error instanceof SkillHotError && error.code === 'SKILL_NOT_FOUND')
})

test('suggests matching alternatives without returning the selected skill', () => {
  const alternatives = engine.alternatives('obra/superpowers', 3)

  assert.ok(alternatives.length > 0)
  assert.ok(alternatives.every((item) => item.skill.id !== 'obra/superpowers'))
})

test('returns no recommendations for a query with no catalog match', () => {
  assert.deepEqual(engine.find({ query: '量子园艺' }).recommendations, [])
})
