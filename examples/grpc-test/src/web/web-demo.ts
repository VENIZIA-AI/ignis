import { getError, HTTP } from '@venizia/ignis-helpers';
import type { Env, Hono } from 'hono';
import path from 'node:path';

const FOLDER = path.resolve(import.meta.dir, '../../dist/web');

const FILES = [
  { route: '/demo', file: 'index.html' },
  { route: '/demo/main.js', file: 'main.js' },
];

/** Serves the browser page `bun run web:build` writes, from the application's own origin: no CORS is needed. */
export class WebDemo {
  static mount<AppEnv extends Env>(opts: { server: Hono<AppEnv> }) {
    for (const { route, file } of FILES) {
      opts.server.get(route, async () => {
        const asset = Bun.file(path.join(FOLDER, file));

        const isBuilt = await asset.exists();

        if (!isBuilt) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_4.NotFound,
            message: 'The page is not built | run: bun run web:build',
          });
        }

        return new Response(asset);
      });
    }
  }
}
