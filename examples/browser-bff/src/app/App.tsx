import { CoreRaApplication } from '@minimaltech/ra-core-infra';
import { configureStore } from '@reduxjs/toolkit';
import { NoteList, NoteScreen } from './notes';
import type { BrowserBffRaApplication } from './application';

/**
 * `CoreRaApplication` expects a redux store because `ra-core-infra` keeps its own slices there. This
 * example registers none, so an empty reducer map is the honest configuration, not a placeholder.
 */
const reduxStore = configureStore({ reducer: {} });

/** The data, auth and i18n providers are read from the container - see `application.ts`. */
export const App = (opts: { application: BrowserBffRaApplication }) => {
  const { application } = opts;

  return (
    <CoreRaApplication
      container={application}
      reduxStore={reduxStore}
      suspense={<p className="muted">Booting the Worker...</p>}
      resources={[{ name: 'notes', list: NoteList }]}
      dashboard={NoteScreen}
    />
  );
};
