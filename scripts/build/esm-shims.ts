#!/usr/bin/env bun
/**
 * Gives `dist/esm` the two CommonJS locals its sources read - run from the package directory.
 *
 * The CommonJS and ESM builds compile the same source, and `import.meta` does not compile as
 * CommonJS, so a source file that needs its own location reads `__filename` or `__dirname`. Bun
 * defines both in ESM; Node does not, so the first read there threw a ReferenceError. This pass
 * declares them from `import.meta.url` at the top of each emitted ESM file that reads one without
 * declaring it.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ESM_ROOT = 'dist/esm';

const SHIM_IMPORT = "import { fileURLToPath as __shimFileURLToPath } from 'node:url';";
const SHIM_DIRNAME_IMPORT = "import { dirname as __shimDirname } from 'node:path';";

const readsLocal = (opts: { source: string; name: string }): boolean =>
  new RegExp(`(?<![\\w$.])${opts.name}(?![\\w$])`).test(opts.source) &&
  !new RegExp(`\\b(?:const|let|var)\\s+${opts.name}\\b`).test(opts.source);

/** The same source with the locals it reads declared; unchanged when it reads neither. */
export const shimEsmSource = (opts: { source: string }): string => {
  const { source } = opts;
  const needsDirname = readsLocal({ source, name: '__dirname' });
  const needsFilename = needsDirname || readsLocal({ source, name: '__filename' });
  if (!needsFilename) {
    return source;
  }

  const lines = [SHIM_IMPORT];
  if (needsDirname) {
    lines.push(SHIM_DIRNAME_IMPORT);
  }
  lines.push('const __filename = __shimFileURLToPath(import.meta.url);');
  if (needsDirname) {
    lines.push('const __dirname = __shimDirname(__filename);');
  }

  return `${lines.join('\n')}\n${source}`;
};

const listScripts = async (opts: { directory: string }): Promise<string[]> => {
  const entries = await readdir(opts.directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(opts.directory, entry.name);
      if (entry.isDirectory()) {
        return listScripts({ directory: path });
      }
      return entry.name.endsWith('.js') ? [path] : [];
    }),
  );
  return nested.flat();
};

if (import.meta.main) {
  let shimmed = 0;
  for (const path of await listScripts({ directory: ESM_ROOT })) {
    const source = await Bun.file(path).text();
    const next = shimEsmSource({ source });
    if (next !== source) {
      await Bun.write(path, next);
      shimmed += 1;
    }
  }
  console.log(`>>> dist/esm: ${shimmed} file(s) given __filename and __dirname`);
}
