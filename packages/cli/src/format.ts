import type { CatalogSkill, FindResult, InstallPrompt, Recommendation } from '@skillhot/core'

export type OutputFormat = 'text' | 'markdown' | 'json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSkill(value: unknown): value is CatalogSkill {
  return isRecord(value) && typeof value.fullName === 'string' && typeof value.summary === 'string'
}

function isRecommendation(value: unknown): value is Recommendation {
  return isRecord(value) && isSkill(value.skill) && Array.isArray(value.reasons)
}

function isFindResult(value: unknown): value is FindResult {
  return isRecord(value) && typeof value.query === 'string' && Array.isArray(value.recommendations)
}

function isInstallPrompt(value: unknown): value is InstallPrompt {
  return isRecord(value) && typeof value.markdown === 'string' && typeof value.commandSource === 'string'
}

function renderSkill(skill: CatalogSkill, markdown: boolean): string {
  const title = markdown ? `## ${skill.fullName}` : skill.fullName
  const fields = [
    `${markdown ? '- ' : ''}简介：${skill.summary}`,
    `${markdown ? '- ' : ''}分类：${skill.category}`,
    `${markdown ? '- ' : ''}场景：${skill.scenarios.join('、') || '未提供'}`,
    `${markdown ? '- ' : ''}平台：${skill.platforms.join('、') || '未提供'}`,
    `${markdown ? '- ' : ''}上游 README：${skill.sourceUrl}`,
    `${markdown ? '- ' : ''}安装命令来源：${skill.installCommandSource}`
  ]
  return [title, ...fields].join('\n')
}

function renderRecommendation(item: Recommendation, index: number, markdown: boolean): string {
  const heading = markdown ? `### ${index + 1}. ${item.skill.fullName}（${item.score}）` : `${index + 1}. ${item.skill.fullName}（${item.score}）`
  const reasons = item.reasons.map((reason) => `${markdown ? '  - ' : '   - '}${reason.explanation}`).join('\n')
  return [heading, `${markdown ? '- ' : '   '}简介：${item.skill.summary}`, `${markdown ? '- ' : '   '}匹配原因：`, reasons].filter(Boolean).join('\n')
}

function renderFind(result: FindResult, markdown: boolean): string {
  const title = markdown ? `# SkillHot 搜索：${result.query}` : `SkillHot 搜索：${result.query}`
  if (result.recommendations.length === 0) return `${title}\n未找到匹配项；可换一种描述后重试。\n`
  return `${[title, ...result.recommendations.map((item, index) => renderRecommendation(item, index, markdown))].join('\n\n')}\n`
}

export function renderHuman(value: unknown, format: Exclude<OutputFormat, 'json'>): string {
  const markdown = format === 'markdown'
  if (isInstallPrompt(value)) return `${value.markdown}\n`
  if (isFindResult(value)) return renderFind(value, markdown)
  if (isSkill(value)) return `${renderSkill(value, markdown)}\n`
  if (Array.isArray(value) && value.every(isRecommendation)) {
    return `${value.map((item, index) => renderRecommendation(item, index, markdown)).join('\n\n')}\n`
  }
  if (isRecord(value) && Array.isArray(value.skills) && value.skills.every(isSkill)) {
    return `${value.skills.map((skill) => renderSkill(skill, markdown)).join('\n\n')}\n`
  }
  return `${JSON.stringify(value, null, 2)}\n`
}

export function print(value: unknown, format: OutputFormat, stdout: NodeJS.WritableStream): void {
  stdout.write(format === 'json' ? `${JSON.stringify(value)}\n` : renderHuman(value, format))
}
