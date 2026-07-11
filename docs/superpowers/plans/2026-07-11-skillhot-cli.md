# SkillHot Open-Source Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and release an offline-first SkillHot core library, CLI, loopback HTTP API, and Agent Skill that can discover, explain, compare, and safely hand off installations of Agent Skills.

**Architecture:** A dependency-free `@skillhot/core` package normalizes the public catalog and exposes deterministic search, detail, comparison, alternatives, update, and prompt APIs. `@skillhot/cli` adapts those APIs into terminal commands and a loopback-only Node HTTP server. The Agent Skill delegates discovery to the CLI so its behavior is identical to the published tool.

**Tech Stack:** Node.js 20+, TypeScript, pnpm workspaces, Node test runner, Node `http`, GitHub Actions, npm trusted publishing.

## Global Constraints

- Code license is MIT; catalog data has a separate attribution and data-license file.
- The default remote catalog is `https://skillhot.savs-ai.com/data/skills-lite.json`; bundled data must be usable without network access.
- `@skillhot/core` must have zero runtime dependencies.
- A recommendation must expose reasons; catalog score/recency must not make an irrelevant result relevant.
- Installation commands are labels, not executable actions: do not auto-run third-party commands.
- Local API binds to `127.0.0.1` unless the user explicitly supplies `--host`.
- Every JSON command writes exactly one JSON value to stdout; diagnostics go to stderr.
- Public project supports Node 20 and 22.

---

## File structure

```text
package.json                         workspace scripts and release metadata
pnpm-workspace.yaml                  workspace package discovery
tsconfig.base.json                   strict compiler defaults
packages/core/src/types.ts           catalog, result, error, and option types
packages/core/src/schema.ts          runtime catalog validation
packages/core/src/normalize.ts       query normalization and synonym expansion
packages/core/src/discovery.ts       find/show/compare/alternatives/prompt operations
packages/core/src/store.ts           bundled/cache/URL loading and atomic update
packages/core/src/index.ts           public core exports
packages/core/test/*.test.ts         core unit tests
packages/cli/src/format.ts           text/Markdown/JSON serializers
packages/cli/src/server.ts           loopback HTTP adapter
packages/cli/src/main.ts             command parser and exit-code adapter
packages/cli/data/catalog.json       generated distributable catalog snapshot
packages/cli/test/*.test.ts          CLI and HTTP integration tests
fixtures/catalog.json                fixed five-record test catalog
scripts/build-catalog.mjs            converts SkillHot lite catalog to public schema
skills/skillhot-discovery/SKILL.md   coding-agent discovery instructions
scripts/validate-skill.mjs           Agent Skill frontmatter/content gate
.github/workflows/ci.yml             Node 20/22 quality gate
.github/workflows/release.yml        tag/release npm trusted-publishing workflow
README.md                            public quick start and API guide
CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md LICENSE DATA-LICENSE.md
```

### Task 1: Create the workspace, public schema, and representative catalog fixture

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/types.ts`, `packages/core/src/errors.ts`, `packages/core/src/schema.ts`, `packages/core/src/index.ts`
- Create: `fixtures/catalog.json`, `packages/core/test/schema.test.ts`

**Interfaces:**
- Produces `CatalogSkill`, `Catalog`, `InstallCommandSource`, `SkillHotError`, and `parseCatalog(input: unknown): Catalog`.
- `CatalogSkill` uses `fullName` as its human stable identity and `id` as its machine identity.

- [ ] **Step 1: Write the failing schema tests**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCatalog, SkillHotError } from '../src/index.js'

test('accepts a public catalog record and preserves command provenance', () => {
  const catalog = parseCatalog({ version: 1, generatedAt: '2026-07-11T00:00:00Z', skills: [{
    id: 'obra/superpowers', fullName: 'obra/superpowers', name: 'superpowers',
    url: 'https://github.com/obra/superpowers', sourceUrl: 'https://github.com/obra/superpowers#readme',
    summary: '工程工作流', category: '编程开发', scenarios: ['复杂软件开发'], platforms: ['Codex'],
    license: 'MIT', activity: '本周活跃', catalogStatus: 'active', installCommand: 'git clone https://github.com/obra/superpowers.git',
    installCommandSource: 'catalog-extracted'
  }] })
  assert.equal(catalog.skills[0].installCommandSource, 'catalog-extracted')
})

test('rejects a record without an upstream source URL', () => {
  assert.throws(() => parseCatalog({ version: 1, generatedAt: 'x', skills: [{}] }), SkillHotError)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @skillhot/core test`

