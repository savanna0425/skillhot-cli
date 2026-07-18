import { SkillHotError } from './errors.js'
import { expandTerms, normalizeQuery, SYNONYMS } from './normalize.js'
import type { Catalog, CatalogSkill, InstallCommandSource } from './types.js'

export interface MatchReason {
  field: 'name' | 'summary' | 'scenario' | 'category' | 'platform' | 'keyword'
  term: string
  explanation: string
}

export interface Recommendation {
  skill: CatalogSkill
  score: number
  reasons: MatchReason[]
}

export interface FindOptions {
  query: string
  limit?: number
  category?: string
  platforms?: string[]
  license?: string
  catalogStatus?: CatalogSkill['catalogStatus']
}

export interface FindResult {
  query: string
  recommendations: Recommendation[]
}

export interface InstallPrompt {
  skill: CatalogSkill
  agent: string
  command?: string
  commandSource: InstallCommandSource
  markdown: string
}

export interface DiscoveryEngine {
  find(options: FindOptions): FindResult
  show(ref: string): CatalogSkill
  compare(refs: string[]): { skills: CatalogSkill[] }
  alternatives(ref: string, limit?: number): Recommendation[]
  installPrompt(options: { skill: string; agent: string }): InstallPrompt
}

function normalizedText(value: string): string {
  return normalizeQuery(value).join(' ')
}

function termVariants(term: string): string[] {
  return [term, ...(SYNONYMS[term] ?? [])]
}

function includesExactTerm(value: string, term: string): boolean {
  return normalizedText(value).includes(normalizedText(term))
}

function includesTerm(value: string, term: string): boolean {
  const text = normalizedText(value)
  return termVariants(term).some((variant) => text.includes(normalizedText(variant)))
}

function normalizedLimit(limit: number | undefined): number {
  if (limit === undefined) return 5
  if (!Number.isFinite(limit)) return 5
  return Math.min(20, Math.max(1, Math.trunc(limit)))
}

function sameText(left: string, right: string): boolean {
  return normalizedText(left) === normalizedText(right)
}

function matchesFilters(skill: CatalogSkill, options: FindOptions): boolean {
  if (options.category !== undefined && !sameText(skill.category, options.category)) return false
  if (options.license !== undefined && !sameText(skill.license, options.license)) return false
  if (options.catalogStatus !== undefined && skill.catalogStatus !== options.catalogStatus) return false
  if (options.platforms !== undefined && !options.platforms.every((platform) => skill.platforms.some((item) => sameText(item, platform)))) return false
  return true
}

