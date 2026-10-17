import type { BunPlugin } from 'bun';
import { getError } from '@venizia/ignis-helpers';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
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
    /[\\/](?:ignis-boot|boot)[\\/](?:dist[\\/](?:esm|cjs)|src)[\\/]bun[\\/]auto\.(?:ts|js)$/;

  private static readonly RUNTIME_KEY = Symbol.for('@venizia/ignis-boot:artifacts-runtime-plugin');

  /** The `src` beside the nearest `package.json` at or above `from` (default: the working directory). */
  static defaultRoot(opts: { from?: string } = {}): string {
    return ArtifactSources.packageSource(opts);
  }

  /** The index as module source: every import absolute, since a virtual module has no directory to resolve from. */
  static render(opts: { root: string }): string {
    const root = resolve(opts.root);
    const outFile = join(root, '__ignis_artifacts__.ts');
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root,
      followReexports: true,
    });
    return ArtifactIndexEmitter.render({
      artifacts,
      outFile,
      exportName: IgnisArtifactsPlugin.EXPORT_NAME,
      command: { root, out: outFile },
      absoluteImports: true,
    });
  }

  /** For `Bun.build({ plugins: [IgnisArtifactsPlugin.create()] })`; `isRuntime` is set by `registerRuntime`, which serves a virtual module instead. */
  /** Rewrites every `ArtifactGroup.define({ folder })` in a shared package's source to carry its classes as `content`, imported by absolute path - a binary then holds each group's list and never scans. A folder with no decorated class fails the build. */
  static rewriteGroups(opts: { filePath: string; source: string }): string {
    const { filePath, source } = opts;
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
    const edits: Array<{ at: number; text: string }> = [];
    const imports: string[] = [];

    const visit = (node: ts.Node): void => {
      const isDefineCall =
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'ArtifactGroup' &&
        node.expression.name.text === 'define';
      const [argument] = isDefineCall ? node.arguments : [];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const folderProperty = argument.properties.find(
          (entry): entry is ts.PropertyAssignment =>
            ts.isPropertyAssignment(entry) &&
            ts.isIdentifier(entry.name) &&
            entry.name.text === 'folder',
        );
        if (folderProperty && ts.isStringLiteral(folderProperty.initializer)) {
          const folder = folderProperty.initializer.text;
          const artifacts = ArtifactSources.folderArtifacts({ folder, site: filePath });
          if (artifacts.length === 0) {
            throw getError({
              message: `[IgnisArtifactsPlugin] ArtifactGroup '${folder}' resolved to no class | ${filePath} - check the folder name and that its classes carry a stereotype decorator`,
            });
          }

          const fields: string[] = [];
          for (const { type, field } of ArtifactStereotypes.EMIT_ORDER) {
            const locals = artifacts
              .filter(artifact => artifact.type === type)
              .map(artifact => {
                const local = `__ignis_${edits.length}_${artifact.className}`;
                const path = artifact.filePath.split(sep).join('/').replace(/\.ts$/, '');
                imports.push(`import { ${artifact.className} as ${local} } from '${path}';`);
                return local;
              });
            if (locals.length > 0) {
              fields.push(`${field}: [${locals.join(', ')}]`);
            }
          }
          edits.push({ at: argument.getEnd() - 1, text: `, content: { ${fields.join(', ')} } ` });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    let rewritten = source;
    for (const edit of [...edits].sort((a, b) => b.at - a.at)) {
      rewritten = rewritten.slice(0, edit.at).trimEnd() + edit.text + rewritten.slice(edit.at);
    }
    return imports.length > 0 ? `${imports.join('\n')}\n${rewritten}` : rewritten;
  }

  /** The source files of the application's workspace dependencies that define groups - the only files the build plugin rewrites. */
  static groupDefinitionFiles(opts: { root: string }): string[] {
    const packageDirectory = dirname(resolve(opts.root));
    const manifestPath = join(packageDirectory, 'package.json');
    if (!existsSync(manifestPath)) {
      return [];
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    });

    const files: string[] = [];
    for (const name of names) {
      const linked = join(packageDirectory, 'node_modules', name);
      const source = existsSync(linked) ? join(realpathSync(linked), 'src') : undefined;
      if (!source || !existsSync(source)) {
        continue;
      }
      for (const relativePath of new Bun.Glob('**/*.ts').scanSync({ cwd: source })) {
        const file = join(source, relativePath);
        if (
          !relativePath.includes('__tests__') &&
          readFileSync(file, 'utf8').includes('ArtifactGroup.define(')
        ) {
          files.push(file);
        }
      }
    }
    return files;
  }

  static create(opts: { root?: string; isRuntime?: boolean } = {}): BunPlugin {
    const root = opts.root ?? IgnisArtifactsPlugin.defaultRoot();
    const isRuntime = opts.isRuntime ?? false;
    const contents = (): string => IgnisArtifactsPlugin.render({ root });

    return {
      name: IgnisArtifactsPlugin.NAME,
      setup(build) {
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
            loader: 'ts',
          }));
        }
        build.onLoad({ filter: IgnisArtifactsPlugin.AUTO_MODULE }, () => ({
          contents: `import { ${IgnisArtifactsPlugin.EXPORT_NAME} } from '${IgnisArtifactsPlugin.VIRTUAL}';\nimport { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ content: ${IgnisArtifactsPlugin.EXPORT_NAME} });\n`,
          loader: 'ts',
        }));
      },
    };
  }

  /** Registers the run-time plugin once per process; a second call is a no-op. */
  static async registerRuntime(opts: { root?: string } = {}): Promise<void> {
    const registry = globalThis as Record<symbol, boolean | undefined>;
    if (registry[IgnisArtifactsPlugin.RUNTIME_KEY]) {
      return;
    }
    await Bun.plugin(IgnisArtifactsPlugin.create({ ...opts, isRuntime: true }));
    registry[IgnisArtifactsPlugin.RUNTIME_KEY] = true;
  }
}
