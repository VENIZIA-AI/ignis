# @venizia/ignis-atlas

MCP server for IGNIS: search and read the wiki, changelogs and knowledge bundle by section, with
citations. Bun-only, zero-dependency transport beyond `zod` - a Node host cannot run this package.

Two modes, one engine: `repo` indexes a checkout in place; `snapshot` runs from the packaged
snapshot shipped with the npm release (`bunx @venizia/ignis-atlas`).

## Status

Package skeleton only. The `ignis-atlas` binary currently prints usage and exits; the index, tools
and transport land in later changes.

See the [IGNIS documentation](https://ignis.venizia.ai) for usage once published.
