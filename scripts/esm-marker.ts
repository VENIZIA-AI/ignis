#!/usr/bin/env bun
/**
 * Writes `dist/esm/package.json` after an ESM build - run from the package directory.
 *
 * Without `"type": "module"` Node loads every `.js` there as CommonJS, fails, and parses it again as
 * ESM: measured 38.0 -> 30.7 ms to import `connectors/http`. The file also carries the package's
 * `sideEffects`, re-rooted to this directory, because a bundler reads that flag from the NEAREST
 * `package.json` - leaving it out would quietly switch tree-shaking off for every ESM consumer.
 */
interface IManifest {
  sideEffects?: boolean | Array<string>;
}

const ESM_ROOT = './dist/esm/';
const CJS_ROOT = './dist/cjs/';

const manifest: IManifest = await Bun.file('package.json').json();
const marker: { type: 'module'; sideEffects?: boolean | Array<string> } = { type: 'module' };

if (typeof manifest.sideEffects === 'boolean') {
  marker.sideEffects = manifest.sideEffects;
} else if (Array.isArray(manifest.sideEffects)) {
  // CJS paths never resolve under dist/esm; bare globs such as `*.css` keep their meaning as-is.
  marker.sideEffects = manifest.sideEffects
    .filter(path => !path.startsWith(CJS_ROOT))
    .map(path => (path.startsWith(ESM_ROOT) ? `./${path.slice(ESM_ROOT.length)}` : path));
}

await Bun.write('dist/esm/package.json', `${JSON.stringify(marker, null, 2)}\n`);
console.log(`>>> dist/esm/package.json: ${JSON.stringify(marker)}`);

export {};
