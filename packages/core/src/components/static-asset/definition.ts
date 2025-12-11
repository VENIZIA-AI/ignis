import { jsonContent, jsonResponse } from "@/base/models";
import { ErrorSchema, HTTP } from "@venizia/ignis-helpers";
import { z } from "@hono/zod-openapi";

// ================================================================================
export const MINIO_ASSET_ROUTES = {
  ["GET /buckets"]: {
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
  ["GET /buckets/:bucketName/objects/:objectName"]: {
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
  ["GET /buckets/:bucketName/objects/:objectName/download"]: {
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
  ["GET /buckets/:bucketName"]: {
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
  ["POST /buckets/:bucketName"]: {
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
  ["POST /buckets/:bucketName/upload"]: {
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
            schema: z.object({
              files: z.union([z.instanceof(File), z.array(z.instanceof(File))]).openapi({
                type: "array",
                items: {
                  type: "string",
                  format: "binary",
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
  ["DELETE /buckets/:bucketName"]: {
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
