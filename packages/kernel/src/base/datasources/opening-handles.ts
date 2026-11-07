/**
 * The key under which the application boot asks a datasource for the handles of its open. A symbol, not a public method, and
 * deliberately NOT exported from the package: `opening` must exist only as the argument of `configure()`, so no other code can
 * reach the connector, the client or a transaction while the datasource is still opening (a request could then query before the
 * migrations ran). The kernel's own boot imports this file by path; a consumer cannot name the symbol.
 */
export const OPENING_HANDLES = Symbol('@venizia/ignis-kernel:datasource-opening-handles');
