const DEFAULT_ENTRYPOINT = './dist/index.js';
const DEFAULT_OUTFILE = './dist/bin';
const DEFAULT_COMPILE_TARGET = 'bun-linux-x64';

/** The compile targets Bun's own type names: an operating system, an architecture, and for some a libc or a SIMD level. */
const COMPILE_TARGET_PATTERN =
  /^bun-(darwin-(x64|arm64|aarch64)(-(baseline|modern))?|linux-(x64|arm64|aarch64)(-(baseline|modern))?(-(glibc|musl))?|windows-(x64|arm64|aarch64)|windows-x64-(baseline|modern))$/;

const isCompileTarget = (value: string): value is Bun.Build.CompileTarget =>
  COMPILE_TARGET_PATTERN.test(value);

/** Bundles and compiles a single Bun executable: minified, linked sourcemaps, target read from `BUN_TARGET`. */
export class BunCompiler {
  /**
   * `plugins` is a parameter, never resolved here - `dev-configs` sits below every other IGNIS
   * package (see the Makefile chain) and must not import a plugin factory such as
   * `PlatformaticKafkaPlugins.build()` from `helpers`, which would invert that chain.
   */
  static async compile(
    opts: {
      entrypoint?: string;
      /** Bun Worker files the entrypoint starts (`new Worker('./x.worker.ts')`): compiled into the same binary. */
      workers?: string[];
      outfile?: string;
      target?: string;
      plugins?: Bun.BunPlugin[];
      /** Compile-time constants: each key is replaced by its value, a JSON-encoded expression, wherever the bundle reads it. */
      define?: Record<string, string>;
      /** Type-check the bundle first; a type error stops the compile. */
      check?: boolean;
    } = {},
  ): Promise<void> {
    const {
      entrypoint = DEFAULT_ENTRYPOINT,
      workers = [],
      outfile = DEFAULT_OUTFILE,
      target = Bun.env.BUN_TARGET ?? DEFAULT_COMPILE_TARGET,
      plugins = [],
      define = {},
      check = false,
    } = opts;

    if (!isCompileTarget(target)) {
      // eslint-disable-next-line @venizia/no-new-error -- getError would be a dev-configs -> inversion cycle
      throw new Error(
        `[BunCompiler] "${target}" is not a compile target | expected bun-<darwin|linux|windows>-<x64|arm64>, with -<baseline|modern> or, on linux, -<glibc|musl>`,
      );
    }

    const built = await Bun.build({
      entrypoints: [entrypoint, ...workers],
      target: 'bun',
      minify: { whitespace: true, syntax: true },
      sourcemap: 'linked',
      throw: false,
      compile: {
        target,
        outfile,
      },
      define,
      plugins,
      check,
    });

    if (!built.success) {
      // `getError` lives in `inversion`, which depends on `dev-configs` - importing it here would
      // create a circular workspace dependency, so a failed compile throws a plain `Error` instead.
      // eslint-disable-next-line @venizia/no-new-error -- getError would be a dev-configs -> inversion cycle
      throw new Error(
        [
          `[BunCompiler] compile failed for entrypoint "${entrypoint}":`,
          ...built.logs.map((log) => `[${log.level}] ${log.message}`),
        ].join('\n'),
      );
    }
  }
}
