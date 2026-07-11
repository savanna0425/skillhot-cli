import { SkillHotError } from './errors.js'
import type { Catalog, CatalogSkill, InstallCommandSource } from './types.js'

const installCommandSources: readonly InstallCommandSource[] = ['upstream', 'catalog-extracted', 'unavailable']
const catalogStatuses: readonly CatalogSkill['catalogStatus'][] = ['active', 'archived']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isCatalogSkill(value: unknown): value is CatalogSkill {
  if (!isRecord(value)) return false

  return isNonEmptyString(value.id)
    && isNonEmptyString(value.fullName)
    && isNonEmptyString(value.name)
    && isNonEmptyString(value.url)
    && isNonEmptyString(value.sourceUrl)
    && isNonEmptyString(value.summary)
    && (value.description === undefined || typeof value.description === 'string')
    && (value.howToUse === undefined || typeof value.howToUse === 'string')
    && isNonEmptyString(value.category)
    && isStringArray(value.scenarios)
    && isStringArray(value.platforms)
    && isNonEmptyString(value.license)
    && isNonEmptyString(value.activity)
    && catalogStatuses.includes(value.catalogStatus as CatalogSkill['catalogStatus'])
    && (value.installCommand === undefined || typeof value.installCommand === 'string')
    && installCommandSources.includes(value.installCommandSource as InstallCommandSource)
}

export function parseCatalog(input: unknown): Catalog {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.skills) || !isNonEmptyString(input.generatedAt)) {
    throw new SkillHotError('INVALID_CATALOG', 'Catalog must have version 1 and skills.')
  }

  if (!input.skills.every(isCatalogSkill)) {
    throw new SkillHotError('INVALID_CATALOG', 'Every skill must match the public catalog schema.')
  }

  return input as unknown as Catalog
}
