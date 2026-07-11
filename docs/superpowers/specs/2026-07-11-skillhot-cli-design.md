# SkillHot Open-Source Toolkit Design

## Purpose

Create a public, offline-first toolkit that turns the SkillHot catalog into three consistent interfaces:

1. A TypeScript library for applications and other developer tools.
2. A `skillhot` CLI for people and coding agents.
3. An Agent Skill that teaches Codex-compatible agents how to use the CLI safely.

The toolkit helps a user turn an imprecise need into a small, explained shortlist of relevant Skills. It also gives an exact project overview, usage guidance, available installation command, compatibility information, source link, and an agent-ready installation prompt.

## Scope and success criteria

Version 0.1 must provide all of the following from one shared catalog and one shared matching engine:

- Search and rank Skills from Chinese or English free-text needs.
- Filter by category, supported platform, license, active status, and collection/non-collection type.
- Explain each recommendation with matched evidence instead of an opaque score.
- Resolve a repository by `owner/repo`, display name, or exact catalog ID.
- Render a compact overview and a complete detail response.
- Generate an installation handoff prompt for Codex, Claude Code, Cursor, GitHub Copilot, OpenCode, or a generic coding agent.
- Compare two to five Skills and suggest alternatives to a selected Skill.
- Return JSON for automation and Markdown/text for people.
- Refresh a local catalog from a versioned JSON URL and continue to work with its bundled snapshot if refresh fails.
- Run a localhost HTTP API exposing the same operations as the CLI.
- Ship an Agent Skill that invokes the CLI rather than duplicating ranking or installation rules.
- Be installable from GitHub and publishable to npm without secrets.

The public package must not claim that a generic clone command is an official Skill installation method. Every installation response distinguishes an extracted repository command from an explicit upstream installation instruction and links to the upstream README.

## Non-goals for 0.1

- Hosting a managed, authenticated public API.
- Executing arbitrary third-party install commands automatically.
- Replacing upstream documentation or verifying a repository at install time.
- Using a proprietary model API for normal recommendations.
- Copying the SkillHot website UI, account data, favorites, Supabase configuration, media files, or private API keys.

## Product approaches considered

### CLI only

Fast to ship but forces API consumers and agent integrations to shell out. It also creates duplicated matching logic when a web or editor integration is added.

### Hosted API only

Makes integration simple but makes every user dependent on a service, incurs operational cost, and cannot work offline.

### Recommended: shared core with CLI, local HTTP server, and Agent Skill

`@skillhot/core` owns catalog parsing, ranking, explanations, detail rendering, comparison, and prompt generation. The CLI and localhost server are thin adapters. The Agent Skill uses the published CLI and therefore cannot drift from its behavior.

This is the selected design.

## Architecture

```text
Versioned catalog JSON ──> CatalogStore ──> DiscoveryEngine ──> formatters
                              │                   │                 │
                         local cache          ranking/explain      CLI / HTTP / SDK
                                                                    │
                                                            Agent Skill (calls CLI)
```

### Package layout

```text
packages/
  core/       catalog types, file/URL loading, matching, detail, comparison, prompts
  cli/        command parser, stdout/stderr, local HTTP server, bundled snapshot
skills/
  skillhot-discovery/  SKILL.md for coding agents
fixtures/     deliberately small catalog used by unit and CLI tests
```

The repository starts as a pnpm workspace. `@skillhot/core` has no runtime dependencies. The CLI has a single command-parser dependency only if Node's built-in parsing APIs do not provide the required help and validation ergonomics. The local HTTP server uses `node:http`.

### Catalog boundary and licensing

The upstream website's working directory and deployed data remain separate from this repository. This repository contains a small test fixture and a curated distributable snapshot made only from fields intended for public discovery: repository identity, GitHub URL, public metadata, summaries, category/scenario labels, compatibility, license, activity, upstream source links, and installation guidance.

Code is MIT. The distributable catalog carries a separate `DATA-LICENSE.md` and attribution/source note. Repository-specific licenses remain upstream licenses; they are not relicensed by this project. The updater validates schema and atomically replaces the cache only after a valid response is downloaded.

## Core data model

`CatalogSkill` is the normalized public record. Required fields are `id`, `fullName`, `name`, `url`, `summary`, `category`, `scenarios`, `platforms`, `license`, `activity`, `catalogStatus`, and `sourceUrl`. Optional fields include `description`, `howToUse`, `installCommand`, `installCommandSource`, `skillCount`, `isCollection`, `stars`, `pushedAt`, and `projectProfile`.

`Recommendation` contains the selected `CatalogSkill`, a normalized score from 0 to 100, and `reasons`. A reason has `field`, `term`, and a human-readable Chinese explanation. Ranking remains deterministic:

- Exact repository/name match: 50 points.
- Normalized query match in summary and description: up to 30 points.
- Scenario, category, and platform match: up to 25 points.
- Requested filter match: 10 points.
- Catalog score and recency are tie breakers only; they cannot rescue an irrelevant item.

