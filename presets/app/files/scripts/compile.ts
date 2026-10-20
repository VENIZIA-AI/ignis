import { BunCompiler } from '@venizia/dev-configs/compilers';
import { IgnisArtifactsPlugin } from '@venizia/ignis-boot/bun';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BunCompiler.compile({
  entrypoint: './src/index.ts',
  outfile: './dist/bin',
  plugins: [IgnisArtifactsPlugin.create()],
  define: await BuildInfoStamp.define(),
});
