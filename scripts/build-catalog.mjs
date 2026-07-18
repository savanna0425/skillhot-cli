import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseCatalog } from '../packages/core/dist/src/index.js'

const defaultSourceUrl = 'https://skillhot.savs-ai.com/data/skills.json'
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

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function sourceId(value) {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new Error('Catalog source record requires a non-empty string or finite numeric id.')
}

function detailPathFor(fullName) {
  return `data/details/${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '__').replace(/^__|__$/g, '')}.json`
}

function mapSkill(record) {
  const installCommand = optionalString(record.installCommand)
  const description = optionalString(record.description)
  const howToUse = optionalString(record.howToUse)
  const detailPath = optionalString(record.detailPath) ?? detailPathFor(record.fullName)
  const keywords = uniqueStrings([
    ...stringArray(record.sourceTopics),
    ...stringArray(record.repoTopics),
    ...stringArray(record.discoveredBy)
  ])

  return {
    id: sourceId(record.id),
    fullName: record.fullName,
    name: record.name,
    url: record.url,
    sourceUrl: optionalString(record.readmeUrl) ?? record.url,
    summary: record.projectProfile?.plainIntro || record.summary,
    ...(description === undefined ? {} : { description }),
    ...(howToUse === undefined ? {} : { howToUse }),
    category: record.category,
    scenarios: record.scenarios,
    platforms: record.platforms,
    license: optionalString(record.license) ?? 'UNKNOWN',
    activity: record.activity,
    catalogStatus: record.catalogStatus,
    ...(installCommand === undefined ? {} : { installCommand }),
    installCommandSource: installCommand === undefined ? 'unavailable' : 'catalog-extracted',
    ...(optionalString(record.language) === undefined ? {} : { language: record.language }),
    ...(typeof record.stars === 'number' ? { stars: record.stars } : {}),
    ...(typeof record.score === 'number' ? { score: record.score } : {}),
    ...(optionalString(record.pushedAt) === undefined ? {} : { pushedAt: record.pushedAt }),
    ...(typeof record.skillCount === 'number' ? { skillCount: record.skillCount } : {}),
    detailPath,
    ...(keywords.length === 0 ? {} : { keywords }),
    ...(record.media?.socialPreview ? { media: { socialPreview: record.media.socialPreview, videoUrl: record.media.videoUrl || '' } } : {})
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
