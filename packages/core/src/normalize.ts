export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  写作: ['长文', '公众号', '访谈', '文案'],
  编程: ['代码', '开发', 'coding'],
  工作流: ['流程', '计划', '规划', 'plan', 'planning', 'workflow'],
  测试: ['tdd', '测试驱动', 'test', 'testing'],
  评审: ['审查', '代码评审', 'review', 'code review'],
  数据分析: ['csv', '图表', '表格'],
  自动化: ['自动', '工作流'],
  研究学习: ['调研', '研究'],
  UI设计: ['界面', '设计'],
  安全: ['漏洞', '安全']
}

const IMPORTANT_TERMS = [
  '计划',
  '规划',
  '测试',
  '测试驱动',
  '评审',
  '审查',
  '代码评审',
  '工作流',
  '流程',
  'tdd',
  'plan',
  'planning',
  'test',
  'testing',
  'review',
  'workflow'
]

export function normalizeQuery(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const terms = normalized.split(/\s+/).filter(Boolean)
  for (const term of IMPORTANT_TERMS) {
    if (normalized.includes(term)) terms.push(term)
  }
  return [...new Set(terms)]
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
