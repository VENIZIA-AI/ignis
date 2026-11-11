import { z } from '@hono/zod-openapi';
import type { TStaticAssetUploadLabels } from '../../common';

/** The labels both upload paths take. They ride the BODY - a form field on an upload, beside the token on a commit - because an identifier in a query string lands in every access log between the client and here. */
export const UploadLabelsSchema = z.object({
  principalType: z.string().optional(),
  principalId: z.union([z.string(), z.number()]).optional(),
  variant: z.string().optional(),
  sequence: z.coerce.number().int().optional(),
});

export class StaticAssetLabelsUtility {
  /** A form hands every field as a string and an empty input as `''`; an empty label is no label. */
  static parse(opts: { fields: Record<string, unknown> }): TStaticAssetUploadLabels {
    const present = Object.fromEntries(
      Object.entries(opts.fields).filter(([, value]) => value !== ''),
    );
    // Already validated by the route's own schema, which is this one: this only reads the result.
    const parsed = UploadLabelsSchema.parse(present);

    const { principalId, ...rest } = parsed;

    return { ...rest, principalId: principalId === undefined ? undefined : String(principalId) };
  }
}
