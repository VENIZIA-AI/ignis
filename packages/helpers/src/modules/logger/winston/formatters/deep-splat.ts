import type winston from 'winston';
import { WinstonFormatFactory } from '../formats';

/** @deprecated Use WinstonFormatFactory.deepSplat(). Removed in 0.5. */
export const deepSplat = (): winston.Logform.Format => WinstonFormatFactory.deepSplat();
