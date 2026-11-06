/**
 * Runs in a CHILD process (`bun test` on this file), started by `pinned-fetch-process.test.ts` with the environment it
 * needs: a trusted test CA (NODE_EXTRA_CA_CERTS), an HTTP_PROXY, the port of a local server. Not collected on its own:
 * the name has no `.test.`.
 */

import { describe, expect, mock, spyOn, test } from 'bun:test';

await mock.module('node:dns/promises', () => ({
  lookup: async () => [{ address: '127.0.0.1', family: 4 }],
}));

const { UrlIngest } = await import('@/modules/network/utilities/url-safety/ingest');
const { UrlPolicy } = await import('@/modules/network/utilities/url-safety/policy');
const { UrlSchemes } = await import('@/modules/network/utilities/url-safety/common/constants');

const original = UrlPolicy.isNonPublicAddress.bind(UrlPolicy);

spyOn(UrlPolicy, 'isNonPublicAddress').mockImplementation((opts) =>
  opts.address === '127.0.0.1' ? false : original(opts),
);

const port = process.env.PIN_PORT;
const policy = { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] };

describe('pinned fetch in a child process', () => {
  test.skipIf(process.env.PIN_MODE !== 'tls')(
    'https: connects to the vetted address, sends the host as SNI, verifies the certificate for it',
    async () => {
      const response = await UrlIngest.fetchGuarded({
        url: `https://${process.env.PIN_NAME}:${port}/hello`,
        policy,
      });

      const result = await response.text();
      expect(result).toBe('ok');
    },
  );

  test.skipIf(process.env.PIN_MODE !== 'tls')(
    'https: a name the certificate does not cover is refused, though the address answers',
    async () => {
      let message = '';

      try {
        await UrlIngest.fetchGuarded({ url: `https://not-in-the-cert.test:${port}/hello`, policy });
      } catch (error) {
        message = `${(error as { code?: string }).code ?? ''} ${(error as Error).message}`;
      }

      expect(message).toContain('ERR_TLS_CERT_ALTNAME_INVALID');
    },
  );

  test.skipIf(process.env.PIN_MODE !== 'proxy')(
    'an HTTP_PROXY in the environment is ignored on a pinned connection',
    async () => {
      const response = await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/hello`,
        policy,
      });

      const result2 = await response.text();
      expect(result2).toBe('direct');
    },
  );

  test.skipIf(process.env.PIN_MODE !== 'proxy')(
    'policy.proxy sends the request through that proxy, unpinned',
    async () => {
      const response = await UrlIngest.fetchGuarded({
        url: `http://hook.example.test:${port}/hello`,
        policy: { ...policy, proxy: process.env.HTTP_PROXY },
      });

      const result3 = await response.text();
      expect(result3).toBe('via-proxy');
    },
  );
});
