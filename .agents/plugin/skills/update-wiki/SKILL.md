---
name: update-wiki
description: Update IGNIS framework wiki documentation (changelogs, references, guides) based on recent code changes
user-invocable: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

# Update Wiki Documentation

You are updating the Ignis framework wiki at `packages/docs/wiki/`.

## Arguments

`$ARGUMENTS` tells you what to document. Examples:
- `/update-wiki add changelog for model authorize settings` — create a changelog
- `/update-wiki update authorization reference docs` — update existing reference
- `/update-wiki add guide for model authorization setup` — create a guide

If no arguments, ask what to document.

## Wiki Structure

```
packages/docs/wiki/
├── changelogs/          # Date-prefixed: YYYY-MM-DD-slug.md
├── guides/
│   ├── get-started/
│   ├── core-concepts/
│   └── tutorials/
├── references/          # API docs organized by package/module
│   ├── base/
│   ├── components/
│   ├── helpers/
│   └── utilities/
└── best-practices/
```

## Process

### 1. Understand the changes

- Read the relevant source files that were changed
- Use `git diff develop` or `git log --oneline -20` to understand recent changes
- Identify: what changed, why, breaking changes, new APIs, migration steps

### 2. Determine doc type

| Type | When | Naming |
|------|------|--------|
| **Changelog** | New feature, breaking change, significant refactor | `changelogs/YYYY-MM-DD-slug.md` |
| **Reference** | New/updated API surface | `references/<category>/file.md` |
| **Guide** | How-to, tutorial, concept explanation | `guides/<category>/file.md` |

### 3. Write the documentation

#### For changelogs

Follow the template at `packages/docs/wiki/changelogs/template.md`. Key sections:
- Frontmatter with title and description
- Overview bullet points
- Breaking Changes (with before/after code)
- New Features (with problem/solution/example/benefits)
- Files Changed table
- Migration Guide (if breaking)
- "No Breaking Changes" section (if none)

Only include sections that apply. Remove empty template sections.

#### For references

- Start with a brief description of what the module does
- Document every public interface, class, method, decorator
- Include TypeScript signatures
- Add usage examples
- Document options objects with all fields

#### For guides

- Start with what the reader will learn
- Step-by-step instructions
- Complete, runnable code examples
- Link to relevant reference docs

### 4. Update sidebar (if new file)

If you created a new doc file, update the VitePress sidebar config:

**File:** `packages/docs/site/.vitepress/config.mts`

Add the new page to the appropriate sidebar section.

### 5. Update index pages

If the doc belongs to a category with an `index.md`, add a link to the new doc there.

## Style Rules

- Use TypeScript for all code examples
- Use Ignis import paths (`@venizia/ignis`, `@venizia/ignis-helpers`)
- Match the technical depth of existing docs — direct, no hand-holding
- Use GitHub-flavored markdown alerts: `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`
- Tables for structured comparisons (files changed, API surfaces, config options)
- Before/after code blocks for breaking changes
- Keep frontmatter `title` under 80 chars, `description` under 160 chars
