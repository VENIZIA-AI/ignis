import { Application } from './application';

const application = new Application({
  scope: 'Application',
  config: {
    path: { base: '/api', isStrict: false },
    discoverArtifacts: true,
    // A Worker has no `process.env`, so the error middleware reads its environment from here.
    error: { environment: import.meta.env.MODE },
  },
});

application.init();

// `listen()` answers on `postMessage` instead of a socket, and queues requests that arrive while
// PGlite is still starting.
await application.listen();

// Vite hot reload replaces this module without ending the Worker; stopping releases the OPFS lock.
import.meta.hot?.dispose(() => application.stop());
