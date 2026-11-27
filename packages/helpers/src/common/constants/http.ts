import { type TConstValue, type ValueOf } from '../types';
import * as HTTP from './http-groups';
import { ConstClass } from '@/common/const-class';

/**
 * HTTP constants, by group: `Headers`, `CorsHeaders`, `HeaderValues`, `Methods`, `Protocols` and `ResultCodes`. Header
 * names, methods and protocols are lowercase. A module namespace: a bundle keeps only the groups it reads.
 */
export { HTTP };

/** An HTTP method from `HTTP.Methods`, in lowercase or uppercase. */
export type THttpMethod = ValueOf<typeof HTTP.Methods> | Uppercase<ValueOf<typeof HTTP.Methods>>;
/** An HTTP protocol from `HTTP.Protocols`, in lowercase or uppercase. */
export type THttpProtocol =
  | ValueOf<typeof HTTP.Protocols>
  | Uppercase<ValueOf<typeof HTTP.Protocols>>;
/** A numeric HTTP status code from any class in `HTTP.ResultCodes`. */
export type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>;

/** How a client treats a download: ATTACHMENT saves it, INLINE shows it. */
export class ContentDispositionTypes extends ConstClass {
  static readonly ATTACHMENT = 'attachment';
  static readonly INLINE = 'inline';
}

/** Valid Content-Disposition type values. */
export type TContentDispositionType = TConstValue<typeof ContentDispositionTypes>;
