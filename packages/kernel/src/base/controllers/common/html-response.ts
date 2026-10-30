import { OpenApiResponses } from '@/base/models/common';

/** @deprecated Use OpenApiResponses.htmlContent({ description, required }). Removed in 0.5. */
export const htmlContent = (opts: { description: string; required?: boolean }) => {
  return OpenApiResponses.htmlContent(opts);
};

/** @deprecated Use OpenApiResponses.htmlResponse({ description, required }). Removed in 0.5. */
export const htmlResponse = (opts: { description: string; required?: boolean }) => {
  return OpenApiResponses.htmlResponse(opts);
};
