import { TConstValue } from '../types';

export class MimeTypes {
  static readonly UNKNOWN = 'unknown';
  static readonly IMAGE = 'image';
  static readonly VIDEO = 'video';
  static readonly TEXT = 'text';

  static readonly SCHEME_SET = new Set<string>([this.UNKNOWN, this.IMAGE, this.VIDEO, this.TEXT]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
export type TMimeTypes = TConstValue<typeof MimeTypes>;

/** The leading dot is part of the value: `path.extname` returns one. */
export class FileExtensions {
  static readonly PNG = '.png';
  static readonly JPG = '.jpg';
  static readonly JPEG = '.jpeg';
  static readonly GIF = '.gif';
  static readonly WEBP = '.webp';
  static readonly SVG = '.svg';
  static readonly PDF = '.pdf';
  static readonly JSON = '.json';
  static readonly TXT = '.txt';
  static readonly HTML = '.html';
  static readonly CSS = '.css';
  static readonly JS = '.js';
  static readonly MP4 = '.mp4';
  static readonly WEBM = '.webm';
  static readonly MP3 = '.mp3';
  static readonly WAV = '.wav';
  static readonly ZIP = '.zip';
  static readonly CSV = '.csv';
  static readonly XML = '.xml';

  static readonly SCHEME_SET = new Set<string>([
    this.PNG,
    this.JPG,
    this.JPEG,
    this.GIF,
    this.WEBP,
    this.SVG,
    this.PDF,
    this.JSON,
    this.TXT,
    this.HTML,
    this.CSS,
    this.JS,
    this.MP4,
    this.WEBM,
    this.MP3,
    this.WAV,
    this.ZIP,
    this.CSV,
    this.XML,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
export type TFileExtension = TConstValue<typeof FileExtensions>;

/** Full content types, as they go on the wire. `MimeTypes` holds only the top-level part. */
export class ContentTypes {
  static readonly OCTET_STREAM = 'application/octet-stream';
  static readonly PNG = 'image/png';
  static readonly JPEG = 'image/jpeg';
  static readonly GIF = 'image/gif';
  static readonly WEBP = 'image/webp';
  static readonly SVG = 'image/svg+xml';
  static readonly PDF = 'application/pdf';
  static readonly JSON = 'application/json';
  static readonly PLAIN_TEXT = 'text/plain';
  static readonly HTML = 'text/html';
  static readonly CSS = 'text/css';
  static readonly JAVASCRIPT = 'text/javascript';
  static readonly MP4 = 'video/mp4';
  static readonly WEBM = 'video/webm';
  static readonly MPEG_AUDIO = 'audio/mpeg';
  static readonly WAV = 'audio/wav';
  static readonly ZIP = 'application/zip';
  static readonly CSV = 'text/csv';
  static readonly XML = 'application/xml';

  static readonly SCHEME_SET = new Set<string>([
    this.OCTET_STREAM,
    this.PNG,
    this.JPEG,
    this.GIF,
    this.WEBP,
    this.SVG,
    this.PDF,
    this.JSON,
    this.PLAIN_TEXT,
    this.HTML,
    this.CSS,
    this.JAVASCRIPT,
    this.MP4,
    this.WEBM,
    this.MPEG_AUDIO,
    this.WAV,
    this.ZIP,
    this.CSV,
    this.XML,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
export type TContentType = TConstValue<typeof ContentTypes>;

/** `satisfies` makes the table total; the declared `string` key keeps a lookup cast-free. */
export const CONTENT_TYPE_BY_EXTENSION: Readonly<Partial<Record<string, TContentType>>> = {
  [FileExtensions.PNG]: ContentTypes.PNG,
  [FileExtensions.JPG]: ContentTypes.JPEG,
  [FileExtensions.JPEG]: ContentTypes.JPEG,
  [FileExtensions.GIF]: ContentTypes.GIF,
  [FileExtensions.WEBP]: ContentTypes.WEBP,
  [FileExtensions.SVG]: ContentTypes.SVG,
  [FileExtensions.PDF]: ContentTypes.PDF,
  [FileExtensions.JSON]: ContentTypes.JSON,
  [FileExtensions.TXT]: ContentTypes.PLAIN_TEXT,
  [FileExtensions.HTML]: ContentTypes.HTML,
  [FileExtensions.CSS]: ContentTypes.CSS,
  [FileExtensions.JS]: ContentTypes.JAVASCRIPT,
  [FileExtensions.MP4]: ContentTypes.MP4,
  [FileExtensions.WEBM]: ContentTypes.WEBM,
  [FileExtensions.MP3]: ContentTypes.MPEG_AUDIO,
  [FileExtensions.WAV]: ContentTypes.WAV,
  [FileExtensions.ZIP]: ContentTypes.ZIP,
  [FileExtensions.CSV]: ContentTypes.CSV,
  [FileExtensions.XML]: ContentTypes.XML,
} satisfies Readonly<Record<TFileExtension, TContentType>>;
