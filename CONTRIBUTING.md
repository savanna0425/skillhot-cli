# Contributing to SkillHot

Thank you for improving SkillHot. Please keep changes small, explainable, and safe for users who may run suggestions from the catalog.

## Local setup

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` is the required release gate. It type-checks, tests, validates the Agent Skill and catalog, builds, packs both npm packages, and runs the packed CLI from a fresh temporary npm project.

## Change process

1. Open an issue for substantial behavior or catalog-policy changes before implementation.
2. Add a failing test before changing runtime behavior, then implement the smallest safe fix.
3. Run focused tests while developing and `pnpm check` before opening a pull request.
4. Describe user-visible behavior, safety impact, and verification commands in the pull request.

Do not add unreviewed third-party installation commands as authoritative. Preserve upstream URLs and command provenance. Catalog submissions use the dedicated issue form.

## Catalog and documentation

The catalog contains discovery metadata, not copied upstream skill content. Keep `sourceUrl` accurate, do not imply endorsement, and do not change upstream licensing. Update public documentation whenever commands, API responses, safety rules, or release behavior change.

By contributing, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and license your code contributions under the [MIT License](LICENSE).
