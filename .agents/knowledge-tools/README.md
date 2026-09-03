# knowledge-tools

Generator, conformance gate, MCP server, and graph explorer for the IGNIS knowledge bundle at
`.agents/knowledge/`. Zero runtime dependencies - plain Bun scripts plus vendored Cytoscape for the
explorer.

## Commands

Run via make (preferred) or directly with Bun.

| Make | Direct | What it does |
|---|---|---|
| `make okf-gen` | `bun .agents/knowledge-tools/okf.ts gen` | Regenerate all source-derived content |
| `make okf-check` | `bun .agents/knowledge-tools/okf.ts check` | Gate: frontmatter, links, structural coverage, freshness |
| `make okf-coverage` | `bun .agents/knowledge-tools/okf.ts coverage` | Report the bundle against the source inventory |
| `make okf-viz` | `bun .agents/knowledge-tools/okf.ts viz` | Build the offline graph explorer |
| - | `bun .agents/knowledge-tools/okf.ts mcp` | Serve the bundle over MCP stdio |

`okf-check` exits non-zero on any problem. It is deliberately **not** wired into `.githooks/pre-commit`:
the curated concepts only stay honest when someone re-reads the code, which a per-commit gate cannot
do. Freshness is maintained by running knowledge sync periodically instead.

`coverage --min <n>` fails when structural coverage is below `<n>` percent. `--min 0` means 0.

## Files

| File | Role |
|---|---|
| `config.ts` | **The only repo-specific file.** Paths, denylists, section order/labels, MCP server name. |
| `okf.ts` | CLI. Source scanning, shared heuristics, renderers, `gen`/`check`/`coverage`. |
| `lib.ts` | Bundle loader: frontmatter parsing, link extraction, concept model. |
| `mcp.ts` | MCP stdio server (`okf_list_concepts`, `okf_get_concept`, `okf_search`). |
| `viz.ts` | Builds `.agents/knowledge/viz.html` from the vendored libs in `vendor/`. |

Porting this tooling to another repo should mean editing `config.ts` and the renderer list in
`okf.ts`, nothing else.

## What is generated vs hand-authored

Two mechanisms, both driven from source. Never hand-edit either.

1. **Whole generated files** - the `RENDERERS` registry in `okf.ts` writes `reference/*.md`.
2. **Managed regions** - the `REGIONS` registry replaces content between
   `<!-- okf:generated:<id> start -->` and `<!-- okf:generated:<id> end -->` inside an otherwise
   hand-authored file.

Everything else in the bundle is hand-authored and never touched by `gen`.

Generated frontmatter deliberately carries no `timestamp:` - it is optional in OKF, and a fixed
value is both untrue and a source of churn.

## Adding a renderer

1. Write a `collect*` function that extracts the fact from source.
   **Use it for both the renderer and the coverage counter** - do not write a second heuristic for
   the same fact, or the two drift apart and the numbers disagree.
2. Write a `render*` returning `{ path, content }` and add it to `RENDERERS`.
3. Run `make okf-gen`, then `make okf-check` twice: it must pass and be idempotent.

## Conventions

Bundle content follows the repo docs rules: hyphen not em-dash, the brand is always **IGNIS**,
English prose, links are bundle-absolute (`](/packages/core-server.md)`). Links inside code fences are
examples and are ignored by both the link checker and the graph builder.
