import type { BunPlugin } from 'bun';
import { getError } from '@venizia/ignis-helpers';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import ts from 'typescript';
import { ArtifactIndexEmitter, ArtifactScanner, ArtifactStereotypes } from '../generator';
import { ArtifactSources } from './sources';

/** Serves `ignis:artifacts` - the application's generated index, rendered in memory from the scanner. At run time it is a virtual module (`build.module`); in `Bun.build` it is resolved and loaded (`onResolve`/`onLoad`), so a binary carries the list and never scans. */
export class IgnisArtifactsPlugin {
  static readonly NAME = 'ignis-artifacts';
  static readonly VIRTUAL = 'ignis:artifacts';
  static readonly EXPORT_NAME = 'GeneratedArtifacts';

  /** `@venizia/ignis-boot/auto`, from source or from either dist format - replaced at build time by a static re-export of the virtual module. */
  static readonly AUTO_MODULE =
    /[\\/](?:@venizia[\\/]ignis-boot|packages[\\/]boot)[\\/](?:dist[\\/](?:esm|cjs)|src)[\\/]bun[\\/]auto\.(?:ts|js)$/;

  /** A text test for a file worth parsing: `ArtifactGroup.define(`, with any spacing or line break around the dot. */
  static readonly DEFINE_CALL = /ArtifactGroup\s*\.\s*(?:define|application)\s*\(/;

  private static readonly RUNTIME_KEY = Symbol.for('@venizia/ignis-boot:artifacts-runtime-plugin');

  static {
    ArtifactSources.useScanner({ scanner: ArtifactScanner.getInstance() });
  }

  /** The `src` beside the nearest `package.json` at or above `from` (default: the entry module's directory). */
  static defaultRoot(opts: { from?: string } = {}): string {
    return ArtifactSources.packageSource({
      from: opts.from ?? IgnisArtifactsPlugin.entryDirectory(),
    });
  }

  /** The entry module's directory (`Bun.main`), so the root never depends on where the process was started; the working directory only when there is no entry file (`bun -e`, a REPL). */
  static entryDirectory(): string {
    const entry = ArtifactSources.entry();
    return entry ? dirname(entry) : process.cwd();
  }

  /** The index as module source: every import absolute, since a virtual module has no directory to resolve from. With `entry` in a compiled tree, each class is imported from that tree (`ArtifactSources.runningArtifacts`). */
  static render(opts: { root: string; entry?: string }): string {
    const root = resolve(opts.root);
    if (!existsSync(root)) {
      throw getError({
        message: `[IgnisArtifactsPlugin] ${dirname(root)} has no src directory (${root}) | Auto artifacts scan the src beside the package.json of the entry module; pass IgnisArtifactsPlugin.create({ root }), or use ArtifactGroup.application() in the application's own source`,
      });
    }
    const outFile = join(root, '__ignis_artifacts__.ts');
    const artifacts = ArtifactSources.scan({ packageSource: root });
    return ArtifactIndexEmitter.render({
      artifacts: opts.entry
        ? ArtifactSources.runningArtifacts({ artifacts, from: opts.entry })
        : artifacts,
      outFile,
      exportName: IgnisArtifactsPlugin.EXPORT_NAME,
      command: { root, out: outFile },
      absoluteImports: true,
    });
  }

  /** Rewrites every `ArtifactGroup.define({ folder: '<literal>' })` and `ArtifactGroup.application()` in a source file to carry its classes as `content`, imported by absolute path - a binary then holds each group's list and never scans. A group with no decorated class, or a call the plugin cannot read (an aliased `ArtifactGroup`, a folder that is not a string literal), fails the build. */
  static rewriteGroups(opts: { filePath: string; source: string }): string {
    const { filePath, source } = opts;
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
    const aliases = new Set<string>();
    for (const statement of sourceFile.statements) {
      const bindings = ts.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : undefined;
      for (const element of bindings && ts.isNamedImports(bindings) ? bindings.elements : []) {
        if (
          (element.propertyName ?? element.name).text === 'ArtifactGroup' &&
          element.name.text !== 'ArtifactGroup'
        ) {
          aliases.add(element.name.text);
        }
      }
    }

    const edits: Array<{ at: number; text: string }> = [];
    const imports: string[] = [];
    let counter = 0;

    const refuse = (node: ts.Node, reason: string): never => {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      throw getError({
        message: `[IgnisArtifactsPlugin] An ArtifactGroup call at ${filePath}:${line + 1} cannot be rewritten | ${reason} - write ArtifactGroup.define({ folder: '<name>' }) or ArtifactGroup.application() with the class imported under its own name`,
      });
    };

    const isCompiled = !filePath.endsWith('.ts');
    const contentLiteral = (folder: string | undefined): string => {
      const artifacts = ArtifactSources.folderArtifacts({ folder, site: filePath });
      if (artifacts.length === 0) {
        throw getError({
          message: `[IgnisArtifactsPlugin] ArtifactGroup '${folder ?? '<application>'}' resolved to no class | ${filePath} - check the folder name and that its classes carry a stereotype decorator`,
        });
      }

      const fields: string[] = [];
      for (const { type, field } of ArtifactStereotypes.EMIT_ORDER) {
        const locals = artifacts
          .filter(artifact => artifact.type === type)
          .map(artifact => {
            if (isCompiled) {
              return `require(${JSON.stringify(artifact.filePath)}).${artifact.className}`;
            }
            counter += 1;
            const local = `__ignis_group_${counter}`;
            const path = artifact.filePath.split(sep).join('/').replace(/\.ts$/, '');
            imports.push(`import { ${artifact.className} as ${local} } from '${path}';`);
            return local;
          });
        if (locals.length > 0) {
          fields.push(`${field}: [${locals.join(', ')}]`);
        }
      }
      return `{ ${fields.join(', ')} }`;
    };

    const visit = (node: ts.Node): void => {
      const isGroupCall =
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (ts.isIdentifier(node.expression.expression) ||
          ts.isPropertyAccessExpression(node.expression.expression)) &&
        (node.expression.name.text === 'define' || node.expression.name.text === 'application');
      if (!isGroupCall) {
        ts.forEachChild(node, visit);
        return;
      }

      const call = node as ts.CallExpression;
      const access = call.expression as ts.PropertyAccessExpression;
      const target = access.expression;
      const callee = ts.isIdentifier(target)
        ? target.text
        : (target as ts.PropertyAccessExpression).name.text;
      const isApplication = access.name.text === 'application';
      if (ts.isIdentifier(target) && aliases.has(callee)) {
        refuse(call, `ArtifactGroup is imported as ${callee}`);
      }
      if (callee !== 'ArtifactGroup') {
        ts.forEachChild(node, visit);
        return;
      }

      const [argument] = call.arguments;
      if (isApplication && !argument) {
        edits.push({ at: call.arguments.pos, text: `{ content: ${contentLiteral(undefined)} }` });
        return;
      }
      if (!argument || !ts.isObjectLiteralExpression(argument)) {
        refuse(call, 'the argument is not an object literal');
      }

      const literal = argument as ts.ObjectLiteralExpression;
      const named = (name: string): ts.ObjectLiteralElementLike | undefined =>
        literal.properties.find(
          entry =>
            entry.name !== undefined && ts.isIdentifier(entry.name) && entry.name.text === name,
        );
      if (named('content')) {
        return;
      }

      const folderProperty = named('folder');
      if (isApplication && folderProperty) {
        refuse(call, 'ArtifactGroup.application() takes no folder');
      }
      const folderLiteral =
        folderProperty &&
        ts.isPropertyAssignment(folderProperty) &&
        ts.isStringLiteral(folderProperty.initializer)
          ? folderProperty.initializer.text
          : undefined;
      if (!isApplication && folderLiteral === undefined) {
        refuse(call, 'folder is not a string literal');
      }

      const last = literal.properties[literal.properties.length - 1];
      edits.push({
        at: last ? last.getEnd() : literal.getStart() + 1,
        text: `${last ? ', ' : ''}content: ${contentLiteral(folderLiteral)}`,
      });
    };
    visit(sourceFile);

    let rewritten = source;
    for (const edit of [...edits].sort((left, right) => right.at - left.at)) {
      rewritten = rewritten.slice(0, edit.at) + edit.text + rewritten.slice(edit.at);
    }
    return imports.length > 0 ? `${imports.join('\n')}\n${rewritten}` : rewritten;
  }

  /** The source files that define groups: the application's own `src` and the `src` of each workspace dependency (a dependency whose real path is outside every `node_modules`), found by walking up the `node_modules` chain as Node resolution does. */
  static groupDefinitionFiles(opts: { root: string }): string[] {
    const root = resolve(opts.root);
    const packageDirectory = dirname(root);
    const manifestPath = join(packageDirectory, 'package.json');
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    });

