import { TPinoCustomLevelName } from './types';

/** pino levels are ASCENDING severity (error 50 > warn 40 > info 30 > debug 20); `emerg`(70) extends above error. NORMATIVE - do not renumber without updating the spec. */
export const PINO_CUSTOM_LEVELS: Record<TPinoCustomLevelName, number> = {
  emerg: 70,
};

export type TFrequency = 'hourly' | 'daily';
