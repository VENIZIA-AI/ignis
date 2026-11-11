import { DurationMultipliers, type IDuration } from '@/common';
import { HTTP } from '@/common/constants';
import { getError } from '@/modules/error';
import { StoragePresignLimits } from './constants';

/** Backend-neutral checks shared by storage helpers: recognising a "not found" error and turning an `IDuration` into presign seconds. */
export class StorageUtility {
  /** "Not there", across SDKs. Both minio and Bun report `S3Error` in `name`, so `code` and status decide. */
  static isNotFoundError(opts: { error: unknown }): boolean {
    const { error } = opts;
    const source = error as { statusCode?: number; status?: number; code?: string; name?: string };

    if (source?.statusCode === HTTP.ResultCodes.RS_4.NotFound || source?.status === 404) {
      return true;
    }

    const marker = `${source?.code ?? ''} ${source?.name ?? ''}`.toLowerCase();

    return ['nosuchkey', 'nosuchbucket', 'notfound'].some((needle) => marker.includes(needle));
  }

  /** A version id that names a version. S3 and MinIO answer the literal `null`, or nothing, for an object in a bucket where versioning is off or suspended. */
  static realVersionId(opts: { value?: string | null }): string | undefined {
    const { value } = opts;

    return value === undefined || value === null || value === '' || value === 'null'
      ? undefined
      : value;
  }

  /** "The expected content is gone", across SDKs: S3 and MinIO answer 412. */
  static isPreconditionFailedError(opts: { error: unknown }): boolean {
    const source = opts.error as { statusCode?: number; status?: number } | null | undefined;

    return (
      source?.statusCode === HTTP.ResultCodes.RS_4.PreconditionFailed ||
      source?.status === HTTP.ResultCodes.RS_4.PreconditionFailed
    );
  }

  /** S3 presigns in whole seconds. An unknown unit is refused; `null` would read as "no expiry". */
  static toExpirySeconds(opts: { expiresIn: IDuration; operation: string }): number {
    const { expiresIn, operation } = opts;
    const milliseconds = DurationMultipliers.toMilliseconds(expiresIn);

    if (milliseconds === null || milliseconds <= 0) {
      throw getError({
        message: `[${operation}] Invalid expiry | unit: ${expiresIn?.unit} | value: ${expiresIn?.value}`,
      });
    }

    const seconds = Math.ceil(milliseconds / DurationMultipliers.SECOND);

    // SigV4 caps a presigned URL at 7 days. `IDuration` accepts `month` and `year`, which type-check
    // and then produce a URL the provider rejects - refused here, where the unit is still readable.
    if (seconds > StoragePresignLimits.MAX_EXPIRES_IN_SECONDS) {
      throw getError({
        message: `[${operation}] Expiry exceeds the SigV4 maximum of 7 days | unit: ${expiresIn.unit} | value: ${expiresIn.value}`,
      });
    }

    return seconds;
  }
}