    const sources = new Set<string>([root]);
    for (const name of names) {
      let directory = packageDirectory;
      while (true) {
        const linked = join(directory, 'node_modules', name);
        if (existsSync(linked)) {
          const real = realpathSync(linked);
          if (!real.split(sep).includes('node_modules') && existsSync(join(real, 'src'))) {
            sources.add(join(real, 'src'));
          }
          break;
        }
        const parent = dirname(directory);
        if (parent === directory) {
          break;
        }
        directory = parent;
      }
    }

    // A package that runs from its compiled tree (`main` in dist) defines its groups there too.
    const trees: Array<{ directory: string; pattern: string }> = [];
    for (const source of sources) {
      if (!existsSync(source)) {
        continue;
      }
      trees.push({ directory: source, pattern: '**/*.ts' });
      for (const entry of readdirSync(dirname(source), { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          !['src', 'node_modules'].includes(entry.name) &&
          !entry.name.startsWith('.')
        ) {
          trees.push({ directory: join(dirname(source), entry.name), pattern: '**/*.js' });
        }
      }
    }

    const files: string[] = [];
    for (const { directory, pattern } of trees) {
      for (const relativePath of new Bun.Glob(pattern).scanSync({ cwd: directory })) {
        const file = join(directory, relativePath);
        if (
          !relativePath.includes('__tests__') &&
          IgnisArtifactsPlugin.DEFINE_CALL.test(readFileSync(file, 'utf8'))
        ) {
          files.push(file);
        }
      }
    }
    return files;
  }

