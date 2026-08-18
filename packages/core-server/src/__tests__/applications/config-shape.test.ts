import 'reflect-metadata';

import type { IApplicationConfigs } from '@/index';
import type { IApplicationConfigs as IKernelApplicationConfigs } from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

/**
 * `host`/`port` left the kernel so a browser Worker stops being handed an address it has no use
 * for. `@venizia/ignis` must widen them back, because every application built on it binds a socket -
 * and a real one (nx-seller) writes both into an `IApplicationConfigs` literal today.
 *
 * The mechanism is fragile in one specific way, which is why this test exists: the widened shape
 * wins only because `src/index.ts` exports the name EXPLICITLY. A name reachable through two
 * different `export *` lines is ambiguous, and TypeScript then exports NEITHER - silently, with no
 * error at any layer. Deleting that one line would leave `IApplicationConfigs` unexported from this
 * package and break every consumer at once.
 */
/**
 * Both shapes carry `[key: string]: any`, which puts `string` itself into `keyof` - so a plain
 * `'host' extends keyof T` answers `true` for every name and proves nothing. This strips the index
 * signature first, leaving only the keys someone actually declared.
 */
type WithoutIndexSignature<TTarget> = {
  [
    TKey in keyof TTarget as string extends TKey ? never : number extends TKey ? never : TKey
  ]: TTarget[TKey];
};

type HasDeclaredKey<
  TTarget,
  TKey extends string,
> = TKey extends keyof WithoutIndexSignature<TTarget> ? true : false;

/** `HasDeclaredKey<any, K>` is `true` for every K, so without this the assertions below would pass vacuously if the export ever resolved to `any` instead of an interface. */
type IsAny<TTarget> = 0 extends 1 & TTarget ? true : false;

/** Compile-time assertions: a mismatch is a build error, and the runtime body only proves the file ran. */
const SERVER_IS_A_REAL_TYPE: IsAny<IApplicationConfigs> = false;
const KERNEL_IS_A_REAL_TYPE: IsAny<IKernelApplicationConfigs> = false;
const SERVER_DECLARES_HOST: HasDeclaredKey<IApplicationConfigs, 'host'> = true;
const SERVER_DECLARES_PORT: HasDeclaredKey<IApplicationConfigs, 'port'> = true;
const KERNEL_DECLARES_HOST: HasDeclaredKey<IKernelApplicationConfigs, 'host'> = false;
const KERNEL_DECLARES_PORT: HasDeclaredKey<IKernelApplicationConfigs, 'port'> = false;

/** nx-seller's `createAppConfig`, reduced to the shape that must keep compiling. */
const BANA_SHAPED_CONFIG: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: Number(process.env.APP_ENV_SERVER_PORT),
  path: { base: '/api', isStrict: true },
};

describe('IApplicationConfigs - narrow in the kernel, widened by @venizia/ignis', () => {
  test("the server flavour declares host and port, the kernel's does not", () => {
    expect([SERVER_IS_A_REAL_TYPE, KERNEL_IS_A_REAL_TYPE]).toEqual([false, false]);
    expect([SERVER_DECLARES_HOST, SERVER_DECLARES_PORT]).toEqual([true, true]);
    expect([KERNEL_DECLARES_HOST, KERNEL_DECLARES_PORT]).toEqual([false, false]);
  });

  test('a BANA-shaped config still assigns, with host typed rather than swallowed by the index signature', () => {
    // `string | undefined`, not `any`: were the explicit re-export lost, this would fall through to
    // `[key: string]: any` and every typo in a config key would compile.
    const host: string | undefined = BANA_SHAPED_CONFIG.host;

    expect(BANA_SHAPED_CONFIG.path.base).toBe('/api');
    expect(host).toBe(process.env.APP_ENV_SERVER_HOST);
  });
});
