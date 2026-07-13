# SkillHot CLI

SkillHot is a local, explainable discovery tool for reusable Agent Skills. It ships a dependency-free TypeScript core, a command-line interface, a loopback HTTP API, and an Agent Skill that helps coding agents search before suggesting an installation.

## Install and run from source

`@skillhot/cli` is not published to npm yet. The current open-source release runs from this repository and requires Node.js 20 or newer:

```sh
git clone https://github.com/savanna0425/skillhot-cli.git
cd skillhot-cli
corepack enable
pnpm install --frozen-lockfile
pnpm build
alias skillhot="node $PWD/packages/cli/dist/main.js"
skillhot find "写长文" --format json
```

The executable will be named `skillhot` after the npm package is published. Until then, do not use `npx --package @skillhot/cli` or `npm install --global @skillhot/cli`.

## CLI

All commands support `--format text`, `--format markdown`, or `--format json` unless noted otherwise.

```sh
# Find ranked, explained recommendations. Filters can be combined.
skillhot find "写长文" --limit 5 --category 写作 --platform codex --license MIT --status active

# Inspect one catalog record by id, owner/repository name, or short name.
skillhot show 1073224795 --format json

# Compare two to five distinct entries.
skillhot compare 1073224795 1092041350 --format markdown

# Find related choices for an entry.
skillhot alternatives 1073224795 --limit 3

# Generate a review-first installation handoff; it never executes a third-party command.
skillhot prompt install 1073224795 --agent codex --format markdown

# Refresh the local cache from an explicit normalized catalog URL.
skillhot update --url https://example.org/catalog.json

# Start the loopback API. Non-loopback hosts require --allow-remote-host.
skillhot serve --host 127.0.0.1 --port 4318
skillhot serve --host 0.0.0.0 --allow-remote-host --port 4318

# Print, but do not run, a copy command for the bundled coding-agent skill.
skillhot skill install --agent codex --source "$PWD/skills/skillhot-discovery/SKILL.md" --format json
```

The bundled catalog is used offline. A successful `update` writes a cache at `$XDG_CACHE_HOME/skillhot/catalog.json`, or `~/.cache/skillhot/catalog.json` when `XDG_CACHE_HOME` is unset. A corrupt or missing cache falls back to the bundled data.

## TypeScript API

`@skillhot/core` exposes catalog parsing, storage helpers, normalization, and the discovery engine.

```ts
import { createDiscoveryEngine, loadCatalog } from '@skillhot/core'

const catalog = await loadCatalog({
  bundledPath: './catalog.json',
  cachePath: `${process.env.HOME}/.cache/skillhot/catalog.json`
})

const engine = createDiscoveryEngine(catalog)
const result = engine.find({ query: '写长文', limit: 5 })
console.log(result.recommendations)
```

`engine.show(ref)`, `engine.compare(refs)`, `engine.alternatives(ref, limit)`, and `engine.installPrompt({ skill, agent })` provide the remaining discovery operations. Invalid input uses `SkillHotError` with a stable `code`.

## Local HTTP API

Run `skillhot serve --port 4318` first. Successful responses use `{ data, meta }`; errors use `{ error: { code, message } }`. The server binds to `127.0.0.1` by default.

```sh
# Service status
curl --fail http://127.0.0.1:4318/health

# Recommendations and optional filters
curl --fail --get 'http://127.0.0.1:4318/v1/recommendations' \
  --data-urlencode 'q=写长文' \
  --data-urlencode 'limit=5' \
  --data-urlencode 'platform=codex'

# One skill and alternatives for it
curl --fail 'http://127.0.0.1:4318/v1/skills/1073224795'
curl --fail 'http://127.0.0.1:4318/v1/skills/1073224795/alternatives?limit=3'

# Compare entries
curl --fail http://127.0.0.1:4318/v1/compare \
  --header 'content-type: application/json' \
  --data '{"refs":["1073224795","1092041350"]}'

# Generate a review-first agent installation handoff
curl --fail http://127.0.0.1:4318/v1/agent-prompt \
  --header 'content-type: application/json' \
  --data '{"skill":"1073224795","agent":"codex"}'
```

## Safety and data policy

SkillHot is a discovery layer, not an installer. Search results are suggestions; inspect the original upstream README before relying on details. `prompt install` labels whether a command is from upstream, catalog-extracted, or unavailable, and tells the user to approve before execution. `skill install` prints a copy command only and never writes a file. Remote API binding needs explicit opt-in, and catalog updates require an explicit URL.

Catalog records are discovery metadata derived from public upstream repositories. Each record retains its upstream URL. SkillHot does not copy, redistribute, or relicense upstream repositories. See [DATA-LICENSE.md](DATA-LICENSE.md).

## Install the Agent Skill

After completing the source setup above, ask the CLI to print the destination and copy command:

```sh
skillhot skill install \
  --agent codex \
  --source "$PWD/skills/skillhot-discovery/SKILL.md"
```

Review the displayed source and command, then run the printed command yourself only if you approve it. The installed skill requires `find`, `show`, and review-first `prompt install` workflows.

## Development and contributing

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` type-checks both packages, runs all tests, validates the Agent Skill and bundled catalog, builds both packages, and installs their packed tarballs into a temporary npm project before running the CLI. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process, and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Publishing

Releases publish `@skillhot/core` before `@skillhot/cli` through npm trusted publishing. Before creating a GitHub release, configure each npm package's trusted publisher to this repository and `.github/workflows/release.yml`; both packages must already be configured in npm. The workflow uses GitHub's OIDC identity and stores no npm token. See [the npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers) for the npm-side setup.

## License

Code is available under the [MIT License](LICENSE). Catalog metadata is covered by the separate [data policy](DATA-LICENSE.md). Community participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).
