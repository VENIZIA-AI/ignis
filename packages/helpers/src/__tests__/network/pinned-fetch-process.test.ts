/**
 * What only a real connection can show, so each case runs `fixtures/pinned-child.ts` in a child `bun test`:
 * the TLS handshake of a pinned https request (SNI and certificate verification, against a throwaway CA the child
 * trusts through NODE_EXTRA_CA_CERTS) and the environment proxy (`proxy: false` is what keeps it out; a test pins it).
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

const CHILD = join(import.meta.dir, 'fixtures', 'pinned-child.ts');
const PACKAGE_DIR = join(import.meta.dir, '..', '..', '..');
const hasOpenSsl = Bun.which('openssl') !== null;

const runChild = async (env: Record<string, string>) => {
  const child = Bun.spawn(['bun', 'test', CHILD], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { output: `${stdout}\n${stderr}`, exitCode };
};

describe('pinned https keeps SNI and certificate verification', () => {
  test.skipIf(!hasOpenSsl)(
    'the handshake names the host, the certificate is checked for it, and nothing else is trusted',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'pinned-tls-'));

      try {
        const key = join(directory, 'key.pem');
        const cert = join(directory, 'cert.pem');
        const made = Bun.spawnSync([
          'openssl',
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          key,
          '-out',
          cert,
          '-days',
          '2',
          '-subj',
          '/CN=pin.test',
          '-addext',
          'subjectAltName=DNS:pin.test',
        ]);

        expect(made.exitCode).toBe(0);

        const seen: string[] = [];
        const options = { key: readFileSync(key), cert: readFileSync(cert) };
        const server = tls.createServer(
          {
            ...options,
            ['SNICallback']: (
              name: string,
              done: (error: Error | null, context?: tls.SecureContext) => void,
            ) => {
              seen.push(`sni:${name}`);
              done(null, tls.createSecureContext(options));
            },
          },
          (socket) => {
            socket.once('data', (data) => {
              seen.push(`host:${/^host: (.*)$/im.exec(data.toString())?.[1]?.trim()}`);
              socket.end('HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok');
            });
            socket.on('error', () => {});
          },
        );

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

        try {
          const { port } = server.address() as { port: number };
          const { output, exitCode } = await runChild({
            PIN_MODE: 'tls',
            PIN_PORT: String(port),
            PIN_NAME: 'pin.test',
            NODE_EXTRA_CA_CERTS: cert,
          });

          expect(exitCode, output).toBe(0);
          expect(seen).toContain('sni:pin.test');
          expect(seen).toContain(`host:pin.test:${port}`);
        } finally {
          server.close();
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe('the environment proxy cannot undo the pin', () => {
  test('HTTP_PROXY is ignored on a pinned connection; policy.proxy opts in, unpinned', async () => {
    const proxy = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('via-proxy'),
    });
    const target = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response('direct'),
    });

    try {
      const { output, exitCode } = await runChild({
        PIN_MODE: 'proxy',
        PIN_PORT: String(target.port),
        HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
        ['http_proxy']: `http://127.0.0.1:${proxy.port}`,
        NO_PROXY: '',
        ['no_proxy']: '',
      });

      expect(exitCode, output).toBe(0);
    } finally {
      await proxy.stop(true);
      await target.stop(true);
    }
  }, 60_000);
});
