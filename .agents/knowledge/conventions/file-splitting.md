---
type: Convention
title: File splitting
description: When to split a long file, which axis to cut along, and the measurable signal that a split went too far.
resource: packages/core-server/src
tags: [conventions, structure, readability]
---

Length alone is not a defect. A file is too long when it serves **more than one stage of a
lifecycle**, not when it passes a line count. A wrapper around a large external API is long because
that API is large - splitting it by size makes eight files nobody can navigate instead of one file
nobody can read.

## The soft threshold

**500 lines is a prompt to explain, not a rule to obey.** Past it, the author should be able to name
the single job the file does. If naming that job needs the word "and", the file has a seam. If the
job is genuinely one thing that takes many lines - a dialect translation table, a wrapper over a wide
external surface - leave it and say so.

There is no hard cap and no lint rule. A cap produces files that satisfy the cap.

## The axis: lifecycle stage, not layer and not CRUD verb

Split a concept's folder by **what stage of its life the code serves**:

```
purchase-order/
  service.ts            thin CRUD, the way in
  base.service.ts       shared internals for the family
  ordering.service.ts   the ordering stage
  receive.service.ts    the receiving stage
  helpers.ts            pure functions
  types.ts
```

Splitting by CRUD verb instead (`create.service.ts`, `update.service.ts`) produces near-twin files:
a change to one has to be remembered in the other. Splitting by layer scatters one narrative across
the layers a reader has to reassemble.

One narrow axis worth copying on its own: **lift raw SQL out of a repository** into
`sqls/<topic>.sql.ts`, leaving the repository as pure orchestration.

## Naming

Name the piece after its **role or stage**, never after the folder it sits in and never by number:
`purchase-order/receive.service.ts`, not `purchase-order/purchase-order-receive.service.ts`.

## The signal that a split went too far

Measure coupling **among the extracted pieces**, not the parent's fan-out. Count the relative (`./`)
imports each new file makes to its siblings:

- **Zero or one per extracted piece** - the pieces are leaves. A reader opens the parent, then at
  most one leaf, and never chains from leaf to leaf.
- **Three or four per extracted piece** - the cut went through the middle of a flow rather than
  between two stages. The reader loses context the same way a long file loses it, in the other
  direction.

**The parent may import all of its pieces.** A hub with independent leaves is the intended shape;
counting the parent's imports punishes exactly the split that worked. What matters is whether the
leaves know about each other.

Reject a split that fails this check, even when every resulting file is short. When a piece would
have to call back into a sibling, do not extract it - leave it in the parent.

## Tools

- `make split-report` - hub candidates, stray `types.ts`, folders without a barrel, files over 500
  lines, cycles per package. Informational.
- `bun scripts/module-cycles.ts packages/<p>/dist/esm --max 0` - fails on an import cycle. bun turns
  cycle members into lazy initializers; a barrel over one can export `undefined`.
- `make surface-check` - the public surface equals `reference/public-surface.md`. A split that
  changes it is wrong; an intended API change runs `make surface-gen` and shows the diff in review.

A scope folder may stay without an `index.ts` on purpose when every file in it is a sub-path entry
carrying an optional peer - `core-server/connectors/{postgres,sqlite}/drivers/` is the case: each
driver file is an alias barrel for one `@venizia/ignis-connectors/<engine>/<driver>` sub-path, and a
folder-level barrel would let one `export *` pull every peer into the root. `split-report` keeps
listing these folders under "scope folders without index.ts" - that line is expected, not a defect.

## Why this is written down

Splitting on pain alone, with no stated threshold, is how a codebase accumulates files past 1500
lines: nobody is ever wrong to postpone. The threshold above exists to force the conversation early,
not to force the split.

Correctly split does not mean short. A file can serve exactly one lifecycle stage and still run past
a thousand lines. The gain is that a reader knows **which file to open** - which is the thing a long
file actually costs them.
