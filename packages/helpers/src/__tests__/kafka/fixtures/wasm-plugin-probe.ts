import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformaticWasmPlugin } from '../../../modules/queue/kafka';

const ENTRYPOINT = 'src/__tests__/kafka/fixtures/kafka-entrypoint.ts';

const probe = async (): Promise<void> => {
  const isPluginEnabled = process.argv.includes('--plugin');
  const isCompiled = process.argv.includes('--compile');
  const outfile = join(tmpdir(), `ignis-wasm-plugin-probe-${process.pid}`);

  try {
    const built = await Bun.build({
      entrypoints: [ENTRYPOINT],
      target: 'bun',
      plugins: isPluginEnabled ? [platformaticWasmPlugin()] : [],
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
