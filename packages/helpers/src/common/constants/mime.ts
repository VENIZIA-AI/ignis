import { TConstValue } from "../types";

export class MimeTypes {
  static readonly UNKNOWN = "unknown";
  static readonly IMAGE = "image";
  static readonly VIDEO = "video";
  static readonly TEXT = "text";
}
export type TMimeTypes = TConstValue<typeof MimeTypes>;
