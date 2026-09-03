import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { generateUserAuditColumnDefs } from '@/connectors';
import { RequestTrackerComponent } from '@/components';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  Authentication,
  BindingKeys,
  BindingNamespaces,
  BindingScopes,
  RequestContextRegistry,
} from '@venizia/ignis-kernel';
import { pgTable } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, test } from 'bun:test';

const auditTable = pgTable('request_context_wiring_audit', {
  ...generateUserAuditColumnDefs({
    created: { dataType: 'number', columnName: 'created_by', allowAnonymous: true },
    modified: { dataType: 'number', columnName: 'modified_by', allowAnonymous: true },
  }),
});

/** What drizzle calls per inserted row - the value that actually lands in `created_by`. */
const stampCreatedBy = (): unknown => (auditTable.createdBy as AnyType).defaultFn();

const AUDIT_USER_ID = 7;

class AuditContextApplication extends BaseApplication {
  /** `bun test` transpiles without legacy parameter decorators, so RequestTrackerComponent's `@inject`ed application never reaches the container - rebound to an explicit instance. */
  override async registerDefaultMiddlewares(): Promise<void> {
    await super.registerDefaultMiddlewares();

    this.bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.COMPONENT,
        key: RequestTrackerComponent.name,
      }),
    })
      .toValue(new RequestTrackerComponent(this))
      .setScope(BindingScopes.SINGLETON);
  }

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'audit-context-app', version: '0.0.0', description: 'Request context wiring' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}

  postConfigure(): void {
    const server = this.getServer();

    server.get('/audit-with-user', context => {
      context.set(Authentication.AUDIT_USER_ID, AUDIT_USER_ID);
      return context.json({ stamped: stampCreatedBy() });
    });

    server.get('/audit-without-user', context => {
      return context.json({ stamped: stampCreatedBy() });
    });
  }

  setupMiddlewares(): void {}
}

const buildConfigs = (opts?: Partial<IApplicationConfigs>): IApplicationConfigs => {
  return {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/', isStrict: false },
    ...opts,
  };
};

/**
 * The connectors' user-audit enricher no longer imports `hono/context-storage` - it reads
 * `RequestContextRegistry`, and this application layer is the only thing that installs a resolver
 * over it. Nothing else proves the server half of that seam is wired: the connectors' own tests
 * drive the registry directly, so they would pass just as happily with the install deleted here.
 */
describe('BaseApplication - request context wiring for the user-audit enricher', () => {
  let application: AuditContextApplication | undefined;

  afterEach(async () => {
    await application?.stop();
    application = undefined;
    RequestContextRegistry.clearResolver();
  });

  test('a live request stamps the audit user the handler set', async () => {
    application = new AuditContextApplication({
      scope: 'AuditContextApplication',
      config: buildConfigs(),
    });
    application.init();
    await application.start();

    const port = application.getServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/audit-with-user`);

    expect(await response.json()).toEqual({ stamped: AUDIT_USER_ID });
  });

  test('a live request with no audit user stamps null, and does not throw', async () => {
    application = new AuditContextApplication({
      scope: 'AuditContextApplication',
      config: buildConfigs(),
    });
    application.init();
    await application.start();

    const port = application.getServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/audit-without-user`);

    expect(await response.json()).toEqual({ stamped: null });
  });

  test('outside a request the installed resolver reports no context at all', async () => {
    application = new AuditContextApplication({
      scope: 'AuditContextApplication',
      config: buildConfigs(),
    });
    application.init();
    await application.start();

    expect(RequestContextRegistry.resolve()).toBeUndefined();
    expect(stampCreatedBy()).toBeNull();
  });
});
