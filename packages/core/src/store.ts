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

export interface RefreshOptions {
  url: string
  cachePath: string
  fetchImpl?: typeof fetch
}

function parseCatalogText(text: string): Catalog {
  return parseCatalog(JSON.parse(text))
}

export async function loadCatalog({ bundledPath, cachePath }: LoadCatalogOptions): Promise<Catalog> {
  if (cachePath !== undefined) {
    try {
      return parseCatalogText(await readFile(cachePath, 'utf8'))
    } catch {
      // An absent or corrupt cache must not prevent offline use of the bundled catalog.
    }
  }

  return parseCatalogText(await readFile(bundledPath, 'utf8'))
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
