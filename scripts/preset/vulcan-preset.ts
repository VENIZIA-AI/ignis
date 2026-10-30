/**
 * Writes the publishable VULCAN presets of @venizia/ignis: presets/app (an API), presets/lib (a
 * library other IGNIS apps import) and presets/shared (a side-neutral package that apps of either
 * side import, with no IGNIS or ARDOR dependency). Each template names its dependencies the way
 * package.json does (`workspace:*`, `catalog:`); this resolves each to the exact workspace version
 * and the root catalog range, read from disk at call time, and writes packages/core-server/dist/presets.
 * Each kind is preset.json + files/; the lib and the shared kind also get the lint and format
 * configs of the app, so all kinds lint the same way. The lib and the shared kind are optional:
 * each is written only when its preset.json exists.
 * Usage: bun scripts/preset/vulcan-preset.ts
 */
import { Glob } from 'bun';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const TEMPLATE_FOLDER = 'presets';
const APP_KIND = 'app';
const LIB_KIND = 'lib';
const SHARED_KIND = 'shared';
/** The kinds written after the app, each only when its preset.json exists. */
const OPTIONAL_KINDS = [LIB_KIND, SHARED_KIND];
const OUTPUT_FOLDER = 'packages/core-server/dist/presets';
const DEPENDENCY_BLOCKS = ['dependencies', 'devDependencies', 'peers', 'peerDependencies'];
const CATALOG_MARKER = 'catalog:';
const WORKSPACE_MARKER = 'workspace:';
const FILES_FOLDER = 'files';
/** Paths of the app files a lib or shared kind takes: the lint and format configs, never the app's builders. */
const LIB_SHARED_PATHS = ['.configs/lints', '.configs/formatters'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = (opts: { file: string }): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(opts.file, 'utf8'));

  if (!isRecord(parsed)) {
    throw new Error(`[readJson] ${opts.file} is not a JSON object`);
  }

  return parsed;
};

