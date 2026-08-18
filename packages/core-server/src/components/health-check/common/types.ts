export interface IHealthCheckOptions {
  /** Partially-filled bindings are accepted; every missing field falls back to its default. */
  restOptions?: { path?: string };
}
