---
name: update-wiki
description: Update the IGNIS wiki (guides, references, extensions, best practices, changelogs) after a code change
user-invocable: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

# Update the IGNIS wiki

The wiki is the human-facing VitePress site. It is one of the two homes for project information -
`.agents/` is what agents read, `docs/wiki/` is what people read. Never conflate them, and never
copy a page from one into the other.

**Source code is the ground truth.** When prose and code disagree, the code wins and the prose is a
bug (P-03).

## Arguments

`$ARGUMENTS` says what to document:

- `/update-wiki add changelog for model authorize settings`
- `/update-wiki update the storage helper reference`
- `/update-wiki add a guide for direct S3 upload`

With no arguments, ask what to document.

## Where things live

The wiki package is `@venizia/ignis-docs`, manifest at `docs/wiki/package.json`.

```
docs/wiki/
├── content/              # every page
│   ├── best-practices/   # + code-style-standards/
│   ├── changelogs/       # date-prefixed YYYY-MM-DD-slug.md, plus template.md
│   ├── extensions/       # components/, helpers/, atlas/
│   ├── guides/           # get-started/, core-concepts/, tutorials/, migrations/, reference/
│   ├── public/           # static assets
│   └── references/       # base/, utilities/, configuration/, quick-reference.md
├── scripts/              # docs-build.sh, check-sidebar.mts, docs-clean.sh
└── site/.vitepress/      # config.mts - the sidebar is hand-maintained here
```

## Process

### 1. Read the code first

Read the source files that changed. `git log --oneline -20` and `git diff` orient you, but the
current `packages/*/src` is what you document - never a diff, never `dist/`, never another doc.

Identify: what changed, why, what breaks, what the new API surface is, what a reader must do to
migrate.

### 2. Pick the page type

| Type | When | Where |
|---|---|---|
| **Changelog** | a release-worthy change - new feature, breaking change, significant refactor | `content/changelogs/YYYY-MM-DD-slug.md` |
| **Reference** | the API surface changed | `content/references/<area>/` |
| **Extension** | a component or helper changed | `content/extensions/components/<name>/` or `extensions/helpers/<name>/` |
| **Guide** | how-to, tutorial, concept | `content/guides/<area>/` |
| **Best practice** | a rule or pattern people should follow | `content/best-practices/` |

Prefer editing the page that already owns the topic. A second page on the same subject is how the
wiki drifts.

### 3. Write it

**Style is not defined here.** The house rules live in
[`.agents/knowledge/conventions/docs-writing-style.md`](../../../knowledge/conventions/docs-writing-style.md),
and `make okf-check` machine-checks two of them. The ones that fail a review fastest:

- The brand is **IGNIS**, always. Hyphen `-`, never an em-dash.
- Never abbreviate identifiers (`Repository`, not `Repo`).
- Every code sample must compile against the real source. Verify names and signatures in
  `packages/` before you write them.
- Native VitePress only - no custom components, no custom CSS.
- `**Files:**` links use GitHub file-level URLs, no line anchors. The `wiki-links-check` gate
  (`scripts/wiki-source-links.ts`) fails the build on a path that does not exist.

For a changelog, start from `content/changelogs/template.md` and delete every section that does not
apply. A changelog is user-facing: what changed, who is affected, how to migrate - not a commit log.

### 4. Wire a new page in

A new file needs two edits, or the build fails:

1. The sidebar in `docs/wiki/site/.vitepress/config.mts`.
2. The `index.md` of its section, if it has one.

`check-sidebar.mts` refuses both an orphan page (on disk, not in the sidebar) and a dead link (in
the sidebar, not on disk).

### 5. Gate it

```bash
make docs
```

That runs `docs-build.sh`, which runs `check-sidebar.mts` and then the VitePress build. Dead links
fail it. A green run prints the page and link counts.

If the change also touched facts an agent reads, update the knowledge bundle in the same change
(P-03) - that is the `knowledge-sync` skill's territory, not this one.

**Do not commit.** Leave the diff for the user (W-01).
