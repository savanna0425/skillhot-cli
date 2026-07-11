export type InstallCommandSource = 'upstream' | 'catalog-extracted' | 'unavailable'

export interface CatalogSkill {
  id: string
  fullName: string
  name: string
  url: string
  sourceUrl: string
  summary: string
  description?: string
  howToUse?: string
  category: string
  scenarios: string[]
  platforms: string[]
  license: string
  activity: string
  catalogStatus: 'active' | 'archived'
  installCommand?: string
  installCommandSource: InstallCommandSource
}

export interface Catalog {
  version: 1
  generatedAt: string
  skills: CatalogSkill[]
}