Expected: FAIL because the workspace package and `parseCatalog` do not exist.

- [ ] **Step 3: Create the workspace and minimal schema implementation**

```ts
export type InstallCommandSource = 'upstream' | 'catalog-extracted' | 'unavailable'
export interface CatalogSkill { id: string; fullName: string; name: string; url: string; sourceUrl: string; summary: string; description?: string; category: string; scenarios: string[]; platforms: string[]; license: string; activity: string; catalogStatus: 'active' | 'archived'; installCommand?: string; installCommandSource: InstallCommandSource }
export interface Catalog { version: 1; generatedAt: string; skills: CatalogSkill[] }

export class SkillHotError extends Error { constructor(public readonly code: string, message: string) { super(message) } }

export function parseCatalog(input: unknown): Catalog {
  const value = input as Partial<Catalog>
  if (value.version !== 1 || !Array.isArray(value.skills)) throw new SkillHotError('INVALID_CATALOG', 'Catalog must have version 1 and skills.')
  for (const skill of value.skills) if (!skill?.id || !skill.fullName || !skill.sourceUrl) throw new SkillHotError('INVALID_CATALOG', 'Every skill requires id, fullName, and sourceUrl.')
  return value as Catalog
}
```

Use a five-record `fixtures/catalog.json` with Coding, Writing, Data Analysis, Security, and Collection records; include `obra/superpowers` and `anthropics/skills`, at least one `upstream` command, one `catalog-extracted` command, and one `unavailable` command.

- [ ] **Step 4: Run core tests and type checking**

Run: `pnpm --filter @skillhot/core test && pnpm typecheck`

Expected: PASS with two passing schema tests and no TypeScript diagnostics.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages/core fixtures/catalog.json
git commit -m "feat: add SkillHot core catalog schema"
```

### Task 2: Implement deterministic discovery, resolution, comparison, and safe prompts

**Files:**
- Create: `packages/core/src/normalize.ts`, `packages/core/src/discovery.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/discovery.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `CatalogSkill`, and `SkillHotError` from Task 1.
- Produces `createDiscoveryEngine(catalog)` with `find`, `show`, `compare`, `alternatives`, and `installPrompt`.
- `find(options)` returns `{ recommendations: Recommendation[], query: string }`; `Recommendation` includes `score` and nonempty `reasons`.

- [ ] **Step 1: Write the failing discovery tests**

```ts
test('maps an imprecise Chinese writing request to the content-writing record with a synonym reason', () => {
  const result = engine.find({ query: '帮我把访谈写成长文', limit: 3 })
  assert.equal(result.recommendations[0].skill.category, '内容创作')
  assert.match(result.recommendations[0].reasons.map((item) => item.explanation).join('\n'), /写作|内容/)
})

test('never reports a catalog-extracted command as upstream', () => {
  const prompt = engine.installPrompt({ skill: 'obra/superpowers', agent: 'codex' })
  assert.equal(prompt.commandSource, 'catalog-extracted')
  assert.match(prompt.markdown, /请先阅读上游 README/)
})

test('comparison accepts two to five unique known skills', () => {
  assert.equal(engine.compare(['obra/superpowers', 'anthropics/skills']).skills.length, 2)
  assert.throws(() => engine.compare(['obra/superpowers']), /2 to 5/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @skillhot/core test -- discovery.test.ts`

Expected: FAIL because `createDiscoveryEngine` is not exported.

- [ ] **Step 3: Implement the engine with transparent scoring**

