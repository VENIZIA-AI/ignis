import { describe, expect, test } from 'bun:test';
import { formatLogMessage } from '@/modules/logger/formatters';
import { HashiCorpVaultHelper } from '@/modules/secrets/hashicorp/hashicorp.helper';
import { VaultAuthMethods } from '@/modules/secrets/common';
import type { IClock, ITimerAdapter, TTimerHandle } from '@/modules/secrets/common';

/**
 * Routes captured log calls through the REAL formatter the framework logger uses, so a test proves
 * that the raw error object the provider now passes (which exposes its enumerable
 * `config.headers['X-Vault-Token']`) is redacted by the logger's deep-inspect path before it ever
 * reaches a sink. The first arg is the `%s`-bearing message; the rest are the splat args.
 */
const formatLogArgs = ([message, ...args]: unknown[]) =>
  formatLogMessage({ message: String(message), args });

const makeCapturingLogger = () => {
  const messages: string[] = [];
  const record = (...args: unknown[]) => {
    messages.push(formatLogArgs(args));
  };
  const sink: Record<string, unknown> = {
    debug: record,
    info: record,
    warn: record,
    error: record,
    fatal: record,
  };
  sink['for'] = () => sink;
  return { messages, sink };
};

/**
 * A node-vault transport failure: an AxiosError-like object whose enumerable `config` carries the
 * live token and AppRole secret. Logging the raw object would deep-inspect and leak both.
 */
const leakyTransportError = () => {
  const data: Record<string, unknown> = {};
  data['secret_id'] = 'secret-approle';
  return Object.assign(new Error('transport failed'), {
    config: {
      headers: { 'X-Vault-Token': 'secret-tok' },
      data,
    },
  });
};

class ManualClock implements IClock {
  current = 0;
  now() {
    return this.current;
  }
}

/** Fires every registered timer on demand instead of waiting. */
class ManualTimers implements ITimerAdapter {
  private handlers = new Map<TTimerHandle, () => void>();
  private seq = 0;
  set(handler: () => void): TTimerHandle {
    const handle = ++this.seq;
    this.handlers.set(handle, handler);
    return handle;
  }
  clear(handle: TTimerHandle) {
    this.handlers.delete(handle);
  }
  get pendingCount() {
    return this.handlers.size;
  }
  async fireAll() {
    const pending = [...this.handlers.values()];
    this.handlers.clear();
    for (const handler of pending) {
      handler();
    }
    await Promise.resolve();
    await Promise.resolve();
  }
}

/** Minimal stand-in for the node-vault client surface the provider uses. */
const fakeClient = (opts?: { tokenRenewSelfBehavior?: 'succeed' | 'fail' }) => {
  // node-vault responses carry snake_case wire fields (lease_id, lease_duration, client_token,
  // ttl, renewable); built via bracket assignment so the literal keys never appear as bare
  // identifiers.
  const dynamicSecretRead: Record<string, unknown> = {
    data: { username: 'v-user-1', password: 'v-pass-1' },
    renewable: true,
  };
  dynamicSecretRead['lease_id'] = 'database/creds/role/L1';
  dynamicSecretRead['lease_duration'] = 30;

  const reads: Record<string, unknown> = {
    'secret/data/app': { data: { data: { APP_ENV_X: 'kv-value' } } },
    'database/creds/role': dynamicSecretRead,
  };

  const calls = { approleLogin: 0, tokenRenewSelf: 0, tokenLookupSelf: 0 };
  let tokenRenewSelfBehavior = opts?.tokenRenewSelfBehavior ?? 'succeed';

  const client = {
    token: '',
    calls,
    setTokenRenewSelfBehavior(behavior: 'succeed' | 'fail') {
      tokenRenewSelfBehavior = behavior;
    },
    async read(path: string) {
      return reads[path];
    },
    async write() {
      const result: Record<string, unknown> = {};
      result['lease_duration'] = 30;
      return result;
    },
    async approleLogin() {
      calls.approleLogin += 1;
      const auth: Record<string, unknown> = {};
      auth['client_token'] = 't1';
      auth['lease_duration'] = 100;
      auth['renewable'] = true;
      return { auth };
    },
    async tokenLookupSelf() {
      calls.tokenLookupSelf += 1;
      // TOKEN-method tests authenticate with a static token; report it as non-renewable so
      // scheduleTokenRenewal() stays a no-op and no real setTimeout leaks past the test.
      const data: Record<string, unknown> = {};
      data['ttl'] = 0;
      data['renewable'] = false;
      return { data };
    },
    async tokenRenewSelf() {
      calls.tokenRenewSelf += 1;
      if (tokenRenewSelfBehavior === 'fail') {
        throw new Error('renew rejected');
      }
      const auth: Record<string, unknown> = {};
      auth['lease_duration'] = 100;
      auth['renewable'] = true;
      return { auth };
    },
  };
  return client;
};

