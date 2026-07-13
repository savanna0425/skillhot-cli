# Contributor guidance

## Privacy and release safety

- Use your own Git identity. Prefer your GitHub noreply address and enable `user.useConfigOnly`; never impersonate a maintainer or commit a real name, personal email, machine name, home-directory path, token, API key, browser session, or credentials.
- Use HTTPS remotes without embedded credentials. Verify the active GitHub account before a remote write and never paste authentication tokens into a file, command output, issue, or pull request.
- Inspect `git status` and the relevant diff before staging. Stage explicit paths and preserve unrelated work.
- Force pushes, history rewrites, repository visibility changes, releases, package publication, and other material external actions require explicit maintainer authorization.
- Before making a release public, audit tracked files and reachable history for personal information and secrets. Review third-party catalog data before changing it so source metadata is not silently corrupted.

## Product boundaries

- SkillHot is a discovery layer, not a third-party installer. A search, comparison, or installation-prompt request does not authorize execution of a recommended command.
- Present the upstream link and command-source label, then require explicit user approval before executing an installation command.
- Keep catalog records attributable to their upstream repositories. Do not claim an npm package is published until the registry confirms it.

## Quality and public copy

- Run the relevant verification before claiming code, CI, deployment, release, or repository state is successful.
- Public documentation and demos should describe observable behavior. Keep internal capture notes, source ledgers, production instructions, and private rationale out of the public repository.
