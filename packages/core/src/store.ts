import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { SkillHotError } from './errors.js'
import { parseCatalog } from './schema.js'
import type { Catalog, CatalogSkill } from './types.js'

export const SKILLHOT_PUBLIC_CATALOG_URL = 'https://skillhot.savs-ai.com/data/skills.json'

export interface CatalogMetadata {
  source: 'bundled' | 'cache' | 'live'
  generatedAt: string
  count: number
  url?: string
}

export interface LoadCatalogOptions {
  bundledPath: string
  cachePath?: string
}

export interface LoadedCatalog {
  catalog: Catalog
  metadata: CatalogMetadata
}

export interface RefreshOptions {
  url: string
  cachePath: string
  fetchImpl?: typeof fetch
}

export interface LiveCatalogOptions {
  url?: string
  fetchImpl?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function sourceId(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new SkillHotError('INVALID_CATALOG', 'SkillHot public catalog record requires an id.')
}

function detailPathFor(fullName: string): string {
  return `data/details/${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '__').replace(/^__|__$/g, '')}.json`
}

function publicSkillToCatalogSkill(record: unknown): CatalogSkill {
  if (!isRecord(record)) throw new SkillHotError('INVALID_CATALOG', 'SkillHot public catalog skills must be objects.')
  const fullName = optionalString(record.fullName)
  const name = optionalString(record.name)
  const url = optionalString(record.url)
  const summary = optionalString(record.projectProfile && isRecord(record.projectProfile) ? record.projectProfile.plainIntro : undefined)
    ?? optionalString(record.summary)
  if (!fullName || !name || !url || !summary) {
    throw new SkillHotError('INVALID_CATALOG', 'SkillHot public catalog record is missing required fields.')
  }
  const installCommand = optionalString(record.installCommand)
  const socialPreview = isRecord(record.media) ? optionalString(record.media.socialPreview) : undefined
  const media = isRecord(record.media) && typeof record.media.videoUrl === 'string' && socialPreview !== undefined
    ? { socialPreview, videoUrl: record.media.videoUrl }
    : undefined
  const stars = optionalNumber(record.stars)
  const score = optionalNumber(record.score)
  const skillCount = optionalNumber(record.skillCount)
  const detailPath = optionalString(record.detailPath) ?? detailPathFor(fullName)
  const keywords = uniqueStrings([
    ...stringArray(record.sourceTopics),
    ...stringArray(record.repoTopics),
    ...stringArray(record.discoveredBy)
  ])

  return {
    id: sourceId(record.id),
    fullName,
    name,
    url,
    sourceUrl: optionalString(record.readmeUrl) ?? url,
    summary,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    ...(typeof record.howToUse === 'string' ? { howToUse: record.howToUse } : {}),
    category: optionalString(record.category) ?? '其他',
    scenarios: stringArray(record.scenarios),
    platforms: stringArray(record.platforms),
    license: optionalString(record.license) ?? 'UNKNOWN',
    activity: optionalString(record.activity) ?? '未知',
    catalogStatus: record.catalogStatus === 'archived' ? 'archived' : 'active',
    ...(installCommand === undefined ? {} : { installCommand }),
    installCommandSource: installCommand === undefined ? 'unavailable' : 'catalog-extracted',
    ...(typeof record.language === 'string' ? { language: record.language } : {}),
    ...(stars === undefined ? {} : { stars }),
    ...(score === undefined ? {} : { score }),
    ...(typeof record.pushedAt === 'string' ? { pushedAt: record.pushedAt } : {}),
    ...(skillCount === undefined ? {} : { skillCount }),
    detailPath,
    ...(keywords.length === 0 ? {} : { keywords }),
    ...(media === undefined ? {} : { media })
  }
}

function parseCatalogText(text: string): Catalog {
  const input = JSON.parse(text)
  if (isRecord(input) && input.version === 1) return parseCatalog(input)
  if (isRecord(input) && isRecord(input.meta) && typeof input.meta.generatedAt === 'string' && Array.isArray(input.skills)) {
    return parseCatalog({
      version: 1,
      generatedAt: input.meta.generatedAt,
      skills: input.skills.map(publicSkillToCatalogSkill)
    })
  }
  return parseCatalog(input)
}

export async function loadCatalogWithMetadata({ bundledPath, cachePath }: LoadCatalogOptions): Promise<LoadedCatalog> {
  if (cachePath !== undefined) {
    try {
      const catalog = parseCatalogText(await readFile(cachePath, 'utf8'))
      return {
        catalog,
        metadata: { source: 'cache', generatedAt: catalog.generatedAt, count: catalog.skills.length }
      }
    } catch {
      // An absent or corrupt cache must not prevent offline use of the bundled catalog.
    }
  }

  const catalog = parseCatalogText(await readFile(bundledPath, 'utf8'))
  return {
    catalog,
    metadata: { source: 'bundled', generatedAt: catalog.generatedAt, count: catalog.skills.length }
  }
}

export async function loadCatalog(options: LoadCatalogOptions): Promise<Catalog> {
  return (await loadCatalogWithMetadata(options)).catalog
}

export async function refreshCatalog({ url, cachePath, fetchImpl = fetch }: RefreshOptions): Promise<CatalogMetadata> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new SkillHotError('UPDATE_FAILED', `Catalog download failed: HTTP ${response.status}.`)
  }

  const catalog = parseCatalogText(await response.text())
  const temporaryPath = `${cachePath}.tmp`
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(temporaryPath, JSON.stringify(catalog))
  await rename(temporaryPath, cachePath)

  return { source: 'cache', generatedAt: catalog.generatedAt, count: catalog.skills.length }
}

export async function loadLiveCatalogWithMetadata({ url = SKILLHOT_PUBLIC_CATALOG_URL, fetchImpl = fetch }: LiveCatalogOptions = {}): Promise<LoadedCatalog> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new SkillHotError('LIVE_CATALOG_UNAVAILABLE', `SkillHot public catalog download failed: HTTP ${response.status}.`)
  }
  const catalog = parseCatalogText(await response.text())
  return {
    catalog,
    metadata: { source: 'live', generatedAt: catalog.generatedAt, count: catalog.skills.length, url }
  }
}
