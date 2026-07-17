import { HTTP, MessageCode } from '@venizia/ignis-helpers';
import type { HTTPResponseError } from 'hono/types';
import type { IZodIssueLike } from './types';

const DEFAULT_VALIDATION_MESSAGE = 'ValidationError';

/** Returns a schema-author-supplied code (`issue.params.code`) when it is a non-empty string. */
const extractIssueCode = (opts: { issue: IZodIssueLike }) => {
  const paramsCode = opts.issue?.params?.code;

  if (typeof paramsCode === 'string' && paramsCode.length > 0) {
    return paramsCode;
  }

  return undefined;
};

/** Formats a ZodError into the 422 validation response. */
export const formatZodError = (opts: {
  isProduction: boolean;
  requestId: string;
  url: string;
  path: string;
  error: Error | HTTPResponseError;
}) => {
  const { isProduction, requestId, url, path, error } = opts;
  const statusCode = HTTP.ResultCodes.RS_4.UnprocessableEntity;

  let validationErrors: unknown;
  try {
    validationErrors = JSON.parse(error.message);
  } catch {
    validationErrors = error;
  }

  const issues = Array.isArray(validationErrors) ? (validationErrors as IZodIssueLike[]) : null;

  // Prefer the first issue with a custom `params.code`, else its raw Zod code.
  let messageCode: string | undefined;
  let message = DEFAULT_VALIDATION_MESSAGE;

  if (issues && issues.length > 0) {
    const primaryIssue =
      issues.find(issue => extractIssueCode({ issue }) !== undefined) ?? issues[0];
    messageCode = extractIssueCode({ issue: primaryIssue }) ?? primaryIssue.code;
    message = primaryIssue.message;
  }

  // A ZodError we could not parse into issues yields no code of its own; the response still
  // carries one, so no error response anywhere is missing the field a client branches on.
  const resolvedMessageCode = MessageCode.resolve(messageCode);

  return {
    statusCode,
    response: {
      message,
      statusCode,
      // `args` is empty: a Zod issue carries no interpolation values - per-field detail is in `details.cause`.
      normalized: { text: message, code: resolvedMessageCode, args: {} },
      requestId,
      details: {
        url,
        path,
        stack: !isProduction ? error.stack : undefined,
        cause: issues
          ? issues.map(el => ({
              path: el.path.join('.') || 'root',
              message: el.message,
              code: el.code,
              expected: el.expected,
              received: el.received,
            }))
          : validationErrors,
      },
    },
  };
};
