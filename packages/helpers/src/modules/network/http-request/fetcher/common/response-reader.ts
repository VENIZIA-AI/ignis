import { HTTP } from '@/common/constants/http';
import { BodyLimit } from './body-limit';

/** Turning a `Response` into text, the one way every reader does it. */
export class ResponseReader {
  /** The body as text: `''` for a 204, an empty body or no body; with `maxBytes` the read stops and fails at the cap. */
  static async readText(opts: { response: Response; maxBytes?: number }): Promise<string> {
    const { response, maxBytes } = opts;

    if (response.status === HTTP.ResultCodes.RS_2.NoContent || response.body === null) {
      return '';
    }

    return maxBytes === undefined ? response.text() : BodyLimit.readText({ response, maxBytes });
  }
}