const toStringRecord = (opts: { value: unknown }): Record<string, string> =>
  isRecord(opts.value)
    ? Object.fromEntries(
        Object.entries(opts.value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

/** The catalog of the root manifest, top level or inside object-form `workspaces`. */
const readCatalog = (opts: { manifest: Record<string, unknown> }): Record<string, string> => ({
  ...(isRecord(opts.manifest.workspaces)
    ? toStringRecord({ value: opts.manifest.workspaces.catalog })
    : {}),
  ...toStringRecord({ value: opts.manifest.catalog }),
});

/** The workspace globs of the root manifest, array form or `{ packages }` form. */
const readWorkspaceGlobs = (opts: { manifest: Record<string, unknown> }): string[] => {
  const { workspaces } = opts.manifest;
  const globs = Array.isArray(workspaces)
    ? workspaces
    : isRecord(workspaces) && Array.isArray(workspaces.packages)
      ? workspaces.packages
      : [];

  return globs.filter((glob): glob is string => typeof glob === 'string');
};

/** Package name to the version in its package.json, for every workspace package. */
const readWorkspaceVersions = (opts: {
  root: string;
  manifest: Record<string, unknown>;
}): Map<string, string> => {
  const versions = new Map<string, string>();

  for (const glob of readWorkspaceGlobs({ manifest: opts.manifest })) {
    for (const file of new Glob(`${glob}/package.json`).scanSync({ cwd: opts.root })) {
      const { name, version } = readJson({ file: join(opts.root, file) });

      if (typeof name === 'string' && typeof version === 'string') {
        versions.set(name, version);
      }
    }
  }

  return versions;
};

const resolveRange = (opts: {
  name: string;
  range: string;
  catalog: Record<string, string>;
  versions: Map<string, string>;
}): string => {
  const { name, range } = opts;

  if (range === CATALOG_MARKER) {
    const resolved = opts.catalog[name];

    if (resolved === undefined) {
      throw new Error(
        `[buildPreset] ${name} is "${CATALOG_MARKER}" but the root catalog has no entry for it`,
      );
    }

    return resolved;
  }

  if (range.startsWith(WORKSPACE_MARKER)) {
    const resolved = opts.versions.get(name);

    if (resolved === undefined) {
      throw new Error(`[buildPreset] ${name} is "${range}" but no workspace package has that name`);
    }

    return resolved;
  }

  return range;
};

export interface IBuildPresetResult {
  written: string[];
  /** One `name: marker -> value` line per dependency a marker was resolved for. */
  resolved: string[];
}

/** A template with every dependency marker resolved, and `files` pointing at its folder. */
const resolveTemplate = (opts: {
  template: Record<string, unknown>;
  filesFolder: string;
  catalog: Record<string, string>;
  versions: Map<string, string>;
  resolved: string[];
}): Record<string, unknown> => {
  const output: Record<string, unknown> = { ...opts.template, files: `./${opts.filesFolder}` };

  for (const block of DEPENDENCY_BLOCKS) {
    if (opts.template[block] === undefined) {
      continue;
    }

    output[block] = Object.fromEntries(
      Object.entries(toStringRecord({ value: opts.template[block] })).map(([name, range]) => {
        const value = resolveRange({ name, range, catalog: opts.catalog, versions: opts.versions });

        if (value !== range) {
          opts.resolved.push(`${name}: ${range} -> ${value}`);
        }

        return [name, value];
      }),
    );
  }

  return output;
};

const listFiles = (opts: { dir: string; folder: string }): string[] =>
  [...new Glob('**/*').scanSync({ cwd: join(opts.dir, opts.folder), dot: true })].map((path) =>
    join(opts.folder, path),
  );

/** Writes one kind: `<outDir>/<kind>/preset.json` and its files, returning what it wrote. */
const writeKind = (opts: {
  templateDir: string;
  outDir: string;
  kind: string;
  preset: Record<string, unknown>;
  sharedFrom?: string;
}): string[] => {
  const kindDir = join(opts.outDir, opts.kind);
  const filesDir = join(kindDir, FILES_FOLDER);

  mkdirSync(kindDir, { recursive: true });
  writeFileSync(join(kindDir, 'preset.json'), `${JSON.stringify(opts.preset, null, 2)}\n`);

  if (opts.sharedFrom !== undefined) {
    for (const path of LIB_SHARED_PATHS) {
      const source = join(opts.templateDir, opts.sharedFrom, FILES_FOLDER, path);

      if (existsSync(source)) {
        cpSync(source, join(filesDir, path), { recursive: true });
      }
    }
  }

  cpSync(join(opts.templateDir, opts.kind, FILES_FOLDER), filesDir, { recursive: true });

  return [
    join(opts.kind, 'preset.json'),
    ...listFiles({ dir: kindDir, folder: FILES_FOLDER }).map((path) => join(opts.kind, path)),
  ];
};

export const buildPreset = (opts: { root: string; outDir: string }): IBuildPresetResult => {
  const templateDir = join(opts.root, TEMPLATE_FOLDER);
  const manifest = readJson({ file: join(opts.root, 'package.json') });
  const context = {
    catalog: readCatalog({ manifest }),
    versions: readWorkspaceVersions({ root: opts.root, manifest }),
    resolved: [] as string[],
  };
  const resolveKind = (kind: string): Record<string, unknown> =>
    resolveTemplate({
      ...context,
      template: readJson({ file: join(templateDir, kind, 'preset.json') }),
      filesFolder: FILES_FOLDER,
    });

  rmSync(opts.outDir, { recursive: true, force: true });

  const written = writeKind({
    templateDir,
    outDir: opts.outDir,
    kind: APP_KIND,
    preset: resolveKind(APP_KIND),
  });

  for (const kind of OPTIONAL_KINDS) {
    if (!existsSync(join(templateDir, kind, 'preset.json'))) {
      continue;
    }

    written.push(
      ...writeKind({
        templateDir,
        outDir: opts.outDir,
        kind,
        preset: resolveKind(kind),
        sharedFrom: APP_KIND,
      }),
    );
  }

  return { written, resolved: context.resolved };
};

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..', '..');
  const outDir = join(root, OUTPUT_FOLDER);
  const { written, resolved } = buildPreset({ root, outDir });

  for (const line of resolved) {
    console.log(`  ${line}`);
  }

  console.log(`vulcan-preset: wrote ${written.length} files to ${relative(root, outDir)}`);
}