```ts
const SYNONYMS: Record<string, string[]> = { 写作: ['长文', '公众号', '访谈', '文案'], 编程: ['代码', '开发', 'coding'], 数据分析: ['csv', '图表', '表格'], 自动化: ['自动', '工作流'], 研究学习: ['调研', '研究'], UI设计: ['界面', '设计'], 安全: ['漏洞', '安全'] }
export interface MatchReason { field: 'name' | 'summary' | 'scenario' | 'category' | 'platform'; term: string; explanation: string }
export function normalizeQuery(query: string) { return query.toLowerCase().normalize('NFKC').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim().split(/\\s+/).filter(Boolean) }
export function expandTerms(terms: string[]) { return [...new Set(terms.flatMap((term) => [term, ...Object.entries(SYNONYMS).filter(([, values]) => values.includes(term)).map(([key]) => key]))] }

export function createDiscoveryEngine(catalog: Catalog) {
  const resolve = (ref: string) => catalog.skills.find((skill) => [skill.id, skill.fullName, skill.name].some((value) => value.toLowerCase() === ref.toLowerCase()))
  return {
    find({ query, limit = 5 }: { query: string; limit?: number }) {
      const terms = expandTerms(normalizeQuery(query))
      const recommendations = catalog.skills.map((skill) => {
        const reasons: MatchReason[] = []
        let score = 0
        const add = (points: number, field: string, term: string, explanation: string) => { score += points; reasons.push({ field, term, explanation }) }
        for (const term of terms) {
          if (skill.fullName.toLowerCase().includes(term) || skill.name.toLowerCase().includes(term)) add(50, 'name', term, `名称匹配「${term}」`)
          else if (`${skill.summary} ${skill.description || ''}`.toLowerCase().includes(term)) add(15, 'summary', term, `简介匹配「${term}」`)
          if (skill.scenarios.join(' ').toLowerCase().includes(term)) add(10, 'scenario', term, `场景匹配「${term}」`)
          if (skill.category.toLowerCase().includes(term)) add(10, 'category', term, `分类匹配「${term}」`)
          if (skill.platforms.join(' ').toLowerCase().includes(term)) add(5, 'platform', term, `平台匹配「${term}」`)
        }
        return { skill, score: Math.min(100, score), reasons }
      }).filter((item) => item.reasons.length > 0)
      return { query, recommendations: recommendations.toSorted((a, b) => b.score - a.score || a.skill.fullName.localeCompare(b.skill.fullName)).slice(0, Math.min(20, Math.max(1, limit))) }
    },
    show(ref: string) { const skill = resolve(ref); if (!skill) throw new SkillHotError('SKILL_NOT_FOUND', `No SkillHot entry matches ${ref}.`); return skill },
    compare(refs: string[]) { if (new Set(refs).size !== refs.length || refs.length < 2 || refs.length > 5) throw new SkillHotError('INVALID_COMPARE', 'Compare requires 2 to 5 unique skill references.'); return { skills: refs.map((ref) => this.show(ref)) } },
    alternatives(ref: string, limit = 5) { const skill = this.show(ref); return this.find({ query: [...skill.scenarios, skill.category].join(' '), limit }).recommendations.filter((item) => item.skill.id !== skill.id) },
    installPrompt({ skill: ref, agent }: { skill: string; agent: string }) { const skill = this.show(ref); return createInstallPrompt(skill, agent) }
  }
}
```

Cap summary/description, scenario/category/platform contributions per candidate as specified in the design before committing: repository/name 50 points, summary/description at most 30, scenario/category/platform at most 25, and optional catalog score/recency only as tie breakers. Each added point range must append a reason object.

- [ ] **Step 4: Run all core tests**

Run: `pnpm --filter @skillhot/core test`

Expected: PASS, including searches, filters, unknown references, comparison size/duplicates, alternatives, and command provenance tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "feat: add deterministic SkillHot discovery engine"
```

### Task 3: Implement bundled/cache/URL catalog loading and atomic refresh

**Files:**
- Create: `packages/core/src/store.ts`, `packages/core/test/store.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/cli/data/catalog.json`
- Create: `scripts/build-catalog.mjs`

**Interfaces:**
- Produces `loadCatalog({ bundledPath, cachePath? })`, `refreshCatalog({ url, cachePath, fetchImpl? })`, and `CatalogMetadata`.
- A refresh writes `<cachePath>.tmp`, validates it with `parseCatalog`, then renames it into place. Failed requests and invalid data leave the existing cache byte-for-byte unchanged.

- [ ] **Step 1: Write failing atomicity tests**

```ts
test('preserves a valid cached catalog when a refresh payload is invalid', async () => {
  await writeFile(cachePath, validCatalogJson)
  await assert.rejects(() => refreshCatalog({ url: 'https://invalid.test/catalog.json', cachePath, fetchImpl: async () => new Response('{"skills":[]}') }))
  assert.equal(await readFile(cachePath, 'utf8'), validCatalogJson)
})

