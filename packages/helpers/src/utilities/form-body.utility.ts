import { HTTP } from '@/common/constants';
import { ErrorScopes, getError, type TErrorDefinition } from '@/modules/error';

/** The one definition of a body the runtime cannot parse; the kernel's `RequestErrors.BODY_MALFORMED` is this object. */
export const RequestBodyErrors = {
  BODY_MALFORMED: {
    message: { text: 'Malformed body payload', code: 'core.request.body_malformed' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

/**
 * Reads a form body through the request's own cache, so every later reader gets the same
 * `FormData`. A body the runtime cannot parse is the caller's fault: it becomes a 400 here, where
 * the runtime's own error would be a 500 - Bun's carries only a code, Node's carries nothing.
 */
export const readFormBody = async (opts: {
  req: { formData: () => Promise<FormData> };
}): Promise<FormData> => {
  try {
    return await opts.req.formData();
  } catch (error) {
    throw getError({
      error: RequestBodyErrors.BODY_MALFORMED,
      message: 'Malformed Body Payload',
      cause: error,
    });
  }
};
