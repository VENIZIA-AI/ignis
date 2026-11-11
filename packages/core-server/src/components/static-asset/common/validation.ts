import type { z } from '@hono/zod-openapi';
import type { IStaticAssetValidation } from './types';

/** Defines the application's check of an uploaded file; see `directUpload.validation`. */
export class StaticAssetValidation {
  /** Returns `opts` switched on. It exists to infer `IssueSchema`, so a handler that answers another shape of issue fails type-checking. */
  static define<IssueSchema extends z.ZodType>(
    opts: IStaticAssetValidation<IssueSchema>,
  ): IStaticAssetValidation<IssueSchema> & { use: true } {
    return { use: true, ...opts };
  }
}
