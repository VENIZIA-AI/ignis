# @venizia/ignis-kernel

Browser-pure kernel of the IGNIS framework: dependency injection, lifecycle, REST controllers,
repository and datasource abstractions, and the authentication and authorization seams.

No node builtin and no server-only peer, so the same kernel serves a Bun server (via
`@venizia/ignis`, which re-exports this package in full) and a browser Worker.

## Logging

A host that imports only this package gets the console fallback logger, because nothing here loads
`LoggerFactory` and installs the real resolver. Import `LoggerFactory` from `@venizia/ignis-helpers`
once at startup to get the configured logger - loggers built before that import upgrade themselves
on their next call through the resolver's generation counter, so nothing needs reconstructing.

See the [IGNIS documentation](https://ignis.venizia.ai) for usage.
