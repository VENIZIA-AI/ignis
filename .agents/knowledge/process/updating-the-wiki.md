---
type: Playbook
title: Updating the wiki
description: How to change the human-facing IGNIS wiki, which is separate from this agent-facing knowledge bundle.
resource: docs/wiki
tags: [process, docs, wiki]
---

## Steps

1. Know the difference: `docs/wiki/` is the human-facing documentation site, a VitePress site built
   from markdown under `content/`. It lives at top-level `docs/wiki/` (sibling of `packages/`,
   package name `@venizia/ignis-docs`), not inside `packages/`. The MCP server that reads this same
   content is VULCAN's atlas (`@venizia/vulcan-atlas`, run in this repo as
   `bun x --no-install vulcan x atlas mcp`, registered as `atlas` in the per-machine `.mcp.json` that `vulcan sync` writes) - `docs/wiki`
   no longer ships one itself. This `.agents/knowledge/` bundle
   (what this file is part of) is a separate, agent-facing artifact - editing one does not update
   the other.
2. All prose lives under `docs/wiki/content/`: `guides/` (get started, core concepts, tutorials,
   migrations), `references/` (base API - application, dependency injection, models, repositories,
   datasources - plus `utilities/` and `configuration/`), `extensions/` (the per-component,
   per-helper and atlas references, under `extensions/components/`, `extensions/helpers/` and
   `extensions/atlas/`), `best-practices/` (architecture, testing, deployment), `changelogs/`
   (what changed for the people who use the published packages - indexed by atlas as their own
   `changelog` corpus; see [what the changelog records](#what-the-changelog-records)).
3. To add a new doc page: create the `.md` file under the right `content/` subdirectory, then add
   it to the VitePress sidebar config at `docs/wiki/site/.vitepress/config.mts` - a page that
   exists but isn't in the sidebar config is unreachable from site navigation. This is enforced,
   not merely a convention: `bun run docs:build` (and so `make docs`) runs
   `docs/wiki/scripts/check-sidebar.mts` right before the VitePress build, and it fails the build
   if any `content/**/*.md` page has no menu link, or if a menu link points at a page that no
   longer exists. The only exemptions are the template skeletons under
   `extensions/components/template/` and `extensions/helpers/template/`, and the content root
   `index.md` (the script's `UNLISTED` list). A second gate, `make wiki-links-check`, checks that
   every path the wiki and the knowledge bundle name still exists on disk. A third, `make
   wiki-anchors-check`, checks that every `#fragment` a link names resolves - the sidebar gate sees
   a dead page but not a dead anchor, so a renamed heading used to leave every link into it
   rendering fine and landing at the top of the page. It reads the ids out of the BUILT html rather
   than recomputing a slug, because VitePress does not slugify the way GitHub does: a heading like
   `Construction - Sentinel` becomes `construction-sentinel` here and `construction---sentinel`
   there, so a reimplemented slugifier both invents failures and hides real ones. That is why it
   needs a build first. Both run in `make build-all`, separately from `docs:build`.
4. Preview locally: `cd docs/wiki && bun run docs:dev` (VitePress dev server). Build the static
   site with `bun run docs:build` (`make docs` also builds it, without the dependency chain the
   other Makefile targets carry - `docs` has no prerequisite target). Clean with `bun run
   docs:clean`.
5. The built site reaches production through GitHub Pages, not through you: the
   `.github/workflows/deploy-docs.yml` workflow ("Docs") runs `make docs` and deploys
   `docs/wiki/site/.vitepress/dist`, on every push to `develop` that touches `docs/wiki/**` and on
   manual dispatch. Nothing else publishes the site - merging your page to `develop` is the deploy.
6. There is no compiled output in this package any more: `content/` is plain markdown VitePress
   reads directly, and every script under `scripts/` runs straight with `bun`, no build step. The
   `mcp-server/` directory this step used to describe is deleted; the MCP server that answers over
   this content is now `@venizia/vulcan-atlas`, built and released from the VULCAN repo (the old
   `@venizia/ignis-atlas` package is deprecated) - see the `changelog:2026-09-06-ignis-atlas` entry
   (atlas citation ids address changelogs; a bundle-style `/changelogs/...` link resolves to nothing here).
7. Style rules for anything you write in `docs/wiki/content/`: hyphen `-` only, never an em-dash or
   en-dash; the brand is always written **IGNIS**, never the mixed-case form. These are content rules, not
   visual ones - do not introduce new UI components or theme CSS for a changelog or any other page;
   change what the page says, not how the site looks.
8. This package has no entry in `package-release.yml`'s `package` input any more - the `docs-mcp`
   choice retired with the MCP server it built, and nothing replaced it (see
   [release and publish](/process/release-publish.md)). It has no compiled `dist/` either:
   `docs/wiki/package.json`'s `files` ships `content/` (minus `changelogs/`) plus `README.md` and
   `LICENSE.md` directly. Confirm the current publish path before assuming this playbook covers
   `docs/wiki`.

9. The theme folder `docs/wiki/site/.vitepress/theme/shared/` is **not edited here**. It is a
   byte-identical copy of VULCAN's wiki folder, shared by the IGNIS, ARDOR and VULCAN wikis; its
   `SHARED.json` holds the hash of every file. Change it in VULCAN (the canonical copy), then run
   from this repository's root, with VULCAN checked out next to it:
   `bun ../vulcan/scripts/wiki-shared/copy.ts . --dry-run`, then without `--dry-run`, then
   `bun ../vulcan/scripts/wiki-shared/check.ts .`. `scripts/checks/__tests__/wiki-shared.test.ts`
   (copied by hand, identical in the three repos) fails on a hand edit or an unlisted file and when a
   VitePress piece the shared CSS overrides is gone. `.gitattributes` marks the folder `-text` so git
   converts no byte. Keep `bun fmt` off it: `make lint-wiki` still checks it. What stays ours:
   `product.css`, `home-content.ts`, `design-tokens.css`, `theme/index.ts`, `config.mts`.

## What the changelog records

The changelog records only what affects the people who install and use the published `@venizia/*` packages.
Internal work is not recorded. A pull request with only internal changes gets no entry, and no guard asks for one.

**Write an entry** when a change alters what a user of the published packages sees or does:

- a new feature, API, option or config key;
- changed behaviour or a breaking change, with its upgrade step;
- a bug fix a user could hit;
- a security fix;
- a deprecation or a removal.

**Write no entry** for internal work: release tooling, CI and workflows, guards and gates; refactors and code
sweeps with no change a user can see; tests; agent rules and skills; internal docs and knowledge pages; repository
hygiene. A tool users run themselves (`devz`, a lint rule a user turns on, a codemod) is user-facing: it gets an
entry.

An entry is short and says the user's benefit first: one plain sentence, what changed, who is affected and what they
do about it, and the upgrade step of a breaking change. Several changes to one topic are one entry. The template is
`docs/wiki/content/changelogs/template.md`.

An entry is attached to the first release made on or after its date (`vulcan x atlas releases`), so date it on or
after the day the release that carries it is made.

## Related

- [Release and publish](/process/release-publish.md)
- [Docs writing style](/conventions/docs-writing-style.md)
- [Build system](/process/build-system.md)
