import { jsonContent, jsonResponse } from '@/base/models';
import { ErrorSchema, HTTP } from '@venizia/ignis-helpers';
import { z } from '@hono/zod-openapi';

// ================================================================================
export const MINIO_ASSET_ROUTES = {
  ['GET /buckets']: {
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
  ['GET /buckets/:bucket_name/objects/:object_name']: {
    method: 'get',
    path: '/buckets/:bucket_name/objects/:object_name',
    request: {
      params: z.object({
        bucket_name: z.string().openapi({
          param: {
            name: 'bucket_name',
            in: 'path',
          },
          example: 'images',
        }),
        object_name: z.string().openapi({
          param: {
            name: 'object_name',
            in: 'path',
          },
          example: 'photo.jpg',
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
  },
  ['GET /buckets/:bucket_name/objects/:object_name/download']: {
    method: 'get',
    path: '/buckets/:bucket_name/objects/:object_name/download',
    request: {
      params: z.object({
        bucket_name: z.string().openapi({
          param: {
            name: 'bucket_name',
            in: 'path',
          },
          example: 'images',
        }),
        object_name: z.string().openapi({
          param: {
            name: 'object_name',
            in: 'path',
          },
          example: 'photo.jpg',
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
  },
  ['GET /buckets/:bucket_name']: {
    method: 'get',
    path: '/buckets/:bucket_name',
    request: {
      params: z.object({
        bucket_name: z.string('bucket_name').openapi({
          param: {
            name: 'bucket_name',
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
  },
  ['POST /buckets/:bucket_name']: {
    method: 'post',
    path: '/buckets/:bucket_name',
    request: {
      params: z.object({
        bucket_name: z.string('bucket_name').openapi({
          param: {
            name: 'bucket_name',
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
  },
  ['POST /buckets/:bucket_name/upload']: {
    method: 'post',
    path: '/buckets/:bucket_name/upload',
    request: {
      params: z.object({
        bucket_name: z.string('bucket_name').openapi({
          param: {
            name: 'bucket_name',
            in: 'path',
          },
          example: 'images',
        }),
      }),
      query: z.object({
        folderPath: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'folderPath',
              in: 'query',
              description: 'Optional folder path to upload files into',
            },
            example: '20250101',
          }),
      }),
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
                type: 'array',
                items: {
                  type: 'string',
                  format: 'binary',
                },
              }),
            }),
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
        }),
      ),
    }),
  },
  ['DELETE /buckets/:bucket_name']: {
    method: 'delete',
    path: '/buckets/:bucket_name',
    request: {
      params: z.object({
        bucket_name: z.string('bucket_name').openapi({
          param: {
            name: 'bucket_name',
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
  },
} as const;
