---
name: skillhot-discovery
description: Use when a coding agent needs to discover, compare, explain, or safely hand off installation of reusable Agent Skills from a vague user need.
---

# SkillHot Discovery

Use the `skillhot` CLI already installed by the user. Installing this Agent Skill is not the same as installing the CLI; if `skillhot` is unavailable, provide the repository's source-setup instructions and stop the SkillHot lookup.

SkillHot recommendations must come only from the live SkillHot catalog at `https://skillhot.savs-ai.com/data/skills.json`, as returned by the CLI. Do not recommend local installed skills, hidden runtime skills, Superpowers sub-skills, memory, GitHub search results, or model knowledge as SkillHot results. If you mention local capabilities, label them separately from SkillHot recommendations.

1. Run `skillhot find "<need>" --format json`. Explain only the returned SkillHot entries and reasons. If no returned entry fits the need, say so and suggest a better query; do not invent a recommendation.
2. Run `skillhot show <owner/repo> --format json` before stating facts about a candidate. This is the detail step: the CLI may use the entry's `detailPath` to fetch the matching `data/details/...json` record. Prefer `projectProfile` fields when present.
3. For a requested installation, run `skillhot prompt install <owner/repo> --agent <agent>`. Present its upstream link and command-source label to the user.
4. Require explicit user approval before command execution. Never execute the returned installation command without it; a request to find, show, compare, or explain is not approval.
