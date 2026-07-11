# Catalog data policy

The bundled SkillHot catalog is discovery metadata assembled from public upstream repositories and public catalog sources. It records fields such as names, summaries, categories, platforms, activity labels, and installation-command provenance to help users discover candidates.

Every catalog record preserves an upstream URL in `sourceUrl` (and the matching discovery URL in `url`). Those links identify the original repository and remain the authoritative source for the skill's code, documentation, installation instructions, licensing, and maintenance status.

The catalog does not relicense upstream repositories. Inclusion does not grant any license to upstream code, documentation, trademarks, or other materials, and does not imply endorsement. Users must read and comply with each upstream repository's license and instructions before copying, installing, or executing anything from it.

SkillHot's MIT license applies to this repository's code, not to third-party upstream repositories referenced by catalog records.
