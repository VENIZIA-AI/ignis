import type { IAuthRouteConfig } from '@/base';
import { jsonContent, jsonResponse } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ErrorSchema } from '@venizia/ignis-helpers';

const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
  }),
});

export const StaticAssetDefinitions = {
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
  } satisfies IAuthRouteConfig,
  GET_BUCKET_BY_NAME: {
    method: 'get',
    path: '/buckets/{bucketName}',
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z
        .object({
          name: z.string(),
          creationDate: z.iso.datetime(),
        })
        .nullable(),
    }),
  } satisfies IAuthRouteConfig,
  CREATE_BUCKET: {
    method: 'post',
    path: '/buckets/{bucketName}',
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z
        .object({
          name: z.string(),
          creationDate: z.iso.datetime(),
        })
        .nullable(),
    }),
  } satisfies IAuthRouteConfig,
  GET_OBJECT_BY_NAME: {
    method: 'get',
    path: '/buckets/{bucketName}/objects/{objectName}',
    // Native Hono path: /buckets/:bucketName/objects/:objectName{.+} - the regex param is what allows folder paths (photos/2024/file.jpg).
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
        objectName: z.string().openapi({
          param: {
            name: 'objectName',
            in: 'path',
            description: 'Object name or path (e.g., "photo.jpg" or "photos/2024/photo.jpg")',
          },
          example: 'photos/2024/photo.jpg',
        }),
      }),
    },
    responses: {
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
    },
  } satisfies IAuthRouteConfig,
  DOWNLOAD_OBJECT_BY_NAME: {
    method: 'get',
    path: '/buckets/{bucketName}/download/{objectName}',
    // Native Hono path: /buckets/:bucketName/download/:objectName{.+} - the action prefix must precede the wildcard because the Hono catch-all is greedy.
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
        objectName: z.string().openapi({
          param: {
            name: 'objectName',
            in: 'path',
            description: 'Object name or path (e.g., "photo.jpg" or "photos/2024/photo.jpg")',
          },
          example: 'photos/2024/photo.jpg',
        }),
      }),
    },
    responses: {
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
    },
  } satisfies IAuthRouteConfig,
  UPLOAD: {
    method: 'post',
    path: '/buckets/{bucketName}/upload',
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
      }),
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
  } satisfies IAuthRouteConfig,
  DELETE_BUCKET: {
    method: 'delete',
    path: '/buckets/{bucketName}',
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({
        isDeleted: z.boolean(),
      }),
    }),
  } satisfies IAuthRouteConfig,
  DELETE_OBJECT: {
    method: 'delete',
    path: '/buckets/{bucketName}/objects/{objectName}',
    // Native Hono path: /buckets/:bucketName/objects/:objectName{.+}
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
        objectName: z.string().openapi({
          param: {
            name: 'objectName',
            in: 'path',
            description: 'Object name or path (e.g., "photo.jpg" or "photos/2024/photo.jpg")',
          },
          example: 'photos/2024/photo.jpg',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({
        success: z.boolean(),
      }),
    }),
  } satisfies IAuthRouteConfig,
  LIST_OBJECTS: {
    method: 'get',
    path: '/buckets/{bucketName}/objects',
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
      }),
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
  } satisfies IAuthRouteConfig,
  RECREATE_METALINK: {
    method: 'put',
    path: '/buckets/{bucketName}/meta-links/{objectName}',
    // Native Hono path: /buckets/:bucketName/meta-links/:objectName{.+} - the action prefix must precede the wildcard because the Hono catch-all is greedy.
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: 'bucketName',
            in: 'path',
          },
          example: 'images',
        }),
        objectName: z.string().openapi({
          param: {
            name: 'objectName',
            in: 'path',
            description: 'Object name or path (e.g., "photo.jpg" or "photos/2024/photo.jpg")',
          },
          example: 'photos/2024/photo.jpg',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({
        success: z.boolean(),
        metaLink: z.any().optional(),
      }),
    }),
  } satisfies IAuthRouteConfig,
};
