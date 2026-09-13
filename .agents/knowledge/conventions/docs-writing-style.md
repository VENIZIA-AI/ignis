---
type: Convention
title: Docs writing style
description: Hyphen never em-dash, the brand is always IGNIS, and only two of the rules are machine-checked.
resource: .agents/knowledge
tags: [conventions, docs, style]
---

Rules for anything written in the wiki or in this knowledge bundle:

- **Hyphen, never em-dash or en-dash.** Use `-`. Never `—` or `–`. Apply this even mid-sentence
  where an em-dash would be the natural English choice - rewrite the sentence instead.
- **The brand is always "IGNIS"**, all caps, never `Ignis` or `ignis`. This applies in prose,
  headings, and titles alike.
- **English prose.** The bundle and wiki are English-only.
- **No version numbers.** Package versions churn on every release; a version pinned in prose goes
  stale immediately. Describe capabilities, not version-gated ones.

## Enforcement

`make okf-check` checks the first two rules and nothing else about the prose: a dash character or a
mis-cased brand fails it, alongside frontmatter shape, link validity, coverage against the source
inventory, and freshness of the generated regions. It reads prose only - code spans and fences are
stripped first, which is how this concept can name the characters it forbids.

The English-only and no-version-number rules are convention, not code. Nothing catches a version
pinned in prose, so the only check on those two is your own eye.

Nothing runs `okf-check` for you either. The pre-commit hook runs `make lint-all` and nothing more,
and the CI workflow that calls it is `workflow_dispatch` only and is not a required status check -
so running it before you land a bundle change is on the author. See
[onboarding](/overview/onboarding.md) for the commands and [build system](/process/build-system.md)
for how the Makefile targets fit together.

## Don't restyle the surrounding UI

Changing documentation content is in scope; changing the rendering surface is not. The wiki uses
native VitePress - no bespoke components or page-specific CSS for changelog or reference pages.
If a docs change seems to need custom UI, that is a signal to reshape the content, not to add
styling.

## Related

- [Build system](/process/build-system.md)
- [Coding style](/conventions/coding-style.md)
- [Gotchas](/conventions/gotchas.md)
