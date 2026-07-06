import { describe, test, expect } from 'bun:test';
import { AuthorizeComponent } from '@/components/auth/authorize/component';
import { AuthorizeBindingKeys } from '@/components/auth/authorize/common/keys';
import type { IAuthorizeOptions } from '@/components/auth/authorize/common/types';
import type { BaseApplication } from '@/base/applications/base';

/**
 * The legacy component.test.ts never constructs AuthorizeComponent nor invokes
 * binding(), so component.ts measured 0% func / 15% line. These tests build a
 * fake application exposing only the two methods the component touches —
 * `.get()` and `.bind().toValue()` — and exercise binding() directly.
 */

type TBindCall = { key: string; value: unknown };

const createFakeApplication = (opts: {
  options?: IAuthorizeOptions;
}): { application: BaseApplication; binds: TBindCall[] } => {
  const binds: TBindCall[] = [];

  const application = {
    get<T>(getOpts: { key: string; isOptional?: boolean }): T | undefined {
      if (getOpts.key === AuthorizeBindingKeys.OPTIONS) {
        return opts.options as T;
      }
      return undefined;
    },
    bind<T>(bindOpts: { key: string }) {
      return {
        toValue: (value: T) => {
          binds.push({ key: bindOpts.key, value });
        },
      };
    },
    // Only .get()/.bind() are exercised by binding() — the full BaseApplication surface
    // (Hono server, DI container, lifecycle hooks) is out of scope for this unit test.
  } as BaseApplication;

  return { application, binds };
};

describe('AuthorizeComponent.binding()', () => {
  test('throws getError when no options are bound', () => {
    const { application } = createFakeApplication({ options: undefined });
    const component = new AuthorizeComponent(application);

    expect(() => component.binding()).toThrow(/No authorize options found/);
  });

  test('does NOT bind always-allow-roles when alwaysAllowRoles is absent', () => {
    const { application, binds } = createFakeApplication({
      options: { defaultDecision: 'deny' },
    });
    const component = new AuthorizeComponent(application);

    component.binding();

    expect(binds).toHaveLength(0);
  });

  test('does NOT bind always-allow-roles when alwaysAllowRoles is an empty array', () => {
    const { application, binds } = createFakeApplication({
      options: { defaultDecision: 'deny', alwaysAllowRoles: [] },
    });
    const component = new AuthorizeComponent(application);

    component.binding();

    expect(binds).toHaveLength(0);
  });

  test('binds always-allow-roles with the provided array', () => {
    const roles = ['superadmin', 'root'];
    const { application, binds } = createFakeApplication({
      options: { defaultDecision: 'allow', alwaysAllowRoles: roles },
    });
    const component = new AuthorizeComponent(application);

    component.binding();

    expect(binds).toHaveLength(1);
    expect(binds[0].key).toBe(AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES);
    expect(binds[0].value).toEqual(['superadmin', 'root']);
  });

  test('logs "Authorization configured" on success', () => {
    const { application } = createFakeApplication({
      options: { defaultDecision: 'deny', alwaysAllowRoles: ['admin'] },
    });
    const component = new AuthorizeComponent(application);

    const messages: string[] = [];
    const scopedLogger = {
      info: (message: string) => {
        messages.push(message);
      },
    };
    // Intercept the scoped logger returned by logger.for(...). Fake only implements .for();
    // the full Winston-backed Logger surface is unnecessary for this assertion.
    component.logger = { for: () => scopedLogger } as any;

    component.binding();

    expect(messages).toContain('Authorization configured');
  });

  test('binding does not throw and binds nothing when options present but no roles (idempotent shape)', () => {
    const { application, binds } = createFakeApplication({
      options: { defaultDecision: 'allow' },
    });
    const component = new AuthorizeComponent(application);

    component.binding();
    component.binding();

    expect(binds).toHaveLength(0);
  });
});
