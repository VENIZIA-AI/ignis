---
type: Convention
title: Docs writing style
description: Hyphen never em-dash, the brand is always IGNIS, and the bundle is gated on it.
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

This is not just a style preference - `make okf-check` gates the knowledge bundle on it (along
with frontmatter shape, link validity, and coverage against the source inventory). A file that
violates the em-dash or brand-casing rule fails the gate before it can land. See
[build system](/process/build-system.md) for how the gate runs.

## Don't restyle the surrounding UI

Changing documentation content is in scope; changing the rendering surface is not. The wiki uses
native VitePress - no bespoke components or page-specific CSS for changelog or reference pages.
If a docs change seems to need custom UI, that is a signal to reshape the content, not to add
styling.

## Related

- [Build system](/process/build-system.md)
- [Coding style](/conventions/coding-style.md)
- [Gotchas](/conventions/gotchas.md)
