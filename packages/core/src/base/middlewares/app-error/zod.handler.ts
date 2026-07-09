import { HTTP } from '@venizia/ignis-helpers';
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

/**
 * Formats a ZodError into the 422 validation response. Top-level `messageCode`/`message` come from
 * the first issue that defines a custom `params.code`, else the first issue's raw Zod code; the full
 * per-issue list stays under `details.cause`.
 */
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

  // Top-level messageCode/message: prefer the first issue with a custom `params.code`;
  // else fall back to the first issue's raw Zod code; else keep the generic message.
  let messageCode: string | undefined;
  let message = DEFAULT_VALIDATION_MESSAGE;

  if (issues && issues.length > 0) {
    const primaryIssue =
      issues.find(issue => extractIssueCode({ issue }) !== undefined) ?? issues[0];
    messageCode = extractIssueCode({ issue: primaryIssue }) ?? primaryIssue.code;
    message = primaryIssue.message;
  }

  return {
    statusCode,
    response: {
      message,
      messageCode,
      statusCode,
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
