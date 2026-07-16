import { describe, expect, test } from 'bun:test';
import { formatLogMessage } from '@/modules/logger/formatters';

/**
 * Redaction lives in the logger now: any code may `logger.error('... %s', error)` with a raw
 * node-vault AxiosError, and the nested live token / AppRole secret must never render. These tests
 * pin that the deep-inspect path {@link formatLogMessage} runs its args through key-based redaction
 * before inspecting them, WITHOUT collapsing the non-secret diagnosis it was opened for.
 */
describe('formatLogMessage - secret redaction on the %s deep-inspect path', () => {
  const axiosErrorWithToken = () =>
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8200'), {
      config: {
        headers: { 'X-Vault-Token': 'live-token-must-never-log' },
        data: { ['secret_id']: 'approle-secret-must-never-log' },
      },
    });

  test('a raw AxiosError at %s renders its message but redacts the nested token', () => {
    const formatted = formatLogMessage({
      message: 'Vault call failed | error: %s',
      args: [axiosErrorWithToken()],
    });

    expect(formatted).toContain('[REDACTED]');
    expect(formatted).toContain('connect ECONNREFUSED 127.0.0.1:8200');
    expect(formatted).not.toContain('live-token-must-never-log');
    expect(formatted).not.toContain('approle-secret-must-never-log');
  });

  test('non-secret fields still render at full depth after redaction', () => {
    const formatted = formatLogMessage({
      message: 'boom %s',
      args: [{ outer: { inner: { detail: 'KEEP-ME' } }, token: 'DROP-ME' }],
    });

    expect(formatted).toContain('KEEP-ME');
    expect(formatted).toContain('[REDACTED]');
    expect(formatted).not.toContain('DROP-ME');
  });
});
