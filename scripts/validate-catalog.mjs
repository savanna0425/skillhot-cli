import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseCatalog } from '../packages/core/dist/src/index.js'

const catalogPath = fileURLToPath(new URL('../packages/cli/data/catalog.json', import.meta.url))
const catalog = parseCatalog(JSON.parse(await readFile(catalogPath, 'utf8')))

console.log(`${catalogPath}: valid (${catalog.skills.length} skills)`)
