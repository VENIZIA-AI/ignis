import { BunCompiler } from '@venizia/dev-configs/compilers';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BunCompiler.compile({
  entrypoint: './src/index.ts',
  outfile: './dist/bin',
  define: await BuildInfoStamp.define(),
});
