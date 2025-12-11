import { jsonContent, jsonResponse } from "@/base/models";
import { z } from "@hono/zod-openapi";
import { ErrorSchema, HTTP } from "@venizia/ignis-helpers";

// ================================================================================
const MultipartBodySchema = z.object({
  files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
    type: "array",
    items: {
      type: "string",
      format: "binary",
    },
  }),
});

// ================================================================================
export const MinIOAssetDefinitions = {
  GET_BUCKETS: {
    method: "get",
    path: "/buckets",
    responses: jsonResponse({
      schema: z.array(
        z.object({
          name: z.string(),
          creationDate: z.iso.datetime(),
        }),
      ),
    }),
  },
  GET_OBJECT_BY_NAME: {
    method: "get",
    path: "/buckets/:bucketName/objects/:objectName",
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: "bucketName",
            in: "path",
          },
          example: "images",
        }),
        objectName: z.string().openapi({
          param: {
            name: "objectName",
            in: "path",
          },
          example: "photo.jpg",
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: {
        description: "File stream response",
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
      ["4xx | 5xx"]: jsonContent({ description: "Error Response", schema: ErrorSchema }),
    },
  },
  DOWNLOAD_OBJECT_BY_NAME: {
    method: "get",
    path: "/buckets/:bucketName/objects/:objectName/download",
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: "bucketName",
            in: "path",
          },
          example: "images",
        }),
        objectName: z.string().openapi({
          param: {
            name: "objectName",
            in: "path",
          },
          example: "photo.jpg",
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: {
        description: "File stream response",
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
      ["4xx | 5xx"]: jsonContent({ description: "Error Response", schema: ErrorSchema }),
    },
  },
  GET_BUCKET_BY_NAME: {
    method: "get",
    path: "/buckets/:bucketName",
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: "bucketName",
            in: "path",
          },
          example: "images",
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
    method: "post",
    path: "/buckets/:bucketName",
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: "bucketName",
            in: "path",
          },
          example: "images",
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
  UPLOAD: {
    method: "post",
    path: "/buckets/:bucketName/upload",
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: "bucketName",
            in: "path",
          },
          example: "images",
        }),
      }),
      query: z.object({
        folderPath: z
          .string()
          .optional()
          .openapi({
            param: {
              name: "folderPath",
              in: "query",
              description: "Optional folder path to upload files into",
            },
            example: "20250101",
          }),
      }),
      body: {
        content: {
          "multipart/form-data": {
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
        }),
      ),
    }),
  },
  DELETE_BUCKET: {
    method: "delete",
    path: "/buckets/:bucketName",
    request: {
      params: z.object({
        bucketName: z.string().openapi({
          param: {
            name: "bucketName",
            in: "path",
          },
          example: "images",
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

// ================================================================================
export const StaticResourceDefinitions = {
  UPLOAD: {
    method: "post",
    path: "/resources/upload",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: MultipartBodySchema,
          },
        },
      },
    },
    responses: jsonResponse({
      schema: z.array(
        z.object({
          objectName: z.string().openapi({
            description: "Name of the uploaded resource",
            example: "20250101/photo.jpg",
          }),
        }),
      ),
    }),
  },
  DOWNLOAD: {
    method: "get",
    path: "/resources/:objectName/download",
    request: {
      params: z.object({
        objectName: z.string().openapi({
          param: {
            name: "objectName",
            in: "path",
          },
          example: "photo.jpg",
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: {
        description: "File stream response",
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
      ["4xx | 5xx"]: jsonContent({ description: "Error Response", schema: ErrorSchema }),
    },
  },
} as const;