Chinese matching normalizes punctuation, case, common technical spellings, and an intentionally versioned synonym dictionary. Initial synonyms cover writing/content, coding/development, research, automation, design, data analysis, security, memory/context, agent platform, and product/business concepts. Returned reasons state which field or synonym matched.

## Public interfaces

### TypeScript API

```ts
const catalog = await loadCatalog({ source: 'bundled' })
const engine = createDiscoveryEngine(catalog)
engine.find({ query: '帮我把访谈整理成长文', limit: 5, platforms: ['Codex'] })
engine.show('obra/superpowers')
engine.compare(['obra/superpowers', 'anthropics/skills'])
engine.installPrompt({ skill: 'obra/superpowers', agent: 'codex' })
```

The API returns typed values, never formatted terminal text. Invalid input is represented as a typed `SkillHotError` with an error code suitable for CLI exit codes and HTTP responses.

### CLI

```sh
skillhot find "我需要自动分析 CSV 并生成图表" --platform codex --limit 5
skillhot show obra/superpowers --format markdown
skillhot compare obra/superpowers anthropics/skills --format json
skillhot alternatives obra/superpowers --limit 5
skillhot prompt install obra/superpowers --agent codex
skillhot update --url https://…/catalog.json
skillhot serve --port 4318
```

The default output is readable Markdown-like text. `--format json` writes one valid JSON document to stdout. Diagnostics and update progress go to stderr. Query failures use nonzero exits; an empty search is successful and returns an empty array/list.

### Local HTTP API

`skillhot serve` binds to `127.0.0.1` by default. It never binds to a network interface unless `--host` is explicitly supplied.

| Method | Route | Equivalent operation |
| --- | --- | --- |
| `GET` | `/health` | service/version/data metadata |
| `GET` | `/v1/recommendations?q=&platform=&category=&limit=` | `find` |
| `GET` | `/v1/skills/:ref` | `show` |
| `GET` | `/v1/skills/:ref/alternatives?limit=` | `alternatives` |
| `POST` | `/v1/compare` | `compare` |
| `POST` | `/v1/agent-prompt` | `prompt install` |

All success responses use `{ data, meta }`; errors use `{ error: { code, message } }`. The server rejects malformed JSON, unsupported methods, unknown routes, missing `q`, invalid `limit`, and more than five comparison references with clear 4xx responses. It sets `Content-Type: application/json; charset=utf-8` and never executes a received command.

### Agent Skill

`skills/skillhot-discovery/SKILL.md` triggers when an agent needs to find or evaluate reusable Skills, answer how to install one, produce an installation handoff, or compare candidate Skills. It instructs the agent to:

1. Use `skillhot find` for an imprecise need and read the returned reasons.
2. Use `skillhot show` before making factual claims about a selected project.
3. Use `skillhot prompt install` for a coding-agent handoff.
4. Clearly label catalog-derived commands and ask the user before executing any third-party install command.
5. Cite upstream repository URLs and surface license/compatibility caveats.

The published CLI will include `skillhot skill install`, which prints the platform-neutral command and the target directories for Codex, Claude Code, Cursor, and generic Agent Skills folders; it does not silently write into an agent's configuration directory.

## Error handling and safety

- Missing catalog, invalid schema, unreadable cache, unknown skill, invalid flag, unavailable update URL, and port-in-use errors have stable error codes.
- An unsuccessful update preserves the last known good cache.
- `show` returns close-match suggestions for an unknown reference.
- Prompts quote input safely and avoid adding untrusted repository content verbatim.
- The local API has no auth because it defaults to loopback only; it includes a prominent warning when given a non-loopback host.
- CLI output never fabricates installation instructions. It states `upstream` only when the catalog field explicitly identifies that source, otherwise `catalog-extracted` or `unavailable`.

## Testing and verification

Unit tests cover normalization, synonyms, deterministic ranking, filtering, recommendation reasons, reference resolution, comparison, alternatives, installation-prompt source labeling, schema rejection, and cache atomicity. CLI integration tests cover human and JSON output, errors/exit codes, update behavior, and generated Agent Skill instructions. HTTP integration tests cover every public route, input validation, JSON response shape, loopback binding, and unknown/malformed requests.

The release gate runs type checking, unit/integration tests, package build, CLI smoke tests from the packed artifact, and validation that the Agent Skill frontmatter follows the Agent Skills specification. GitHub Actions run the same gate on Node 20 and Node 22, then use npm trusted publishing only after a manually created GitHub release.

## Documentation and release

The README presents a one-command `npx skillhot` quick start, core examples, local API examples, output/safety guarantees, data policy, installation of the Agent Skill, update instructions, and contribution/release commands. `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates, changelog, MIT code license, data license, and GitHub Actions give outside contributors a complete public project surface.

The first release is GitHub-first: source, tags, GitHub Release, and executable `npx` installation through npm. npm publication is configured but no package is published until the user supplies an npm organization/account with trusted publishing access.