describe('HashiCorpVaultHelper', () => {
  test('getBundle unwraps KV v2 .data.data', async () => {
    const provider = new HashiCorpVaultHelper({
      endpoint: 'http://vault',
      auth: { method: VaultAuthMethods.TOKEN, token: 't' },
      client: fakeClient(),
    });
    await provider.configure();
    expect(await provider.getBundle({ path: 'secret/data/app' })).toEqual({
      APP_ENV_X: 'kv-value',
    });
  });

  test('lease reads a dynamic secret with its lease metadata', async () => {
    const provider = new HashiCorpVaultHelper({
      endpoint: 'http://vault',
      auth: { method: VaultAuthMethods.TOKEN, token: 't' },
      client: fakeClient(),
    });
    await provider.configure();
    const lease = await provider.lease({
      path: 'database/creds/role',
      key: 'datasources.postgres',
    });
    expect(lease.value).toEqual({ username: 'v-user-1', password: 'v-pass-1' });
    expect(lease.leaseId).toBe('database/creds/role/L1');
    expect(lease.renewable).toBe(true);
    await provider.shutdown();
  });

  describe('token self-renewal', () => {
    test('renewable app-role token schedules renewal and firing the timer renews in place', async () => {
      const clock = new ManualClock();
      const timers = new ManualTimers();
      const client = fakeClient();
      const provider = new HashiCorpVaultHelper({
        endpoint: 'http://vault',
        auth: { method: VaultAuthMethods.APP_ROLE, roleId: 'r', secretId: 's' },
        client,
        clock,
        timers,
      });
      await provider.configure();
      expect(client.calls.approleLogin).toBe(1);
      expect(timers.pendingCount).toBe(1);

      await timers.fireAll();

      expect(client.calls.tokenRenewSelf).toBe(1);
      expect(client.calls.approleLogin).toBe(1); // no re-auth needed
      expect(timers.pendingCount).toBe(1); // rescheduled from the renewed TTL
    });

    test('rejected tokenRenewSelf triggers re-authentication via login()', async () => {
      const clock = new ManualClock();
      const timers = new ManualTimers();
      const client = fakeClient({ tokenRenewSelfBehavior: 'fail' });
      const provider = new HashiCorpVaultHelper({
        endpoint: 'http://vault',
        auth: { method: VaultAuthMethods.APP_ROLE, roleId: 'r', secretId: 's' },
        client,
        clock,
        timers,
      });
      await provider.configure();
      expect(client.calls.approleLogin).toBe(1);

      await timers.fireAll();

      expect(client.calls.tokenRenewSelf).toBe(1);
      expect(client.calls.approleLogin).toBe(2); // re-authenticated
      expect(timers.pendingCount).toBe(1); // rescheduled from the re-auth's TTL
    });

    test('transport failures never leak the live token or secret_id into logs', async () => {
      const timers = new ManualTimers();
      const leaky = leakyTransportError();
      let approleCalls = 0;
      const client = {
        token: '',
        async read() {
          return {};
        },
        async write() {
          return {};
        },
        async approleLogin() {
          approleCalls += 1;
          if (approleCalls === 1) {
            const auth: Record<string, unknown> = {};
            auth['client_token'] = 't1';
            auth['lease_duration'] = 100;
            auth['renewable'] = true;
            return { auth };
          }
          throw leaky; // re-auth during the failed renewal also fails with a leaky error
        },
        async tokenRenewSelf() {
          throw leaky;
        },
        async tokenLookupSelf() {
          return { data: {} };
        },
      };
      const provider = new HashiCorpVaultHelper({
        endpoint: 'http://vault',
        auth: { method: VaultAuthMethods.APP_ROLE, roleId: 'r', secretId: 's' },
        client,
        timers,
      });
      await provider.configure();

      const { messages, sink } = makeCapturingLogger();
      (provider as unknown as { logger: unknown }).logger = sink;

      await timers.fireAll();

      const joined = messages.join('\n');
      expect(messages.length).toBeGreaterThan(0);
      expect(joined).not.toContain('secret-tok');
      expect(joined).not.toContain('secret-approle');
    });

    test('token renewal recovers via bounded retry when renew and re-auth both fail once', async () => {
      const timers = new ManualTimers();
      let approleCalls = 0;
      let renewCalls = 0;
      const okAuth = () => {
        const auth: Record<string, unknown> = {};
        auth['client_token'] = 't1';
        auth['lease_duration'] = 100;
        auth['renewable'] = true;
        return { auth };
      };
      const client = {
        token: '',
        async read() {
          return {};
        },
        async write() {
          return {};
        },
        async approleLogin() {
          approleCalls += 1;
          // #1 = configure login (ok); #2 = re-auth during the first failed renewal (transient blip).
          if (approleCalls === 2) {
            throw new Error('re-auth blip');
          }
          return okAuth();
        },
        async tokenRenewSelf() {
          renewCalls += 1;
          if (renewCalls === 1) {
            throw new Error('renew blip');
          }
          const auth: Record<string, unknown> = {};
          auth['lease_duration'] = 100;
          auth['renewable'] = true;
          return { auth };
        },
        async tokenLookupSelf() {
          return { data: {} };
        },
      };
      const provider = new HashiCorpVaultHelper({
        endpoint: 'http://vault',
        auth: { method: VaultAuthMethods.APP_ROLE, roleId: 'r', secretId: 's' },
        client,
        timers,
      });
      await provider.configure();
      expect(timers.pendingCount).toBe(1);

      // First fire: renew throws AND re-auth throws -> a bounded retry must be scheduled, not a dead end.
      await timers.fireAll();
      expect(renewCalls).toBe(1);
      expect(approleCalls).toBe(2);
      expect(timers.pendingCount).toBe(1);

      // Second fire (the retry): tokenRenewSelf now succeeds and the token renews in place.
      await timers.fireAll();
      expect(renewCalls).toBe(2);
      expect(timers.pendingCount).toBe(1);

      await provider.shutdown();
      expect(timers.pendingCount).toBe(0);
    });

    test('shutdown clears the token timer so it never fires', async () => {
      const clock = new ManualClock();
      const timers = new ManualTimers();
      const client = fakeClient();
      const provider = new HashiCorpVaultHelper({
        endpoint: 'http://vault',
        auth: { method: VaultAuthMethods.APP_ROLE, roleId: 'r', secretId: 's' },
        client,
        clock,
        timers,
      });
      await provider.configure();
      expect(timers.pendingCount).toBe(1);

      await provider.shutdown();
      expect(timers.pendingCount).toBe(0);

      await timers.fireAll();
      expect(client.calls.tokenRenewSelf).toBe(0);
    });
  });

  test('invalid auth configuration surfaces as an ApplicationError, not a raw ZodError', () => {
    expect(
      () =>
        new HashiCorpVaultHelper({
          endpoint: 'http://vault',
          auth: { method: 'nope' } as any,
          client: fakeClient(),
        }),
    ).toThrow(/Invalid Vault auth configuration/);
  });
});
