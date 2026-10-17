---
name: update-wiki
description: Update the IGNIS wiki (guides, references, extensions, best practices, changelogs) after a code change
user-invocable: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

# Update the IGNIS wiki

The wiki (`docs/wiki/`, package `@venizia/ignis-docs`) is what people read; `.agents/` is what agents
read. Never copy a page from one into the other. **Source code is the ground truth**: when prose and
code disagree, the prose is the bug (P-03).

`$ARGUMENTS` says what to document - `add changelog for model authorize settings`, `update the storage
helper reference`. With no arguments, ask what to document.

## Checklist

Copy this into your status message and tick each step as it passes. Order matters.

```
- [ ] 1. Code read - the changed sources in packages/*/src, not a diff, not dist/, not another doc
- [ ] 2. Page picked - edit the page that owns the topic before creating one
- [ ] 3. Page written - from template.md for a changelog
- [ ] 4. Self-review passed - every style rule below checked against the page
- [ ] 5. New page wired in - sidebar + section index
- [ ] 6. Gates green - make docs wiki-links-check wiki-anchors-check lint-wiki
```

## Where pages go

| Type | When | Where (under `docs/wiki/content/`) |
|---|---|---|
| **Changelog** | a release-worthy change - feature, breaking change, significant refactor | `changelogs/YYYY-MM-DD-slug.md` |
| **Reference** | the API surface changed | `references/<area>/` |
| **Extension** | a component or helper changed | `extensions/components/<name>/`, `extensions/helpers/<name>/` |
| **Guide** | how-to, tutorial, concept | `guides/<area>/` |
| **Best practice** | a rule or pattern people should follow | `best-practices/` |

A second page on the same subject is how the wiki drifts. A changelog starts from
`changelogs/template.md`, keeps only the sections that apply, and says what changed, who is affected
and how to migrate - it is not a commit log.

## Style rules (step 4)

The full house style is
[`.agents/knowledge/conventions/docs-writing-style.md`](../../knowledge/conventions/docs-writing-style.md).
Check the page against each rule; fix and re-check until all pass:

- [ ] The brand is **IGNIS**, always. Hyphen `-`, never an em-dash.
- [ ] No abbreviated identifiers (`Repository`, not `Repo`).
- [ ] Every code sample compiles against the real source - names and signatures verified in
      `packages/`.
- [ ] Native VitePress only - no custom components, no custom CSS.
- [ ] `**Files:**` links are GitHub file-level URLs, no line anchors.
- [ ] The first screen says what the page is and shows the first example.

`make okf-check-strict` machine-checks the brand and the dash rule only. The rest is this review.

## Wiring and gates (steps 5-6)

A new file needs two edits, or the build fails:

1. The sidebar in `docs/wiki/site/.vitepress/config.mts`.
2. The `index.md` of its section, if it has one.

Then run:

```bash
make docs wiki-links-check wiki-anchors-check lint-wiki
```

| Gate | Fails on |
|---|---|
| `make docs` | an orphan page or a dead sidebar link (`check-sidebar.mts`), then a dead link in the build |
| `wiki-links-check` | a named source path that does not exist |
| `wiki-anchors-check` | a `#fragment` that resolves nowhere (reads the build) |
| `lint-wiki` | the wiki's own scripts |

A red gate sends you back to the step that caused it. Fix it and re-run all four.

## Done

If the change also touched facts an agent reads, update the knowledge bundle in the same change
(P-03) - that is the `knowledge-sync` skill's job, not this one.

**Do not commit.** Leave the diff for the user (W-01).
