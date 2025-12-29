import { jsonContent, jsonResponse } from '@/base/models';
import { z } from '@hono/zod-openapi';
import { ErrorSchema, HTTP } from '@venizia/ignis-helpers';

// ================================================================================
const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
  }),
});

// ================================================================================
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
  },
  GET_BUCKET_BY_NAME: {
    method: 'get',
    path: '/buckets/:bucketName',
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
  },
  CREATE_BUCKET: {
    method: 'post',
    path: '/buckets/:bucketName',
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
  },
  GET_OBJECT_BY_NAME: {
    method: 'get',
    path: '/buckets/:bucketName/objects/:objectName',
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
  DOWNLOAD_OBJECT_BY_NAME: {
    method: 'get',
    path: '/buckets/:bucketName/objects/:objectName/download',
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
  UPLOAD: {
    method: 'post',
    path: '/buckets/:bucketName/upload',
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
  DELETE_BUCKET: {
    method: 'delete',
    path: '/buckets/:bucketName',
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
  },
  DELETE_OBJECT: {
    method: 'delete',
    path: '/buckets/:bucketName/objects/:objectName',
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
          },
          example: 'photo.jpg',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({
        success: z.boolean(),
      }),
    }),
  },
  LIST_OBJECTS: {
    method: 'get',
    path: '/buckets/:bucketName/objects',
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
  },
  RECREATE_METALINK: {
    method: 'put',
    path: '/buckets/:bucketName/objects/:objectName/meta-links',
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
          },
          example: 'photo.jpg',
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({
        success: z.boolean(),
        metaLink: z.any().optional(),
      }),
    }),
  },
} as const;
