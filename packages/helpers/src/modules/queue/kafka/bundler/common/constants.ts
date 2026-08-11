export class KafkaBundlerPluginNames {
  static readonly PLATFORMATIC_WASM = 'ignis:platformatic-wasm';
  static readonly PLATFORMATIC_REQUIRE = 'ignis:platformatic-require';
}

export class PlatformaticWasmSpecifiers {
  static readonly ENTRYPOINT = '@platformatic/wasm-utils';
  static readonly BUNDLED_ENTRYPOINT = '@platformatic/wasm-utils/bundled';
  static readonly ENTRYPOINT_FILTER = /^@platformatic\/wasm-utils$/;
}

export class PlatformaticRequireSpecifiers {
  /** Modules whose module-scope `require()` calls must be hoisted to static imports. */
  static readonly MODULE_FILTER = /@platformatic[\\/]kafka[\\/]dist[\\/].*\.js$/;

  /** `const <binding> = require('<specifier>');` at module scope; anchored so a lazy `require()` nested inside a function body never matches. */
  static readonly REQUIRE_PATTERN = /^const\s+(\w+)\s*=\s*require\((['"])(.+?)\2\);?$/gm;

  /** Optional peers of `@platformatic/kafka`; a static import would break builds that do not install them. */
  static readonly SKIPPED_SPECIFIERS: readonly string[] = ['protobufjs', '@node-rs/crc32'];

  /** Prefix for the injected import bindings, namespaced to avoid colliding with upstream identifiers. */
  static readonly IMPORT_ALIAS_PREFIX = '__ignisRequire';
}
