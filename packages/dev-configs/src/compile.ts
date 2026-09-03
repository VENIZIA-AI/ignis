const DEFAULT_ENTRYPOINT = "./dist/index.js";
const DEFAULT_OUTFILE = "./dist/bin";
const DEFAULT_COMPILE_TARGET = "bun-linux-x64";

/** Bundles and compiles a single Bun executable: minified, linked sourcemaps, target read from `BUN_TARGET`. */
export class BunCompiler {
  /**
   * `plugins` is a parameter, never resolved here - `dev-configs` sits below every other IGNIS
   * package (see the Makefile chain) and must not import a plugin factory such as
   * `platformaticKafkaPlugins()` from `helpers`, which would invert that chain.
   */
  static async compile(
    opts: {
      entrypoint?: string;
      outfile?: string;
      target?: string;
      plugins?: Bun.BunPlugin[];
    } = {},
  ): Promise<void> {
    const {
      entrypoint = DEFAULT_ENTRYPOINT,
      outfile = DEFAULT_OUTFILE,
      target = Bun.env.BUN_TARGET ?? DEFAULT_COMPILE_TARGET,
      plugins = [],
    } = opts;

    const built = await Bun.build({
      entrypoints: [entrypoint],
      target: "bun",
      minify: { whitespace: true, syntax: true },
      sourcemap: "linked",
      throw: false,
      compile: {
        // `target` is read from an environment variable at runtime, so it cannot be checked against Bun's literal union at compile time.
        target: target as Bun.Build.CompileTarget,
        outfile,
      },
      plugins,
    });

    if (!built.success) {
      // `getError` lives in `inversion`, which depends on `dev-configs` - importing it here would
      // create a circular workspace dependency, so a failed compile throws a plain `Error` instead.
      throw new Error(
        [
          `[BunCompiler] compile failed for entrypoint "${entrypoint}":`,
          ...built.logs.map((log) => `[${log.level}] ${log.message}`),
        ].join("\n"),
      );
    }
  }
}
