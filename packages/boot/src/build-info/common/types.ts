import type { TBuildInfoRecord } from '@venizia/ignis-helpers/core';
import type { TBuildInfoFormat } from './constants';

export interface IBuildInfoOptions {
  out: string;
  /** Where `package.json` is read from and where `git` is asked; default the cwd. */
  root?: string;
  format?: TBuildInfoFormat;
  /** Name of the exported constant in `ts` format; default `BUILD_INFO`. */
  exportName?: string;
}

export interface IBuildInfoResult {
  buildInfo: TBuildInfoRecord;
  content: string;
  out: string;
}
