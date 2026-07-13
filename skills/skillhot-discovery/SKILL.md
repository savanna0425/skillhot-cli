---
name: skillhot-discovery
description: Use when a coding agent needs to discover, compare, explain, or safely hand off installation of reusable Agent Skills from a vague user need.
---

# SkillHot Discovery

Use the `skillhot` CLI already installed by the user. If it is unavailable, provide the repository's source-setup instructions; do not attempt an installation or execute an external command.

1. Run `skillhot find "<need>" --format json`. Explain the returned reasons; do not treat search results as verified facts.
2. Run `skillhot show <owner/repo>` before stating facts about a candidate. Compare the details with the user's need.
3. For a requested installation, run `skillhot prompt install <owner/repo> --agent <agent>`. Present its upstream link and command-source label to the user.
4. Require explicit user approval before command execution. Never execute the returned installation command without it; a request to find, show, compare, or explain is not approval.
