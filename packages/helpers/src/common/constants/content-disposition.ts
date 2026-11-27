// Its own module: a class with static members stays in every bundle that reads its module, and this one brings
// `ConstClass` and the error classes with it.
import { type TConstValue } from '../types';
import { ConstClass } from '@/common/const-class';

/** How a client treats a download: ATTACHMENT saves it, INLINE shows it. */
export class ContentDispositionTypes extends ConstClass {
  static readonly ATTACHMENT = 'attachment';
  static readonly INLINE = 'inline';
}

/** Valid Content-Disposition type values. */
export type TContentDispositionType = TConstValue<typeof ContentDispositionTypes>;
