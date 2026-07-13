# Agent rules for SkillHot CLI

## Privacy is a release blocker

- Every commit in this repository must use `savanna0425 <83158499+savanna0425@users.noreply.github.com>` for both author and committer. Never use a real name, local-machine email, personal email, or another account identity.
- Configure the identity at repository scope only:

  ```sh
  git config --local user.name "savanna0425"
  git config --local user.email "83158499+savanna0425@users.noreply.github.com"
  git config --local user.useConfigOnly true
  ```

- Before every push, run `git log --format='%an <%ae> | %cn <%ce>' --all | sort -u`. Stop and repair the history while the repository is private if any value differs from the approved identity, except GitHub-created commits that already use the same noreply address.
- Never commit or publish a personal name, email address, home-directory path, host name, token, API key, browser session, private recording, or credentials. Do not echo authentication tokens in terminal output or documentation.
- Treat `rg -n -i --hidden --glob '!.git/**' 'real-name|personal-email|/Users/|token|api[_-]?key|secret' .` as a starting point for a public-release audit. Review hits in curated upstream catalog data before changing them; do not silently corrupt source metadata.

## GitHub connection and publishing

- Canonical remote: `https://github.com/savanna0425/skillhot-cli.git`. Use HTTPS; never add a remote containing credentials.
- Authentication is via the already logged-in `gh` account `savanna0425`. Verify with `gh auth status` before any GitHub write. Do not run `gh auth login` against a different account without the owner's approval.
- Check `git status -sb` and inspect the diff before staging. Stage explicit paths; never use `git add -A` in a mixed worktree.
- Use short, factual commit messages. Run the relevant check before committing and report its exact result. Never claim a check, npm publication, GitHub visibility, release, or deployment succeeded without verifying it.
- For ordinary changes, use a branch and a draft PR. Direct changes to `main`, force pushes, history rewrites, visibility changes, releases, and package publication require explicit owner authorization. A request to repair author privacy while the repository is private authorizes rewriting the affected private history and force-pushing the repaired history.
- Before changing this repository to public, verify: the history passes the identity audit, the working tree is clean, the remote contains the intended commit, no private material is tracked, tests pass in proportion to the change, and public documentation makes only verified claims.

## Product and safety boundaries

- SkillHot is a discovery layer, not a third-party installer. Search, show, compare, alternatives, and install-prompt requests never authorize execution of a recommended third-party command. Present the upstream link and command-source label, then require explicit user approval.
- Keep external catalog data attributable to its upstream repositories. Do not copy, relicense, or present catalog records as proprietary source code.
- Do not claim an npm package is published or installable until the package registry has been verified. Keep source-clone instructions accurate when publication is pending.
- Preserve user changes and unrelated dirty files. Use `apply_patch` for source/document edits; never use destructive reset or checkout operations without clear owner authorization.

## Public copy, demos, and video assets

- Public output is written only for viewers and users. Keep creator instructions, capture paths, replacement notes, source ledgers, and internal explanations in creator-only files.
- Do not fabricate tests, personal experience, performance, popularity, availability, installation success, or factual claims. Verify dynamic claims from primary sources or phrase uncertainty plainly.
- For SkillHot demonstrations, show the real flow: vague need → explained candidates → detail or comparison → review-first installation handoff. Do not portray a suggested command as automatically safe or already executed.
- When requested, use the established Sav voice chain only. Keep the narration natural, concrete, and free of generic promotional language.
