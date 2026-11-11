import type { IAuthRouteConfig } from '@/base';
import { z } from '@hono/zod-openapi';
import { OpenApiResponses } from '@venizia/ignis-kernel';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { IStaticAssetRouteEnv } from './context';

type TRequest = NonNullable<IAuthRouteConfig['request']>;
type TMethod = IAuthRouteConfig['method'];

interface IDefinitionOpts {
  method: TMethod;
  path: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
}

const assemble = (
  opts: IDefinitionOpts & {
    contentType?: string;
    body?: z.ZodType;
    responses: IAuthRouteConfig['responses'];
  },
): IAuthRouteConfig => {
  const { method, path, params, query, contentType, body, responses } = opts;
  const request: TRequest = {
    ...(params ? { params } : {}),
    ...(query ? { query } : {}),
    ...(body && contentType ? { body: { content: { [contentType]: { schema: body } } } } : {}),
  };

  return { method, path, ...(Object.keys(request).length > 0 ? { request } : {}), responses };
};

/** The one place a route definition is assembled: no route writes `request.body.content[...]` by hand. */
export class StaticAssetDefinition {
  /** JSON in, JSON out. */
  static json(
    opts: IDefinitionOpts & { body?: z.ZodType; response: z.ZodType; description?: string },
  ): IAuthRouteConfig {
    return assemble({
      ...opts,
      contentType: HTTP.HeaderValues.APPLICATION_JSON,
      responses: OpenApiResponses.jsonResponse({
        schema: opts.response,
        description: opts.description,
      }),
    });
  }

  /** A multipart form in, JSON out. */
  static multipart(
    opts: IDefinitionOpts & { body: z.ZodType; response: z.ZodType },
  ): IAuthRouteConfig {
    return assemble({
      ...opts,
      contentType: HTTP.HeaderValues.MULTIPART_FORM_DATA,
      responses: OpenApiResponses.jsonResponse({ schema: opts.response }),
    });
  }

  /** A file stream out. */
  static stream(opts: IDefinitionOpts): IAuthRouteConfig {
    return assemble({
      ...opts,
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: {
          description: 'File stream response',
          content: {
            [HTTP.HeaderValues.APPLICATION_OCTET_STREAM]: {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        ...OpenApiResponses.errorResponses(),
      },
    });
  }
}

const bucketNameParam = () =>
  z.string().openapi({ param: { name: 'bucketName', in: 'path' }, example: 'images' });

const objectNameParam = () =>
  z.string().openapi({
    param: {
      name: 'objectName',
      in: 'path',
      description: 'Object name or path (e.g., "photo.jpg" or "photos/2024/photo.jpg")',
    },
    example: 'photos/2024/photo.jpg',
  });

/** Where a route sits in the URL and which path params it carries; the one place those two depend on the entry. */
export class StaticAssetPaths {
  /** `/buckets/{bucketName}`, or nothing once the entry configured its bucket. */
  static bucket(opts: { env: IStaticAssetRouteEnv }): string {
    return opts.env.bucket === undefined ? '/buckets/{bucketName}' : '';
  }

  /**
   * `{objectName}` is ONE segment: a folder path travels percent-encoded (`photos%2F2024%2Ff.jpg`).
   * `rawObjectPath` adds the `{.+}` catch-all, the spelling `@hono/zod-openapi` translates.
   */
  static object(opts: { env: IStaticAssetRouteEnv }): string {
    return opts.env.rawObjectPath ? '{objectName}{.+}' : '{objectName}';
  }

  /** Params of a route that names a bucket only: none once the bucket is configured. */
  static bucketParams(opts: { env: IStaticAssetRouteEnv }): z.ZodObject | undefined {
    return opts.env.bucket === undefined ? z.object({ bucketName: bucketNameParam() }) : undefined;
  }

  /** Params of a route that names an object. */
  static objectParams(opts: { env: IStaticAssetRouteEnv }): z.ZodObject {
    return opts.env.bucket === undefined
      ? z.object({ bucketName: bucketNameParam(), objectName: objectNameParam() })
      : z.object({ objectName: objectNameParam() });
  }

  /** Params of a route that always names the bucket (the four bucket routes). */
  static requiredBucketParams(): z.ZodObject {
    return z.object({ bucketName: bucketNameParam() });
  }
}