  /** For `Bun.build({ plugins: [IgnisArtifactsPlugin.create()] })`; `isRuntime` is set by `registerRuntime`, which serves a virtual module instead. `entry` (default: the build's first entrypoint, or `Bun.main` at run time) decides which tree the classes are imported from. */
  static create(opts: { root?: string; entry?: string; isRuntime?: boolean } = {}): BunPlugin {
    const isRuntime = opts.isRuntime ?? false;

    return {
      name: IgnisArtifactsPlugin.NAME,
      setup(build) {
        const [entrypoint] = isRuntime ? [] : build.config.entrypoints;
        const entry = opts.entry ?? (entrypoint ? resolve(entrypoint) : ArtifactSources.entry());
        const root =
          opts.root ??
          ArtifactSources.packageSource({ from: entry ? dirname(entry) : process.cwd() });
        const contents = (): string => IgnisArtifactsPlugin.render({ root, entry });

        if (isRuntime) {
          build.module(IgnisArtifactsPlugin.VIRTUAL, () => ({
            contents: contents(),
            loader: 'ts',
          }));
          return;
        }

        const virtualPath = join(resolve(root), '__ignis_artifacts__.ts');
        build.onResolve({ filter: /^ignis:artifacts$/ }, () => ({ path: virtualPath }));
        build.onLoad({ filter: /__ignis_artifacts__\.ts$/ }, () => ({
          contents: contents(),
          loader: 'ts',
        }));
        const groupFiles = IgnisArtifactsPlugin.groupDefinitionFiles({ root });
        if (groupFiles.length > 0) {
          const escaped = groupFiles.map(file => file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
          build.onLoad({ filter: new RegExp(`^(?:${escaped.join('|')})$`) }, args => ({
            contents: IgnisArtifactsPlugin.rewriteGroups({
              filePath: args.path,
              source: readFileSync(args.path, 'utf8'),
            }),
            loader: args.path.endsWith('.ts') ? 'ts' : 'js',
          }));
        }
        build.onLoad({ filter: IgnisArtifactsPlugin.AUTO_MODULE }, () => ({
          // A dynamic import: the index (and every class it imports) loads when artifacts are resolved, not when a library imports this module - a static import here evaluated the app's classes inside the importer's half-evaluated module graph.
          contents: `import { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ resolve: async () => (await import('${IgnisArtifactsPlugin.VIRTUAL}')).${IgnisArtifactsPlugin.EXPORT_NAME} });\n`,
          loader: 'ts',
        }));
      },
    };
  }

  /** Registers the run-time plugin once per process; a second call is a no-op. */
  static async registerRuntime(opts: { root?: string } = {}): Promise<void> {
    if (Reflect.get(globalThis, IgnisArtifactsPlugin.RUNTIME_KEY) === true) {
      return;
    }
    await Bun.plugin(IgnisArtifactsPlugin.create({ ...opts, isRuntime: true }));
    Reflect.set(globalThis, IgnisArtifactsPlugin.RUNTIME_KEY, true);
  }
}
