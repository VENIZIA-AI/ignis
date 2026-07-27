export class KafkaBundlerPluginNames {
  static readonly PLATFORMATIC_WASM = 'ignis:platformatic-wasm';
}

export class PlatformaticWasmSpecifiers {
  static readonly ENTRYPOINT = '@platformatic/wasm-utils';
  static readonly BUNDLED_ENTRYPOINT = '@platformatic/wasm-utils/bundled';
  static readonly ENTRYPOINT_FILTER = /^@platformatic\/wasm-utils$/;
}
