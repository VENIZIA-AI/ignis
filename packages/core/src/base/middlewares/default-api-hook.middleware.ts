import { HTTP } from '@/common';
import { Hook } from '@hono/zod-openapi';

export const defaultAPIHook: Hook<any, any, any, any> = (result, c) => {
  if (!result.success) {
    return c.json(result, HTTP.ResultCodes.RS_4.UnprocessableEntity);
  }
};
