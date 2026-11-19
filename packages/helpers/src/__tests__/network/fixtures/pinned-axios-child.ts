/**
 * Runs in a CHILD process (`bun test` on this file), started by `pinned-axios-process.test.ts` with the environment it
 * needs: a trusted test CA (NODE_EXTRA_CA_CERTS), an HTTP_PROXY, the port of a local server. Not collected on its own:
 * the name has no `.test.`. It is the proof that `AxiosFetcher` can pin on Bun - or the reason it must refuse a guard.
 */

import { describe, expect, mock, spyOn, test } from 'bun:test';

await mock.module('node:dns/promises', () => ({
  lookup: async () => [{ address: '127.0.0.1', family: 4 }],
}));

const { UrlGuard } = await import('@/modules/network/utilities/url-safety/guard');
const { UrlPolicy } = await import('@/modules/network/utilities/url-safety/policy');
const { UrlSchemes } = await import('@/modules/network/utilities/url-safety/common/constants');
const { AxiosFetcher } = await import('@/modules/network/http-request/fetcher/axios-fetcher');

const original = UrlPolicy.isNonPublicAddress.bind(UrlPolicy);

spyOn(UrlPolicy, 'isNonPublicAddress').mockImplementation((opts) =>
  opts.address === '127.0.0.1' ? false : original(opts),
);

const port = process.env.PIN_PORT;
const guard = { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] };
const fetcher = new AxiosFetcher({ name: 'pinned-axios', guardEngine: UrlGuard });

describe('pinned axios in a child process', () => {
  test.skipIf(process.env.PIN_MODE !== 'tls')(
    'https: connects to the vetted address, sends the host as SNI, verifies the certificate for it',
    async () => {
      const response = await fetcher.get({
        url: `https://${process.env.PIN_NAME}:${port}/hello`,
        guard,
      });

      expect(response.data).toBe('ok');
    },
  );

  test.skipIf(process.env.PIN_MODE !== 'tls')(
    'https: a name the certificate does not cover is refused, though the address answers',
    async () => {
      let message = '';

      try {
        await fetcher.get({ url: `https://not-in-the-cert.test:${port}/hello`, guard });
      } catch (error) {
        message = `${Reflect.get(Object(error), 'code') ?? ''} ${(error as Error).message}`;
      }

      expect(message).toContain('ALTNAME_INVALID');
    },
  );

  test.skipIf(process.env.PIN_MODE !== 'proxy')(
    'an HTTP_PROXY in the environment is ignored on a pinned connection',
    async () => {
      const response = await fetcher.get({ url: `http://proxied.test:${port}/x`, guard });

      expect(response.data).toBe('direct');
    },
  );
});
