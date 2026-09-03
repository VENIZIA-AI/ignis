import 'reflect-metadata';

export * from '@venizia/ignis-kernel';

export * from './base';
export * from './common';
export * from './components';
export * from './connectors';
export * from './helpers';
export * from './utilities';

/**
 * `IApplicationConfigs` from THIS package is the server flavour - the kernel's shape plus `host` and
 * `port`. An application built on `@venizia/ignis` always has a socket, so it should see both.
 *
 * Explicit, and here in the entry module rather than in a barrel: a name exported by two different
 * `export *` lines is ambiguous and TypeScript then exports NEITHER, silently. An explicit export
 * beats every star export, so this line is what makes the widened shape win.
 */
export type { IServerApplicationConfigs as IApplicationConfigs } from './base/applications/types';
