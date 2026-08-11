import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformaticRequirePlugin } from '../../../modules/queue/kafka';

/** The plugin filters on path, so the module has to sit at a `@platformatic/kafka/dist/` path to be seen at all. */
const MODULE_DIRECTORY = join('node_modules', '@platformatic', 'kafka', 'dist');

/** Every `require()` here must survive: `protobufjs` is on the skip list, and the nested one is not at module scope. */
const MODULE_SOURCE = `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const protobuf = require('protobufjs');
export const loadLazily = () => require('some-lazy-dependency');
export const untouched = typeof protobuf;
`;

/** The bundler renames the module-scope binding, so match any callee. */
const runtimeRequirePattern = (specifier: string): RegExp =>
  new RegExp(`\\w+\\((['"])${specifier}\\1\\)`);

const probe = async (): Promise<void> => {
  const root = join(tmpdir(), `ignis-require-plugin-noop-${process.pid}`);
  const directory = join(root, MODULE_DIRECTORY);

  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'noop.js'), MODULE_SOURCE);
    writeFileSync(
      join(root, 'entry.js'),
      `export { untouched, loadLazily } from './${MODULE_DIRECTORY.split('\\').join('/')}/noop.js';\n`,
    );

    const built = await Bun.build({
      entrypoints: [join(root, 'entry.js')],
      target: 'bun',
      plugins: [platformaticRequirePlugin()],
    });

    const code = built.success ? await built.outputs[0].text() : '';

    console.log(
      JSON.stringify({
        success: built.success,
        hasSkippedRequire: runtimeRequirePattern('protobufjs').test(code),
        hasLazyRequire: runtimeRequirePattern('some-lazy-dependency').test(code),
        hasInjectedImport: code.includes('__ignisRequire'),
      }),
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

probe().catch(error => {
  console.error(error);
  process.exit(1);
});
