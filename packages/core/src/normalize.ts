export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  写作: ['长文', '公众号', '访谈', '文案'],
  编程: ['代码', '开发', 'coding'],
  数据分析: ['csv', '图表', '表格'],
  自动化: ['自动', '工作流'],
  研究学习: ['调研', '研究'],
  UI设计: ['界面', '设计'],
  安全: ['漏洞', '安全']
}

export function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms)

  for (const term of terms) {
    for (const [canonical, synonyms] of Object.entries(SYNONYMS)) {
      if (term === canonical || synonyms.some((synonym) => term === synonym || term.includes(synonym))) {
        expanded.add(canonical)
      }
    }
  }

  return [...expanded]
}