function synonymExplanation(term: string, rawTerms: string[]): string {
  const synonym = rawTerms.find((rawTerm) => Object.entries(SYNONYMS).some(([canonical, values]) => canonical === term && values.some((value) => rawTerm.includes(value))))
  return synonym === undefined ? `「${term}」` : `「${term}」（由查询中的「${synonym}」扩展）`
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function indented(value: string): string {
  return value.split('\n').map((line) => `    ${line}`).join('\n')
}

function workflowIntentCount(terms: string[]): number {
  const workflowTerms = new Set(['工作流', '计划', '测试', '评审'])
  return [...workflowTerms].filter((term) => terms.includes(term)).length
}

function isWorkflowMethodSkill(skill: CatalogSkill): boolean {
  return [
    skill.summary,
    skill.description ?? '',
    skill.scenarios.join(' '),
    skill.keywords?.join(' ') ?? ''
  ].some((value) => [
    '规范化 agent 工作流',
    '软件开发方法',
    '技能框架',
    'software development methodology',
    'sdlc'
  ].some((pattern) => includesTerm(value, pattern)))
}

export function createInstallPrompt(skill: CatalogSkill, agent: string): InstallPrompt {
  const commandSourceText: Record<InstallCommandSource, string> = {
    upstream: '上游提供的安装命令',
    'catalog-extracted': '目录提取的候选命令（并非上游确认的安装说明）',
    unavailable: '没有可用的安装命令'
  }
  const command = skill.installCommandSource === 'unavailable' ? undefined : skill.installCommand
  const commandSection = command === undefined
    ? '目录中没有记录安装命令；请只根据上游 README 确认后续步骤。'
    : `${commandSourceText[skill.installCommandSource]}（只作标签，不会自动执行）：\n\n${indented(command)}`

  return {
    skill,
    agent,
    command,
    commandSource: skill.installCommandSource,
    markdown: [
      `为 ${quote(agent)} 准备 ${quote(skill.fullName)} 的安装交接。`,
      '',
      `- 上游 README：${quote(skill.sourceUrl)}`,
      `- 命令来源：${skill.installCommandSource}`,
      '- 请先阅读上游 README 和安装说明。',
      '- 在最终用户明确批准前，不要执行任何第三方命令。',
      '',
      commandSection
    ].join('\n')
  }
}

export function createDiscoveryEngine(catalog: Catalog): DiscoveryEngine {
  const resolve = (ref: string): CatalogSkill | undefined => catalog.skills.find((skill) =>
    [skill.id, skill.fullName, skill.name].some((value) => sameText(value, ref))
  )

  const show = (ref: string): CatalogSkill => {
    const skill = resolve(ref)
    if (skill === undefined) throw new SkillHotError('SKILL_NOT_FOUND', `No SkillHot entry matches ${ref}.`)
    return skill
  }

  const find = (options: FindOptions): FindResult => {
    const rawTerms = normalizeQuery(options.query)
    const terms = expandTerms(rawTerms)
    const recommendations = catalog.skills
      .filter((skill) => matchesFilters(skill, options))
      .map((skill) => {
        const reasons: MatchReason[] = []
        let namePoints = 0
        let summaryPoints = 0
        let facetPoints = 0
        let keywordPoints = 0
        let methodPoints = 0

        const add = (cap: number, points: number, field: MatchReason['field'], term: string, explanation: string, current: number): number => {
          const added = Math.min(points, cap - current)
          if (added > 0) reasons.push({ field, term, explanation })
          return current + added
        }

        for (const term of terms) {
          const displayTerm = synonymExplanation(term, rawTerms)
          if (includesExactTerm(skill.fullName, term) || includesExactTerm(skill.name, term)) {
            namePoints = add(50, 50, 'name', term, `名称匹配${displayTerm}`, namePoints)
          } else if (includesTerm(`${skill.summary} ${skill.description ?? ''}`, term)) {
            summaryPoints = add(30, 15, 'summary', term, `简介匹配${displayTerm}`, summaryPoints)
          }

          if (includesTerm(skill.scenarios.join(' '), term)) {
            facetPoints = add(25, 10, 'scenario', term, `场景匹配${displayTerm}`, facetPoints)
          }
          if (includesTerm(skill.category, term)) {
            facetPoints = add(25, 10, 'category', term, `分类匹配${displayTerm}`, facetPoints)
          }
          if (includesTerm(skill.platforms.join(' '), term)) {
            facetPoints = add(25, 5, 'platform', term, `平台匹配${displayTerm}`, facetPoints)
          }
          if (includesTerm(skill.keywords?.join(' ') ?? '', term)) {
            keywordPoints = add(20, 8, 'keyword', term, `主题匹配${displayTerm}`, keywordPoints)
          }
        }

        if (workflowIntentCount(terms) >= 3 && isWorkflowMethodSkill(skill)) {
          methodPoints = add(
            25,
            25,
            'scenario',
            '工作流',
            '工作流方法匹配「计划 / 测试 / 评审」这类流程型需求',
            methodPoints
          )
        }

        return { skill, score: Math.min(100, namePoints + summaryPoints + facetPoints + keywordPoints + methodPoints), reasons }
      })
      .filter((item) => item.reasons.length > 0)
      .sort((left, right) => right.score - left.score || compareText(left.skill.fullName, right.skill.fullName))

    return { query: options.query, recommendations: recommendations.slice(0, normalizedLimit(options.limit)) }
  }

  return {
    find,
    show,
    compare(refs: string[]) {
      if (refs.length < 2 || refs.length > 5) {
        throw new SkillHotError('INVALID_COMPARE', 'Compare requires 2 to 5 unique skill references.')
      }
      const skills = refs.map(show)
      if (new Set(skills.map((skill) => skill.id)).size !== skills.length) {
        throw new SkillHotError('INVALID_COMPARE', 'Compare requires 2 to 5 unique skill references.')
      }
      return { skills }
    },
    alternatives(ref: string, limit = 5) {
      const skill = show(ref)
      const maxResults = normalizedLimit(limit)
      return find({ query: [...skill.scenarios, skill.category].join(' '), limit: Math.min(20, maxResults + 1) })
        .recommendations
        .filter((item) => item.skill.id !== skill.id)
        .slice(0, maxResults)
    },
    installPrompt({ skill: ref, agent }: { skill: string; agent: string }) {
      return createInstallPrompt(show(ref), agent)
    }
  }
}