test('records the refreshed catalog only after schema validation', async () => {
  const result = await refreshCatalog({ url: 'https://valid.test/catalog.json', cachePath, fetchImpl: async () => new Response(validCatalogJson) })
  assert.equal(result.source, 'cache')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @skillhot/core test -- store.test.ts`

Expected: FAIL because `refreshCatalog` is not exported.

- [ ] **Step 3: Implement the store and catalog generator**

```ts
export async function refreshCatalog({ url, cachePath, fetchImpl = fetch }: RefreshOptions): Promise<CatalogMetadata> {
  const response = await fetchImpl(url)
  if (!response.ok) throw new SkillHotError('UPDATE_FAILED', `Catalog download failed: HTTP ${response.status}.`)
  const text = await response.text()
  const catalog = parseCatalog(JSON.parse(text))
  const temporaryPath = `${cachePath}.tmp`
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(temporaryPath, JSON.stringify(catalog))
  await rename(temporaryPath, cachePath)
  return { source: 'cache', generatedAt: catalog.generatedAt, count: catalog.skills.length }
}
```

`build-catalog.mjs` reads either `SKILLHOT_SOURCE_CATALOG` or `https://skillhot.savs-ai.com/data/skills-lite.json`, maps only the documented public fields, writes `packages/cli/data/catalog.json`, and fails when a retained record cannot satisfy `parseCatalog`.

- [ ] **Step 4: Run tests and generate the distributable snapshot**

Run: `pnpm --filter @skillhot/core test && pnpm build:catalog && pnpm --filter @skillhot/core test`

Expected: PASS; generated JSON parses through the same schema used for remote refresh.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/store.ts packages/core/test/store.test.ts scripts/build-catalog.mjs packages/cli/data/catalog.json
git commit -m "feat: add safe SkillHot catalog refresh"
```

### Task 4: Build the CLI and its human/JSON renderers

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/format.ts`, `packages/cli/src/main.ts`
- Create: `packages/cli/test/cli.test.ts`
- Modify: root `package.json`

**Interfaces:**
- Consumes: all public core functions from Tasks 1–3.
- Produces `skillhot find`, `show`, `compare`, `alternatives`, `prompt install`, `update`, `serve`, and `skill install`.
- The package `bin` maps `skillhot` to built `dist/main.js`.

- [ ] **Step 1: Write failing end-to-end CLI tests**

```ts
test('find JSON returns a single valid document with recommendation reasons', async () => {
  const result = await runCli(['find', '帮我写长文', '--format', 'json'])
  assert.equal(result.exitCode, 0)
  assert.ok(JSON.parse(result.stdout).recommendations[0].reasons.length)
  assert.equal(result.stderr, '')
})

test('unknown show reference exits nonzero and suggests find', async () => {
  const result = await runCli(['show', 'missing/skill'])
  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /SKILL_NOT_FOUND/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @skillhot/cli test -- cli.test.ts`

Expected: FAIL because the CLI package and `runCli` test helper do not exist.

- [ ] **Step 3: Implement the command adapter and serializers**

```ts
export function print(value: unknown, format: 'text' | 'markdown' | 'json', stdout: NodeJS.WritableStream) {
  stdout.write(format === 'json' ? `${JSON.stringify(value)}\n` : renderHuman(value, format))
}

export async function main(argv: string[], io = process): Promise<number> {
  try {
    const [command, ...rest] = argv
    const { flags, positionals } = parseArguments(rest)
    const engine = createDiscoveryEngine(await loadCatalog({ bundledPath: bundledCatalogPath(), cachePath: defaultCachePath() }))
    const value = command === 'find' ? engine.find({ query: positionals.join(' '), limit: numberFlag(flags.limit, 5) })
      : command === 'show' ? engine.show(required(positionals[0], 'skill reference'))
      : command === 'compare' ? engine.compare(positionals)
      : command === 'alternatives' ? engine.alternatives(required(positionals[0], 'skill reference'), numberFlag(flags.limit, 5))
      : command === 'prompt' && positionals[0] === 'install' ? engine.installPrompt({ skill: required(positionals[1], 'skill reference'), agent: stringFlag(flags.agent, 'generic') })
      : await runOperationalCommand(command, positionals, flags, io)
    if (value !== undefined) print(value, stringFlag(flags.format, 'text') as 'text' | 'markdown' | 'json', io.stdout)
    return 0
  }
  catch (error) { io.stderr.write(`${error instanceof SkillHotError ? error.code : 'UNEXPECTED_ERROR'}: ${error.message}\n`); return 1 }
}

function required(value: string | undefined, label: string) { if (!value) throw new SkillHotError('INVALID_ARGUMENT', `Missing ${label}.`); return value }
function numberFlag(value: unknown, fallback: number) { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) throw new SkillHotError('INVALID_ARGUMENT', 'limit must be an integer from 1 to 20.'); return parsed }
function stringFlag(value: unknown, fallback: string) { return typeof value === 'string' ? value : fallback }
```

Implement `skillhot skill install --agent codex` as printed, explicit instructions only: it displays the user-owned destination and a copy command but performs no write. `prompt install` must include the upstream `sourceUrl`, the command source label, a request to read upstream instructions, and an instruction to ask the end user before any command is run.

- [ ] **Step 4: Run CLI tests, typecheck, and smoke commands**

Run: `pnpm --filter @skillhot/cli test && pnpm typecheck && pnpm --filter @skillhot/cli exec node dist/main.js find "写长文" --format json`

Expected: all tests pass; the smoke command prints one parseable JSON object.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/cli
git commit -m "feat: add SkillHot discovery CLI"
```

### Task 5: Expose the loopback HTTP API

**Files:**
- Create: `packages/cli/src/server.ts`, `packages/cli/test/server.test.ts`
- Modify: `packages/cli/src/main.ts`

**Interfaces:**
- Produces `createServer(engine, metadata)` and `listen({ host, port })`.
- Success response: `{ data: unknown, meta: CatalogMetadata }`; failure response: `{ error: { code: string, message: string } }`.

- [ ] **Step 1: Write failing HTTP tests**

```ts
test('returns explained recommendations over HTTP', async () => {
  const response = await fetch(`${baseUrl}/v1/recommendations?q=%E5%86%99%E9%95%BF%E6%96%87&limit=2`)
  assert.equal(response.status, 200)
  assert.ok((await response.json()).data.recommendations[0].reasons.length)
})

test('rejects malformed JSON and a remote binding without explicit opt-in', async () => {
  const response = await fetch(`${baseUrl}/v1/compare`, { method: 'POST', body: '{' })
  assert.equal(response.status, 400)
  assert.throws(() => validateHost('0.0.0.0', false), /explicit/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @skillhot/cli test -- server.test.ts`

Expected: FAIL because `createServer` and `validateHost` do not exist.

- [ ] **Step 3: Implement routes and host validation**

```ts
export function validateHost(host: string, allowRemote: boolean) {
  if (!allowRemote && host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') throw new SkillHotError('UNSAFE_HOST', 'Non-loopback binding requires --allow-remote-host.')
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}
```

Implement `/health`, all five `/v1` routes from the design, 404, 405 with `Allow`, JSON body size limit of 64 KiB, and `limit` integer range 1–20. Wire `serve --host --allow-remote-host --port` into `main.ts`.

- [ ] **Step 4: Run HTTP integration tests and a real server smoke test**

Run: `pnpm --filter @skillhot/cli test -- server.test.ts && pnpm --filter @skillhot/cli exec skillhot serve --port 4318 & server_pid=$!; sleep 1; curl --fail http://127.0.0.1:4318/health; kill $server_pid`

Expected: tests pass and `/health` returns a JSON metadata object.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/server.ts packages/cli/src/main.ts packages/cli/test/server.test.ts
git commit -m "feat: expose SkillHot local HTTP API"
```

### Task 6: Author and validate the Agent Skill

**Files:**
- Create: `skills/skillhot-discovery/SKILL.md`, `scripts/validate-skill.mjs`, `scripts/validate-skill.test.mjs`

**Interfaces:**
- The Agent Skill is a platform-neutral Agent Skills directory; it needs only the published `skillhot` CLI.
- `validate-skill.mjs` exits zero only when the frontmatter contains a lowercase hyphenated `name`, a trigger-only `description` beginning with `Use when`, and body rules require `find`, `show`, and safe `prompt install` behavior.

- [ ] **Step 1: Establish a failing validation case**

```js
import assert from 'node:assert/strict'
import { validateSkillText } from './validate-skill.mjs'
assert.throws(() => validateSkillText('---\nname: Bad Name\ndescription: Does discovery\n---\n'), /name|description/)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/validate-skill.test.mjs`

Expected: FAIL because the validator is absent.

- [ ] **Step 3: Write the validator and Agent Skill**

```markdown
---
name: skillhot-discovery
description: Use when a coding agent needs to discover, compare, explain, or safely hand off installation of reusable Agent Skills from a vague user need.
---

# SkillHot Discovery

Run `skillhot find "<need>" --format json`, explain the returned reasons, then run `skillhot show <owner/repo>` before stating facts. For installation, run `skillhot prompt install <owner/repo> --agent <agent>` and present its upstream link and command-source label. Never execute its command without the user's explicit approval.
```

The validator must also reject SKILL.md text that lacks `skillhot find`, `skillhot show`, `skillhot prompt install`, or the phrase requiring explicit user approval before command execution.

- [ ] **Step 4: Run validator tests and validate the real Skill**

Run: `node scripts/validate-skill.test.mjs && node scripts/validate-skill.mjs skills/skillhot-discovery/SKILL.md`

Expected: test passes and the real skill is reported valid.

- [ ] **Step 5: Commit**

```bash
git add skills scripts/validate-skill.mjs scripts/validate-skill.test.mjs
git commit -m "feat: add SkillHot coding-agent skill"
```

### Task 7: Finish public-project documentation, CI, and package verification

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `LICENSE`, `DATA-LICENSE.md`
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/skill_submission.yml`
- Modify: `package.json`, `packages/core/package.json`, `packages/cli/package.json`

**Interfaces:**
- `pnpm check` runs type checking, all tests, Agent Skill validation, catalog validation, build, and packed-CLI smoke test.
- GitHub CI runs `pnpm check` on Node 20 and Node 22.
- Release workflow uses npm trusted publishing only when the package has been configured in npm; no npm token is stored in the repository.

- [ ] **Step 1: Write a failing release-gate assertion**

```sh
pnpm check
test -f LICENSE
test -f DATA-LICENSE.md
test -f .github/workflows/ci.yml
```

Expected before this task: FAIL because the project documents and quality gate are absent.

- [ ] **Step 2: Add public docs and automation**

README must document `npx skillhot`, each CLI command, TypeScript API, curl examples for every HTTP endpoint, data provenance, safety model, Agent Skill installation, update/cache location, contribution flow, and npm-release prerequisite. `DATA-LICENSE.md` must state that catalog records are discovery metadata from public upstream repositories, preserve upstream URLs, and do not relicense upstream repositories. CI must run `corepack enable`, `pnpm install --frozen-lockfile`, and `pnpm check` under Node 20 and 22.

- [ ] **Step 3: Build and test the packed artifact**

Run: `pnpm install --frozen-lockfile && pnpm check && pnpm --filter @skillhot/core pack && pnpm --filter @skillhot/cli pack && verification_dir="$(mktemp -d)" && cd "$verification_dir" && npm init -y && npm install "/absolute/path/to/packages/core/skillhot-core-0.1.0.tgz" "/absolute/path/to/packages/cli/skillhot-cli-0.1.0.tgz" && npx skillhot find "写长文" --format json`

Expected: check passes and an isolated npm project with the core tarball installed before the CLI tarball prints valid recommendation JSON. The release workflow publishes `@skillhot/core` before `@skillhot/cli`; direct installation of a CLI tarball alone is not a supported pre-publication path.

- [ ] **Step 4: Verify public repository state and push**

Run: `git status --short && git log --oneline --max-count=8 && git push origin main && gh repo view savanna0425/skillhot-cli --json url,isPrivate,licenseInfo`

Expected: clean worktree, a public repository URL, and MIT license metadata after GitHub recognizes the license file.

- [ ] **Step 5: Commit**

```bash
git add README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md LICENSE DATA-LICENSE.md .github package.json packages
git commit -m "docs: prepare public SkillHot CLI release"
```

## Plan self-review

- Scope coverage: Tasks 1–3 deliver schema, deterministic fuzzy matching, explanation, detail, comparison, alternatives, prompts, local data, and updates. Tasks 4–5 deliver CLI, JSON/Markdown, and HTTP API. Task 6 delivers the Agent Skill. Task 7 delivers public release materials and verification.
- No-placeholder check: every task names exact files, public interfaces, failing tests, commands, expected results, and a commit.
- Type consistency: `CatalogSkill`, `Catalog`, `SkillHotError`, `createDiscoveryEngine`, `refreshCatalog`, `createServer`, and the success/error envelopes are defined before their consumers.
