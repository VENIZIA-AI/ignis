// Bundles the browser client into dist/web, which the application serves at /demo.
import { getError } from '@venizia/ignis-helpers';

const result = await Bun.build({
  entrypoints: ['./clients/web/main.ts'],
  outdir: './dist/web',
  target: 'browser',
  minify: true,
});

if (!result.success) {
  throw getError({ message: `[web-build] The bundle failed | ${result.logs.join('\n')}` });
}

await Bun.write('./dist/web/index.html', Bun.file('./clients/web/index.html'));
