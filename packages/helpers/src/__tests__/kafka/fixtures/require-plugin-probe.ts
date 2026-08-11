import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformaticKafkaPlugins, platformaticWasmPlugin } from '../../../modules/queue/kafka';

const ENTRYPOINT = 'src/__tests__/kafka/fixtures/registry-entrypoint.ts';

/** Only ajv-draft-04 ships the draft-04 meta schema id, so finding it proves the module was inlined rather than left as a runtime specifier. */
const INLINED_MARKER = 'http://json-schema.org/draft-04/schema';

/** Under `minify.syntax` the module-scope binding is renamed, so the surviving bare specifier is the only reliable trace of an unresolved `require()`. */
const BARE_SPECIFIER = 'ajv-draft-04';

const probe = async (): Promise<void> => {
  const isPluginEnabled = process.argv.includes('--plugin');
  const isCompiled = process.argv.includes('--compile');
  const outfile = join(tmpdir(), `ignis-require-plugin-probe-${process.pid}`);

  try {
    const built = await Bun.build({
      entrypoints: [ENTRYPOINT],
      target: 'bun',
      // Matches the production compile settings the bare-specifier count is only valid for.
      minify: { whitespace: true, syntax: true },
      plugins: isPluginEnabled ? platformaticKafkaPlugins() : [platformaticWasmPlugin()],
      ...(isCompiled ? { compile: { outfile } } : {}),
    });

    if (!isCompiled) {
      const code = await built.outputs[0].text();
      console.log(
        JSON.stringify({
          success: built.success,
          hasBareSpecifier: code.includes(BARE_SPECIFIER),
          hasInlinedModule: code.includes(INLINED_MARKER),
        }),
      );
      return;
    }

    const executed = Bun.spawnSync([outfile]);
    console.log(
      JSON.stringify({
        success: built.success,
        exitCode: executed.exitCode,
        stdout: executed.stdout.toString().trim(),
        stderr: executed.stderr.toString().trim(),
        hasBareSpecifier: Buffer.from(await Bun.file(outfile).bytes()).includes(BARE_SPECIFIER),
      }),
    );
  } finally {
    rmSync(outfile, { force: true });
  }
};

probe().catch(error => {
  console.error(error);
  process.exit(1);
});
