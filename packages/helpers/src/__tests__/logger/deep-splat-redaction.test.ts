import { describe, expect, test } from 'bun:test';
import { formatLogMessage } from '@/modules/logger';

/** A raw node-vault AxiosError logged via `%s` must never leak its live token / AppRole secret - {@link formatLogMessage}'s deep-inspect path redacts by key before inspecting, without collapsing the diagnosis it was opened for. */
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
