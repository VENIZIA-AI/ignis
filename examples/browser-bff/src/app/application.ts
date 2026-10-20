import {
  BaseRaApplication,
  CoreBindings,
  DefaultRestDataProvider,
  type IApplicationInfo,
  type IAuthProvider,
  type IDataProvider,
  type IRestDataProviderOptions,
  type ValueOrPromise,
} from '@minimaltech/ra-core-infra';
import { BindingScopes } from '@venizia/ignis-inversion';
import type { I18nProvider } from 'ra-core';
import { BFF_BASE_PATH } from '../bff';

const APPLICATION_INFO: IApplicationInfo = {
  name: 'browser-bff',
  version: '0.0.0',
  description: 'react-admin served by an IGNIS application inside a browser Worker',
};

/**
 * `CoreRaApplication` resolves all three providers from the container with a NON-optional `get`, so
 * a key left unbound throws before the first render. This example has no login and no translations,
 * so both are bound to the smallest thing that satisfies the contract rather than to
 * `DefaultAuthProvider`/`DefaultI18nProvider`, which would drag in an auth service and a polyglot
 * catalogue that answer questions the example never asks.
 */
const NO_AUTH_PROVIDER: IAuthProvider = {
  login: async () => undefined,
  logout: async () => undefined,
  checkAuth: async () => undefined,
  checkError: async () => undefined,
  getIdentity: async () => ({ id: 'anonymous' }),
  getPermissions: async () => undefined,
} as unknown as IAuthProvider;

/** `options._` is ra-core's own convention for the default text of a missing key. */
const PASSTHROUGH_I18N_PROVIDER: I18nProvider = {
  translate: (key: string, options?: Record<string, unknown>) => (options?._ as string) ?? key,
  changeLocale: async () => undefined,
  getLocale: () => 'en',
};

/**
 * The same container-and-bindings shape a server-backed `ra-core-infra` app uses. Nothing here is
 * BFF-specific: the data provider is the stock `DefaultRestDataProvider` pointed at a normal URL,
 * and `installBffFetch` is what makes that URL resolve to the Worker instead of the network.
 *
 * That is the point of the example - swapping the backend for an in-browser one costs zero changes
 * to the application wiring.
 */
export class BrowserBffRaApplication extends BaseRaApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return APPLICATION_INFO;
  }

  bindContext(): ValueOrPromise<void> {
    this.bind<IApplicationInfo>({ key: CoreBindings.APPLICATION_INFO }).toValue(APPLICATION_INFO);

    this.bind<IRestDataProviderOptions>({ key: CoreBindings.REST_DATA_PROVIDER_OPTIONS }).toValue({
      url: BFF_BASE_PATH,
      // Matched by EXACT resource name, not by path pattern - `['*']` is a literal, not a
      // wildcard, and every request would then demand a token the Worker never issues. The Worker
      // application registers no authentication component, so every resource belongs here.
      noAuthPaths: ['notes'],
    });

    this.bind<IDataProvider>({ key: CoreBindings.DEFAULT_REST_DATA_PROVIDER })
      .toProvider(DefaultRestDataProvider)
      .setScope(BindingScopes.SINGLETON);

    this.bind<IAuthProvider>({ key: CoreBindings.DEFAULT_AUTH_PROVIDER }).toValue(NO_AUTH_PROVIDER);
    this.bind<I18nProvider>({ key: CoreBindings.DEFAULT_I18N_PROVIDER }).toValue(
      PASSTHROUGH_I18N_PROVIDER,
    );
  }

  override preConfigure(): ValueOrPromise<void> {
    return this.bindContext();
  }
}
