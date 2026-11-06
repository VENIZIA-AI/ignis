import ts from 'typescript';
import { dirname, join } from 'node:path';

/**
 * The value names a declaration file exports, and the keys its built module has at runtime. They must be
 * the same set: 0.4.8-2 shipped `PostgresErrorCodes` and `RecordUtility` as declarations that no entry
 * point exported (#913), and nothing noticed.
 */
export class ExportsParity {
  private static readonly OPTIONS: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
  };

  /** Parsed declaration files, kept across entries: the packages share the standard library and each other's declarations. */
  private static readonly sources = new Map<string, ts.SourceFile>();

  /** TS1362: "'X' cannot be used as a value because it was exported using 'export type'". */
  private static readonly TYPE_ONLY_EXPORT_CODE = 1362;

  /**
   * The names `dts` exports that exist at runtime when TypeScript is asked: classes, functions, variables,
   * enums. Interfaces and type aliases are not values. A name a barrel re-exports with `export type` is
   * not one either - TypeScript refuses it as a value (TS1362), so a probe that uses every name as a value
   * finds them.
   */
  static typedValues(opts: { dts: string }): string[] {
    const { dts } = opts;
    const probe = join(dirname(dts), '__exports_parity_probe__.ts');
    const host = ts.createCompilerHost(ExportsParity.OPTIONS);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    let probeText = '';

    host.fileExists = (file) => file === probe || fileExists(file);
    host.readFile = (file) => (file === probe ? probeText : readFile(file));
    host.getSourceFile = (file, languageVersion, onError, shouldCreate) => {
      if (file === probe) {
        return ts.createSourceFile(file, probeText, languageVersion, true);
      }

      const cached = ExportsParity.sources.get(file);

      if (cached) {
        return cached;
      }

      const parsed = getSourceFile(file, languageVersion, onError, shouldCreate);

      if (parsed) {
        ExportsParity.sources.set(file, parsed);
      }

      return parsed;
    };

    const entry = ts.createProgram([dts], ExportsParity.OPTIONS, host);
    const checker = entry.getTypeChecker();
    const module = checker.getSymbolAtLocation(entry.getSourceFile(dts)!);

    if (!module) {
      return [];
    }

    const names = checker
      .getExportsOfModule(module)
      .filter((symbol) => {
        const resolved =
          symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

        return (
          (resolved.flags & ts.SymbolFlags.Value) !== 0 &&
          (resolved.flags & ts.SymbolFlags.ValueModule) === 0
        );
      })
      .map((symbol) => symbol.name)
      .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));

    // A named import, not `entry.name`: for a type-only export TypeScript answers a property read with "does not
    // exist" but a named import used as a value with TS1362, which says what is wrong.
    probeText = [
      `import { ${names.map((name) => (name === 'default' ? 'default as __default' : name)).join(', ')} } from '${dts.replace(/\.d\.ts$/, '.js')}';`,
      ...names.map((name) => `void ${name === 'default' ? '__default' : name};`),
    ].join('\n');

    const typeOnly = new Set<string>();
    const program = ts.createProgram([probe, dts], ExportsParity.OPTIONS, host);
    const source = program.getSourceFile(probe)!;

    for (const diagnostic of program.getSemanticDiagnostics(source)) {
      if (
        diagnostic.code === ExportsParity.TYPE_ONLY_EXPORT_CODE &&
        diagnostic.start !== undefined
      ) {
        const local = probeText.slice(
          diagnostic.start,
          diagnostic.start + (diagnostic.length ?? 0),
        );

        typeOnly.add(local === '__default' ? 'default' : local);
      }
    }

    return names.filter((name) => !typeOnly.has(name));
  }

  /** The built module at `file`: its keys, and which of them hold `undefined` (a key that is there with nothing behind it is the symptom this gate exists for). */
  static async load(opts: { file: string }): Promise<{ keys: string[]; undefinedKeys: string[] }> {
    const loaded: Record<string, unknown> = await import(opts.file);
    const keys = Object.keys(loaded);

    return { keys, undefinedKeys: keys.filter((key) => loaded[key] === undefined) };
  }

  /**
   * Names typed but absent or `undefined` at runtime, and names present at runtime but untyped. A `default` the
   * runtime has and the declaration lacks is not extra: bun adds one to a CommonJS module. A typed `default` is
   * required to be defined.
   */
  static diff(opts: { typed: string[]; runtime: { keys: string[]; undefinedKeys: string[] } }): {
    missing: string[];
    extra: string[];
  } {
    const typed = new Set(opts.typed);
    const present = new Set(opts.runtime.keys);
    const undefinedKeys = new Set(opts.runtime.undefinedKeys);

    return {
      missing: opts.typed.filter((name) => !present.has(name) || undefinedKeys.has(name)).sort(),
      extra: opts.runtime.keys.filter((name) => name !== 'default' && !typed.has(name)).sort(),
    };
  }
}
