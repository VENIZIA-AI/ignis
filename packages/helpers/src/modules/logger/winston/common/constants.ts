import { blankToUndefined } from '@/utilities/parse.utility';
import { Defaults } from '@/common/constants';

/** Not re-exported from `common/index.ts` - keeps these off the `/winston` sub-path surface. */
export const LOGGER_PREFIX = Defaults.APPLICATION_NAME;
export const LOGGER_FORMAT = blankToUndefined(process.env.APP_ENV_LOGGER_FORMAT) ?? 'text';

export const LOGGER_FILE_FREQUENCY =
  blankToUndefined(process.env.APP_ENV_LOGGER_FILE_FREQUENCY) ?? '1h';
export const LOGGER_FILE_MAX_SIZE =
  blankToUndefined(process.env.APP_ENV_LOGGER_FILE_MAX_SIZE) ?? '100m';
export const LOGGER_FILE_MAX_FILES =
  blankToUndefined(process.env.APP_ENV_LOGGER_FILE_MAX_FILES) ?? '5d';
export const LOGGER_FILE_DATE_PATTERN =
  blankToUndefined(process.env.APP_ENV_LOGGER_FILE_DATE_PATTERN) ?? 'YYYYMMDD_HH';
