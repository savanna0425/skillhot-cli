import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseCatalog } from '../packages/core/dist/src/index.js'

const defaultSourceUrl = 'https://skillhot.savs-ai.com/data/skills-lite.json'
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(projectRoot, 'packages/cli/data/catalog.json')

async function readSource(source) {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Catalog download failed: HTTP ${response.status}.`)
    return response.text()
  }

  return readFile(resolve(process.cwd(), source), 'utf8')
}

function optionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function sourceId(value) {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new Error('Catalog source record requires a non-empty string or finite numeric id.')
}

function mapSkill(record) {
  const installCommand = optionalString(record.installCommand)
  const description = optionalString(record.description)
  const howToUse = optionalString(record.howToUse)

  return {
    id: sourceId(record.id),
    fullName: record.fullName,
    name: record.name,
    url: record.url,
    sourceUrl: record.url,
    summary: record.summary,
    ...(description === undefined ? {} : { description }),
    ...(howToUse === undefined ? {} : { howToUse }),
    category: record.category,
    scenarios: record.scenarios,
    platforms: record.platforms,
    license: optionalString(record.license) ?? 'UNKNOWN',
    activity: record.activity,
    catalogStatus: record.catalogStatus,
    ...(installCommand === undefined ? {} : { installCommand }),
    installCommandSource: installCommand === undefined ? 'unavailable' : 'catalog-extracted'
  }
}

const source = process.env.SKILLHOT_SOURCE_CATALOG ?? defaultSourceUrl
const input = JSON.parse(await readSource(source))
const catalog = parseCatalog({
  version: 1,
  generatedAt: input?.meta?.generatedAt,
  skills: input?.skills?.map(mapSkill)
})

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
