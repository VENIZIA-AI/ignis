import type { BunPlugin } from 'bun';
import { getError } from '@venizia/ignis-helpers';
import { existsSync, globSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
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

    const isCompiled = !ArtifactStereotypes.SOURCE_EXTENSION.test(filePath);
    const contentLiteral = (folder: string | undefined, ignore?: string[]): string => {
      const artifacts = ArtifactSources.folderArtifacts({ folder, site: filePath, ignore });
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
            const path = artifact.filePath
              .split(sep)
              .join('/')
              .replace(ArtifactStereotypes.SOURCE_EXTENSION, '');
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

      const ignoreProperty = named('ignore');
      const ignoreList =
        ignoreProperty &&
        ts.isPropertyAssignment(ignoreProperty) &&
        ts.isArrayLiteralExpression(ignoreProperty.initializer) &&
        ignoreProperty.initializer.elements.every(element => ts.isStringLiteral(element))
          ? ignoreProperty.initializer.elements.map(element => (element as ts.StringLiteral).text)
          : undefined;
      if (ignoreProperty && ignoreList === undefined) {
        refuse(call, 'ignore is not an array of string literals');
      }

      const last = literal.properties[literal.properties.length - 1];
      edits.push({
        at: last ? last.getEnd() : literal.getStart() + 1,
        text: `${last ? ', ' : ''}content: ${contentLiteral(folderLiteral, ignoreList)}`,
      });
    };
    visit(sourceFile);

    let rewritten = source;
    for (const edit of [...edits].sort((left, right) => right.at - left.at)) {
      rewritten = rewritten.slice(0, edit.at) + edit.text + rewritten.slice(edit.at);
    }
    return imports.length > 0 ? `${imports.join('\n')}\n${rewritten}` : rewritten;
  }

  /** A text test for a file worth parsing for decorated classes: an IGNIS stereotype decorator call. */
  static readonly DECORATED =
    /@(?:configuration|component|controller|service|repository|datasource|model|injectable)\s*\(/;

  /** The classes of a source file that carry an IGNIS stereotype decorator (`@service()`, `@repository(...)`, `@injectable(...)`...). */
  static decoratedClasses(opts: { filePath: string; source: string }): string[] {
    const names = new Set([
      ...Object.keys(ArtifactStereotypes.BY_DECORATOR),
      ArtifactStereotypes.ROOT_DECORATOR,
    ]);
    const sourceFile = ts.createSourceFile(
      opts.filePath,
      opts.source,
      ts.ScriptTarget.Latest,
      true,
    );
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name) {
        const isDecorated = (ts.getDecorators(node) ?? []).some(decorator => {
          const expression = ts.isCallExpression(decorator.expression)
            ? decorator.expression.expression
            : decorator.expression;
          return ts.isIdentifier(expression) && names.has(expression.text);
        });
        if (isDecorated) {
          found.push(node.name.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
  }

  /** Opens each named class with `static { Object.defineProperty(this, 'name', ...) }`. Binding keys are built from `Class.name`, and a bundler renames classes - a minifier, or Bun's scope hoisting when a registered class shadows a same-name class it extends (`StockService` becomes `StockService2`). A string literal survives both, and a static block runs before the class's decorators. Only these classes are touched; the rest of the bundle is left alone. */
  static pinClassNames(opts: {
    filePath: string;
    source: string;
    classNames: ReadonlySet<string>;
  }): string {
    const sourceFile = ts.createSourceFile(
      opts.filePath,
      opts.source,
      ts.ScriptTarget.Latest,
      true,
    );
    const positions: Array<{ at: number; name: string }> = [];
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name && opts.classNames.has(node.name.text)) {
        positions.push({ at: node.members.pos, name: node.name.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    let pinned = opts.source;
    for (const { at, name } of positions.sort((left, right) => right.at - left.at)) {
      const block = ` static { Object.defineProperty(this, 'name', { value: ${JSON.stringify(name)} }); }`;
      pinned = pinned.slice(0, at) + block + pinned.slice(at);
    }
    return pinned;
  }

  /** The classes whose names a build must pin, by the file the build loads: the app's own (from the tree `entry` runs, see `runningArtifacts`) and those of every package that defines a group the app can borrow (from the tree the group file sits in). */
  static pinnedClasses(opts: {
    root: string;
    groupFiles?: ReadonlyArray<string>;
    entry?: string;
  }): Map<string, Set<string>> {
    const byFile = new Map<string, Set<string>>();
    const add = (artifacts: ReadonlyArray<{ filePath: string; className: string }>): void => {
      for (const { filePath, className } of artifacts) {
        byFile.set(filePath, (byFile.get(filePath) ?? new Set()).add(className));
      }
    };
    const own = ArtifactSources.scan({ packageSource: opts.root });
    add(opts.entry ? ArtifactSources.runningArtifacts({ artifacts: own, from: opts.entry }) : own);
    // Every class carrying an IGNIS decorator in the workspace sources: a class nothing scans (a library that defines no group) is still an injection target, and still renamed by a bundler when its name collides.
    for (const file of IgnisArtifactsPlugin.workspaceSourceFiles({ root: opts.root })) {
      if (!ArtifactStereotypes.SOURCE_EXTENSION.test(file)) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      if (!IgnisArtifactsPlugin.DECORATED.test(source)) {
        continue;
      }
      add(
        IgnisArtifactsPlugin.decoratedClasses({ filePath: file, source }).map(className => ({
          filePath: file,
          className,
        })),
      );
    }
    for (const groupFile of opts.groupFiles ?? []) {
      const packageSource = ArtifactSources.packageSource({ from: dirname(groupFile) });
      if (packageSource === opts.root || !existsSync(packageSource)) {
        continue;
      }
      add(
        ArtifactSources.runningArtifacts({
          artifacts: ArtifactSources.scan({ packageSource }),
          from: groupFile,
        }),
      );
    }
    return byFile;
  }

  /** The source files that define groups: the application's own `src` and the `src` of each workspace dependency (a dependency whose real path is outside every `node_modules`), found by walking up the `node_modules` chain as Node resolution does. */
  static groupDefinitionFiles(opts: { root: string }): string[] {
    return IgnisArtifactsPlugin.workspaceSourceFiles(opts).filter(file =>
      IgnisArtifactsPlugin.DEFINE_CALL.test(readFileSync(file, 'utf8')),
    );
  }

  /** The source files of the application and of each workspace dependency (a dependency whose real path is outside every `node_modules`), found by walking up the `node_modules` chain as Node resolution does - plus the compiled trees beside each `src`, for a package that runs from `dist`. Tests excluded. */
  static workspaceSourceFiles(opts: { root: string }): string[] {
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
      trees.push({ directory: source, pattern: ArtifactStereotypes.SOURCE_GLOB });
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
      for (const relativePath of globSync(pattern, { cwd: directory })) {
        if (!relativePath.includes('__tests__')) {
          files.push(join(directory, relativePath));
        }
      }
    }
    return files;
  }

  /** For `Bun.build({ plugins: [IgnisArtifactsPlugin.create()] })`; `isRuntime` is set by `registerRuntime`, which serves a virtual module instead. `entry` (default: the build's first entrypoint, or `Bun.main` at run time) decides which tree the classes are imported from. */
  static create(
    opts: { root?: string; entry?: string; isRuntime?: boolean; lazyIndex?: boolean } = {},
  ): BunPlugin {
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
        const groupFileSet = new Set(groupFiles);
        const pinned = IgnisArtifactsPlugin.pinnedClasses({ root, groupFiles, entry });
        const loaded = [...new Set([...groupFiles, ...pinned.keys()])];
        if (loaded.length > 0) {
          const escaped = loaded.map(file => file.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
          build.onLoad({ filter: new RegExp(`^(?:${escaped.join('|')})$`) }, args => {
            const source = readFileSync(args.path, 'utf8');
            const grouped = groupFileSet.has(args.path)
              ? IgnisArtifactsPlugin.rewriteGroups({ filePath: args.path, source })
              : source;
            const classNames = pinned.get(args.path);
            return {
              contents: classNames
                ? IgnisArtifactsPlugin.pinClassNames({
                    filePath: args.path,
                    source: grouped,
                    classNames,
                  })
                : grouped,
              loader: args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : 'js',
            };
          });
        }
        // Lazy (a dynamic import on the first resolve) for a server: a library importing this module must not evaluate the app's classes inside its own half-loaded graph. Eager for a browser bundle: a lazily evaluated graph is not tree-shaken, which doubled a measured frontend bundle.
        const isLazy = opts.lazyIndex ?? build.config.target !== 'browser';
        const autoModule = isLazy
          ? `import { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ resolve: async () => (await import('${IgnisArtifactsPlugin.VIRTUAL}')).${IgnisArtifactsPlugin.EXPORT_NAME} });\n`
          : `import { ${IgnisArtifactsPlugin.EXPORT_NAME} } from '${IgnisArtifactsPlugin.VIRTUAL}';\nimport { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ content: ${IgnisArtifactsPlugin.EXPORT_NAME} });\n`;
        build.onLoad({ filter: IgnisArtifactsPlugin.AUTO_MODULE }, () => ({
          contents: autoModule,
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
