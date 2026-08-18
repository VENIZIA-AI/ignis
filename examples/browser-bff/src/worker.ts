import { WorkerApplication } from '@venizia/ignis-core-worker';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { NoteController } from './domain/controllers/note.controller';
import { PGliteDataSource } from './domain/datasources/pglite.datasource';
import { NoteRepository } from './domain/repositories/note.repository';

class BrowserBffApplication extends WorkerApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return {
      name: 'browser-bff',
      version: '0.0.0',
      description: 'IGNIS serving its own controllers from PGlite inside a browser Worker',
    };
  }

  staticConfigure(): void {
    // No static asset surface in this example - the page serves itself.
  }

  /** Registered by hand: `@venizia/ignis-boot` scans a filesystem, and a browser has none. */
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PGliteDataSource);
    this.repository(NoteRepository);
    this.controller(NoteController);
  }

  postConfigure(): ValueOrPromise<void> {
    // Nothing to do after binding.
  }

  setupMiddlewares(): ValueOrPromise<void> {
    // Nothing to add. The environment the error middleware reads is `config.error.environment`
    // below - it used to take a Hono middleware assigning `context.env`, because the seam was a
    // subclass hook an application could not reach.
  }

  // No `initialize()` override: `RestApplication` owns the artifact ordering, and restating it here
  // would mean owning the bug the day it changes.
}

const application = new BrowserBffApplication({
  scope: 'BrowserBffApplication',
  config: {
    path: { base: '/api', isStrict: false },
    // A Worker has no `process.env`, so without this the error middleware cannot tell "this host has
    // no ambient environment" from "misconfigured" - it fails closed either way, but only the second
    // deserves an error line on every request.
    error: { environment: import.meta.env.MODE },
  },
});

application.init();

// No ready handshake: `listen()` attaches its message listener synchronously and queues whatever
// arrives while the application is still booting, so a request posted during PGlite's ~350ms start
// is answered rather than dropped.
await application.listen();

// HMR replaces this module without tearing down the Worker, and PGlite holds an exclusive OPFS
// lock - without this the next instance fails with `NoModificationAllowedError` until a full reload.
import.meta.hot?.dispose(() => application.stop());
