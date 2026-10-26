---
title: READMEs, Licences and the Company Name
description: "Every package README carries the Venizia credit, the root README is short, the licence files name Venizia Co., Ltd. and no longer acknowledge other frameworks. Ships in 0.4.4."
packages:
  [
    '@venizia/dev-configs',
    '@venizia/ignis-inversion',
    '@venizia/ignis-filter',
    '@venizia/ignis-helpers',
    '@venizia/ignis-boot',
    '@venizia/ignis-kernel',
    '@venizia/ignis-connectors',
    '@venizia/ignis-worker',
    '@venizia/ignis',
  ]
---

# Changelog - 2026-10-26

## READMEs, licences and the company name

<Badge type="tip" text="Enhancement" />

**In one line.** The text that ships in each package tarball changed: a credit line in every README, a shorter root README, and licence files that name the company correctly. Ships in 0.4.4.

## What changed

- **Credit.** Every package README ends with the Venizia logo and a link to venizia.ai.
- **Root README.** It is short now: the logo in the title, a get-started block with the real first controller, six bullets on what you get, the nine packages, and how to contribute. The examples table and the built-on table moved to `examples/README.md` and the wiki.
- **Licences.** `LICENSE.md` of the repository and of every package reads "Copyright (c) 2025 Venizia Co., Ltd." (it said "VENIZIA Ltd. Co."). The acknowledgments of LoopBack 4, NestJS and InversifyJS are gone; the MIT text is unchanged.

## Who is affected

- **You read the README or the licence of a package.** Nothing to do. The licence terms did not change.
- **You redistribute IGNIS.** The licence is the same MIT licence; only the copyright line and the acknowledgment list changed.
