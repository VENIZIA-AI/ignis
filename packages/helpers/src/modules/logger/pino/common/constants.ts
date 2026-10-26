import type { TConstValue } from '@/common/types';
import { type TPinoCustomLevelName } from './types';

/** pino levels are ASCENDING severity (error 50 > warn 40 > info 30 > debug 20); `emerg`(70) extends above error. NORMATIVE - do not renumber without updating the spec. */
export const PINO_CUSTOM_LEVELS: Record<TPinoCustomLevelName, number> = {
  emerg: 70,
};

/** How often the file destination rolls (pino-roll's `frequency`). */
export class PinoFrequencies {
  static readonly HOURLY = 'hourly';
  static readonly DAILY = 'daily';

  static readonly SCHEME_SET = new Set<string>([this.HOURLY, this.DAILY]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid pino roll frequency values. */
export type TFrequency = TConstValue<typeof PinoFrequencies>;
