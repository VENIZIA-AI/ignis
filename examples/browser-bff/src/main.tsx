import 'reflect-metadata';

import { createRoot } from 'react-dom/client';

import './styles.css';
import { App } from './app/App';
import { BrowserBffRaApplication } from './app/application';
import { installBffFetch } from '@venizia/ignis-worker';
import { BFF_BASE_PATH, bff } from './bff';

/**
 * Order matters and is not cosmetic: the bridge has to own `fetch` before the application boots, or
 * the first data-provider call leaves the page and 404s against the dev server.
 */
installBffFetch({ transport: bff, basePath: BFF_BASE_PATH });

const application = new BrowserBffRaApplication();

const container = document.getElementById('root');
if (!container) {
  throw new Error('[main] #root is missing from index.html');
}

const root = createRoot(container);

application
  .start()
  .then(() => {
    root.render(<App application={application} />);
  })
  .catch((error: unknown) => {
    // Never a blank page: a container that failed to bind looks identical to a Worker that never answered.
    console.error('[main] application failed to start | error:', error);
    root.render(
      <main>
        <h1>Failed to start</h1>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </main>,
    );
  });
