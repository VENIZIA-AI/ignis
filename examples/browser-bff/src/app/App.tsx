import { CoreRaApplication } from '@minimaltech/ra-core-infra';
import { configureStore } from '@reduxjs/toolkit';
import { NoteList, NoteScreen } from './notes';
import type { BrowserBffRaApplication } from './application';

/** `CoreRaApplication` requires a redux store; this example keeps no state in it. An empty reducer map makes redux log an error, so the root reducer returns its state unchanged. */
const reduxStore = configureStore({ reducer: (state: object = {}) => state });

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
