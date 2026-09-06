import type { IApplicationConfigs } from '@venizia/ignis-kernel';

/**
 * What a Web Worker host configures on top of the kernel's shape. `host`/`port` stay off this
 * interface on purpose - `@venizia/ignis`'s `IServerApplicationConfigs` is the one with a socket.
 */
export interface IWorkerApplicationConfigs extends IApplicationConfigs {
  /** Bound as `CoreBindings.APPLICATION_PROJECT_ROOT` when `getProjectRoot()` resolves it, and shared with `ModuleUtility`; default is the host's own working directory when one exists, else `''`. */
  projectRoot?: string;
}
