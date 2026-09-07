import type { IAuthRouteConfig } from '@/base';
import { jsonContent, jsonResponse } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ErrorSchema } from '@venizia/ignis-helpers';

type TRouteRequest = NonNullable<IAuthRouteConfig['request']>;

const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
  }),
});

const bucketNameParam = () =>
  z.string().openapi({
    param: {
      name: 'bucketName',
      in: 'path',
    },
    example: 'images',
  });

const objectNameParam = () =>
  z.string().openapi({
    param: {
      name: 'objectName',
      in: 'path',
      description: 'Object name or path (e.g., "photo.jpg" or "photos/2024/photo.jpg")',
    },
    example: 'photos/2024/photo.jpg',
  });

const fileStreamResponses = (): IAuthRouteConfig['responses'] => ({
  [HTTP.ResultCodes.RS_2.Ok]: {
    description: 'File stream response',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  },
  ['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),
});

/** The ten built-in asset routes. Only `path` and `request.params` differ between option combinations. */
export interface IAssetDefinitions {
  GET_BUCKETS: IAuthRouteConfig;
  GET_BUCKET_BY_NAME: IAuthRouteConfig;
  CREATE_BUCKET: IAuthRouteConfig;
  DELETE_BUCKET: IAuthRouteConfig;
  GET_OBJECT_BY_NAME: IAuthRouteConfig;
  DOWNLOAD_OBJECT_BY_NAME: IAuthRouteConfig;
  UPLOAD: IAuthRouteConfig;
  DELETE_OBJECT: IAuthRouteConfig;
  LIST_OBJECTS: IAuthRouteConfig;
  RECREATE_METALINK: IAuthRouteConfig;
}

/**
 * Builds the route configs of one asset controller.
 * `hasConfiguredBucket` drops `/buckets/{bucketName}` and its param from every object route.
 * `rawObjectPath` appends the `{.+}` catch-all, the spelling `@hono/zod-openapi` translates.
 */
export const buildAssetDefinitions = (opts: {
  hasConfiguredBucket?: boolean;
  rawObjectPath?: boolean;
}): IAssetDefinitions => {
  const { hasConfiguredBucket = false, rawObjectPath = false } = opts;

  const bucketPrefix = hasConfiguredBucket ? '' : '/buckets/{bucketName}';

  // `{objectName}` is ONE segment: a folder path travels percent-encoded (`photos%2F2024%2Ff.jpg`).
  // The catch-all also matches a RAW nested path; the encoded form keeps working either way.
  const objectSegment = rawObjectPath ? '{objectName}{.+}' : '{objectName}';

  // A configured bucket is never in the URL, so a route whose only param was `bucketName` carries none.
  const bucketRequest = (): Pick<TRouteRequest, 'params'> =>
    hasConfiguredBucket ? {} : { params: z.object({ bucketName: bucketNameParam() }) };

  const objectRequest = (): TRouteRequest => ({
    params: hasConfiguredBucket
      ? z.object({ objectName: objectNameParam() })
      : z.object({ bucketName: bucketNameParam(), objectName: objectNameParam() }),
  });

  return {
    GET_BUCKETS: {
      method: 'get',
      path: '/buckets',
      responses: jsonResponse({
        schema: z.array(
          z.object({
            name: z.string(),
            creationDate: z.iso.datetime(),
          }),
        ),
      }),
    },
    GET_BUCKET_BY_NAME: {
      method: 'get',
      path: '/buckets/{bucketName}',
      request: {
        params: z.object({ bucketName: bucketNameParam() }),
      },
      responses: jsonResponse({
        schema: z
          .object({
            name: z.string(),
            creationDate: z.iso.datetime(),
          })
          .nullable(),
      }),
    },
    CREATE_BUCKET: {
      method: 'post',
      path: '/buckets/{bucketName}',
      request: {
        params: z.object({ bucketName: bucketNameParam() }),
      },
      responses: jsonResponse({
        schema: z
          .object({
            name: z.string(),
            creationDate: z.iso.datetime(),
          })
          .nullable(),
      }),
    },
    DELETE_BUCKET: {
      method: 'delete',
      path: '/buckets/{bucketName}',
      request: {
        params: z.object({ bucketName: bucketNameParam() }),
      },
      responses: jsonResponse({
        schema: z.object({
          isDeleted: z.boolean(),
        }),
      }),
    },
    GET_OBJECT_BY_NAME: {
      method: 'get',
      path: `${bucketPrefix}/objects/${objectSegment}`,
      request: objectRequest(),
      responses: fileStreamResponses(),
    },
    DOWNLOAD_OBJECT_BY_NAME: {
      method: 'get',
      path: `${bucketPrefix}/download/${objectSegment}`,
      request: objectRequest(),
      responses: fileStreamResponses(),
    },
    UPLOAD: {
      method: 'post',
      path: `${bucketPrefix}/upload`,
      request: {
        ...bucketRequest(),
        query: z.object({
          principalType: z.string().optional(),
          principalId: z.string().or(z.number()).optional(),
          variant: z.string().optional(),
          folderPath: z
            .string()
            .optional()
            .openapi({
              param: {
                name: 'folderPath',
                in: 'query',
                description: 'Target folder path for uploaded files (e.g., "photos/2024")',
              },
              example: 'photos/2024',
            }),
        }),
        body: {
          content: {
            'multipart/form-data': {
              schema: MultipartBodySchema,
            },
          },
        },
      },
      responses: jsonResponse({
        schema: z.array(
          z.object({
            objectName: z.string(),
            link: z.string(),
            bucketName: z.string(),
            metaLink: z.any().optional(),
            metaLinkError: z.string().optional(),
          }),
        ),
      }),
    },
    DELETE_OBJECT: {
      method: 'delete',
      path: `${bucketPrefix}/objects/${objectSegment}`,
      request: objectRequest(),
      responses: jsonResponse({
        schema: z.object({
          success: z.boolean(),
        }),
      }),
    },
    LIST_OBJECTS: {
      method: 'get',
      path: `${bucketPrefix}/objects`,
      request: {
        ...bucketRequest(),
        query: z.object({
          prefix: z
            .string()
            .optional()
            .openapi({
              param: {
                name: 'prefix',
                in: 'query',
                description: 'Filter objects by prefix',
              },
              example: 'folder/',
            }),
          recursive: z
            .string()
            .optional()
            .openapi({
              param: {
                name: 'recursive',
                in: 'query',
                description: 'Recursive listing',
              },
              example: 'true',
            }),
          maxKeys: z
            .string()
            .optional()
            .openapi({
              param: {
                name: 'maxKeys',
                in: 'query',
                description: 'Maximum number of objects to return',
              },
              example: '100',
            }),
        }),
      },
      responses: jsonResponse({
        schema: z.array(
          z.object({
            name: z.string().optional(),
            size: z.number().optional(),
            lastModified: z.iso.datetime().optional(),
            etag: z.string().optional(),
            prefix: z.string().optional(),
          }),
        ),
      }),
    },
    RECREATE_METALINK: {
      method: 'put',
      path: `${bucketPrefix}/meta-links/${objectSegment}`,
      request: objectRequest(),
      responses: jsonResponse({
        schema: z.object({
          success: z.boolean(),
          metaLink: z.any().optional(),
        }),
      }),
    },
  };
};

/** The bucket-in-path shape, unchanged - every existing importer keeps working. */
export const StaticAssetDefinitions = buildAssetDefinitions({});
