---
title: Request Utility
description: Multipart form parsing and secure Content-Disposition header helpers for file uploads and downloads
difficulty: beginner
lastUpdated: 2026-07-16
---

# Request Utility

Functions for handling HTTP request data: parsing `multipart/form-data` bodies for file uploads, and building safe, RFC-compliant `Content-Disposition` headers for downloads.

## In one example

```typescript
import { BaseRestController, controller } from '@venizia/ignis';
import { parseMultipartBody, createContentDispositionHeader, HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/files' })
export class FileController extends BaseRestController {
  override binding() {
    this.bindRoute({ configs: { path: '/upload', method: 'post' } }).to({
      handler: async (ctx) => {
        const files = await parseMultipartBody({ context: ctx, storage: 'disk', uploadDir: './uploads' });
        return ctx.json(
          { message: 'Uploaded', files: files.map(f => ({ name: f.originalname, size: f.size })) },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    this.bindRoute({ configs: { path: '/:filename', method: 'get' } }).to({
      handler: (ctx) => {
        const { filename } = ctx.req.valid('param');
        ctx.header(
          'content-disposition',
          createContentDispositionHeader({ filename, type: 'attachment' }),
        );
        // ... stream the file
      },
    });
  }
}
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `parseMultipartBody` | `parseMultipartBody(opts: { context: { req: any }; storage?: 'memory' \| 'disk'; uploadDir?: string }): Promise<IParsedFile[]>` | Parses a `multipart/form-data` body via `context.req.formData()`. String fields are skipped - only `File` entries are returned. |
| `sanitizeFilename` | `sanitizeFilename(filename: string): string` | Strips path components and dangerous characters from `filename`. Returns `'download'` for empty or suspicious input. |
| `encodeRFC5987` | `encodeRFC5987(filename: string): string` | RFC 5987 encodes `filename` for the `filename*` header parameter (`encodeURIComponent` plus escaped `'`, `(`, `)`, `*`). |
| `createContentDispositionHeader` | `createContentDispositionHeader(opts: { filename: string; type: 'attachment' \| 'inline' }): string` | Builds a full `Content-Disposition` value: sanitizes the filename, then emits both the ASCII `filename=` and UTF-8 `filename*=` forms. |

## Parsed file shape

`parseMultipartBody` resolves to an array of objects (the `IParsedFile` shape, internal to the module - not separately exported):

| Field | Type | Present when |
|-------|------|---------------|
| `fieldname` | `string` | always |
| `originalname` | `string` | always |
| `encoding` | `string` | always - hardcoded `'utf8'` |
| `mimetype` | `string` | always |
| `size` | `number` | always |
| `buffer` | `Buffer` | `storage: 'memory'` (default) |
| `filename` | `string` | `storage: 'disk'` - format `{timestamp}-{randomString}-{sanitizedOriginalName}` |
| `path` | `string` | `storage: 'disk'` |

## Notes

- **`storage` defaults to `'memory'`**; `uploadDir` defaults to `'./uploads'` and is created recursively if it does not exist.
- **`sanitizeFilename` is applied automatically** inside `createContentDispositionHeader` - callers do not need to sanitize twice. It also removes leading dots, collapses repeated dots, and strips `..` sequences to block directory traversal and hidden-file tricks.
- **`createContentDispositionHeader` always emits both forms** (`filename="..."; filename*=UTF-8''...`) for maximum browser compatibility - older browsers read the ASCII fallback, modern ones read the UTF-8 form.
- **`IRequestedRemark`** is a separately exported interface for describing a request: `{ id: string; url: string; method: string; [extra: string | symbol]: any }`. It is not consumed internally by `parseMultipartBody` or any other function on this page - it is a general-purpose shape for application code that needs to tag a request with an id, URL, method, and arbitrary extra fields.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Static Asset Component](/extensions/components/static-asset/) - built-in upload/download CRUD built on this utility
- [Request Tracker Component](/extensions/components/request-tracker) - `x-request-id` header and request body parsing

**Files:**

- [`packages/helpers/src/utilities/request.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/request.utility.ts)
