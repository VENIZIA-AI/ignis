import type { IApplicationInfo } from '@/base/applications/common';
import { RestApplication } from '@/base/applications/rest';
import { service } from '@/base/metadata';
import { BindingNamespaces } from '@/common/bindings';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class ProbeApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'namespace-guard-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

const buildApplication = () =>
  new ProbeApplication({
    scope: ProbeApplication.name,
    config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: false } },
  });

/** `Binding` tags by the first segment, and only when there is more than one - so a namespace-less key is untagged. */
describe('an artifact must register under a namespace', () => {
  test('a declared binding with an empty namespace is refused at DECORATION time', () => {
    expect(() => {
      @service({ binding: { namespace: '', key: 'orphan' } })
      class EmptyNamespaceService {}
      return EmptyNamespaceService;
    }).toThrow(/no usable namespace/);
  });

  test('a declared namespace carrying a dot is refused - it would be tagged by its first segment only', () => {
    expect(() => {
      @service({ binding: { namespace: 'acme.services', key: 'Thing' } })
      class DottedNamespaceService {}
      return DottedNamespaceService;
    }).toThrow(/no usable namespace/);
  });

  test('a call-site binding with an empty namespace is refused at REGISTRATION time', () => {
    class PlainService {}
    const application = buildApplication();

    expect(() =>
      application.service(PlainService, { binding: { namespace: '', key: 'orphan' } }),
    ).toThrow(/'PlainService' declares a binding with no usable namespace/);
  });

  /** Negative control: a namespace an application minted itself is still fine. */
  test('accepts a namespace the application minted with createNamespace', () => {
    class MintedService {}
    const application = buildApplication();
    const namespace = BindingNamespaces.createNamespace({ name: 'acme' });

    expect(() =>
      application.service(MintedService, { binding: { namespace, key: 'Minted' } }),
    ).not.toThrow();
  });
});
