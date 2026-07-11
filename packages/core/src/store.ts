import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { SkillHotError } from './errors.js'
import { parseCatalog } from './schema.js'
import type { Catalog } from './types.js'

export interface CatalogMetadata {
  source: 'bundled' | 'cache'
  generatedAt: string
  count: number
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

function parseCatalogText(text: string): Catalog {
  return parseCatalog(JSON.parse(text))
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
