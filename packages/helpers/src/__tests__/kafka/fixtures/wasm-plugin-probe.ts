import type { BunPlugin } from 'bun';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformaticKafkaPlugins, platformaticWasmPlugin } from '../../../modules/queue/kafka';

const ENTRYPOINT = 'src/__tests__/kafka/fixtures/kafka-entrypoint.ts';

/** `--all` registers the full plugin set: a binary needs every one of them to boot, so the wasm plugin alone cannot carry the boot case. */
const resolvePlugins = (): BunPlugin[] => {
  if (process.argv.includes('--all')) {
    return platformaticKafkaPlugins();
  }

  return process.argv.includes('--plugin') ? [platformaticWasmPlugin()] : [];
};

const probe = async (): Promise<void> => {
  const isCompiled = process.argv.includes('--compile');
  const outfile = join(tmpdir(), `ignis-wasm-plugin-probe-${process.pid}`);

  try {
    const built = await Bun.build({
      entrypoints: [ENTRYPOINT],
      target: 'bun',
      plugins: resolvePlugins(),
      ...(isCompiled ? { compile: { outfile } } : {}),
    });

    if (!isCompiled) {
      const code = await built.outputs[0].text();
      console.log(
        JSON.stringify({
          success: built.success,
          hasOnDiskWasmRead: code.includes('native.wasm'),
          hasInlinedWasm: code.includes('atob'),
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
