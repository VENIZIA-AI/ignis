# Request Utility

The Request utility provides functions for handling HTTP request data, such as parsing multipart form data, and utilities for creating secure Content-Disposition headers.

## `parseMultipartBody`

The `parseMultipartBody` function is an asynchronous utility for parsing `multipart/form-data` request bodies, which is essential for handling file uploads. It can store the uploaded files in memory or on disk.

### `parseMultipartBody(opts)`

-   `opts` (object):
    -   `context` (object with `req` property): The Hono context object for the current request. Uses `context.req.formData()` internally.
    -   `storage` (`'memory'` | `'disk'`, optional): The storage strategy for uploaded files. Defaults to `'memory'`.
    -   `uploadDir` (string, optional): The directory to save files to when using the `'disk'` storage strategy. Defaults to `'./uploads'`. The directory is created recursively if it does not exist.

The function returns a `Promise` that resolves to an array of `IParsedFile` objects. String form fields are skipped (only `File` entries are processed).

### `IParsedFile` Interface

-   `fieldname`: The name of the form field.
-   `originalname`: The original name of the uploaded file.
-   `encoding`: The file's encoding (always `'utf8'`).
-   `mimetype`: The MIME type of the file.
-   `size`: The size of the file in bytes.
-   `buffer` (Buffer, optional): The file's content as a Buffer (if `storage` is `'memory'`).
-   `filename` (string, optional): The generated name of the file on disk (if `storage` is `'disk'`). Format: `{timestamp}-{randomString}-{sanitizedOriginalName}`.
-   `path` (string, optional): The full path to the file on disk (if `storage` is `'disk'`).

### Example

Here is an example of how to use `parseMultipartBody` in a controller to handle a file upload.

```typescript
import { BaseRestController, controller } from '@venizia/ignis';
import { parseMultipartBody, HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/files' })
export class FileController extends BaseRestController {
  // ...
  override binding() {
    this.defineRoute({
      configs: {
        path: '/upload',
        method: 'post',
        // Note: You would typically define a request body schema
        // for multipart/form-data in your OpenAPI spec.
      },
      handler: async (c) => {
        try {
          const files = await parseMultipartBody({
            context: c,
            storage: 'disk', // or 'memory'
            uploadDir: './my-uploads',
          });

          console.log('Uploaded files:', files);

          return c.json(
            { message: `${files.length} file(s) uploaded successfully.` },
            HTTP.ResultCodes.RS_2.Ok,
          );
        } catch (error) {
          return c.json(
            { message: 'Failed to upload files', error: error.message },
            HTTP.ResultCodes.RS_5.InternalServerError,
          );
        }
      },
    });
  }
}
```

---

## Content-Disposition Utilities

These utilities help create secure, RFC-compliant `Content-Disposition` headers for file downloads.

### `createContentDispositionHeader`

Creates a safe Content-Disposition header with proper filename encoding for file downloads.

#### `createContentDispositionHeader(opts)`

-   `opts` (object):
    -   `filename` (string): The filename to use in the Content-Disposition header.
    -   `type` (`'attachment'` | `'inline'`): The disposition type.

The function returns a properly formatted `Content-Disposition` header string with both ASCII and UTF-8 encoded filenames for maximum browser compatibility.

**Features:**
- Automatic filename sanitization via `sanitizeFilename()`
- UTF-8 encoding support via `encodeRFC5987()`
- RFC 5987 compliant
- Dual `filename` / `filename*` for browser compatibility

**Example:**

```typescript
import { createContentDispositionHeader } from '@venizia/ignis-helpers';

// Attachment (file download)
ctx.header('content-disposition', createContentDispositionHeader({
  filename: 'my-document.pdf',
  type: 'attachment',
}));
// Output: attachment; filename="my-document.pdf"; filename*=UTF-8''my-document.pdf

// Inline (display in browser)
ctx.header('content-disposition', createContentDispositionHeader({
  filename: 'report.pdf',
  type: 'inline',
}));
// Output: inline; filename="report.pdf"; filename*=UTF-8''report.pdf
```

---

### `sanitizeFilename`

Sanitizes a filename for safe use, removing path components and dangerous characters. Useful for HTTP headers (e.g., Content-Disposition) and general file handling.

#### `sanitizeFilename(filename: string): string`

-   `filename` (string): The filename to sanitize.

Returns a safe filename suitable for use in headers or filesystem operations.

**Features:**
- Removes path components via `path.basename()` (prevents directory traversal attacks)
- Allows only word characters (`\w`), spaces, hyphens, underscores, and dots
- Replaces dangerous characters with underscores
- Removes leading dots (prevents hidden files)
- Replaces consecutive dots with a single dot
- Removes ".." patterns (additional path traversal protection)
- Returns `'download'` for empty, suspicious, or invalid filenames

**Example:**

```typescript
import { sanitizeFilename } from '@venizia/ignis-helpers';

sanitizeFilename('../../etc/passwd');        // Returns: 'passwd'
sanitizeFilename('my<file>name.txt');        // Returns: 'my_file_name.txt'
sanitizeFilename('.hidden');                 // Returns: 'hidden'
sanitizeFilename('file...txt');              // Returns: 'file.txt'
sanitizeFilename('');                        // Returns: 'download'
sanitizeFilename('..');                      // Returns: 'download'
```


### `encodeRFC5987`

Encodes a filename according to RFC 5987 for use in HTTP headers. Encodes using `encodeURIComponent` and additionally escapes single quotes, parentheses, and asterisks.

#### `encodeRFC5987(filename: string): string`

-   `filename` (string): The filename to encode.

Returns an RFC 5987 encoded string suitable for the `filename*` parameter in Content-Disposition headers.

**Example:**

```typescript
import { encodeRFC5987 } from '@venizia/ignis-helpers';

encodeRFC5987('my document.pdf');     // Returns: 'my%20document.pdf'
```


## `IRequestedRemark` Interface

The Request utility also exports the `IRequestedRemark` interface, which describes a request remark object:

-   `id` (string): The request identifier.
-   `url` (string): The request URL.
-   `method` (string): The HTTP method.
-   `[extra: string | symbol]`: Additional arbitrary properties.


## Complete File Download Example

Here's a complete example combining multipart upload parsing with secure file downloads:

```typescript
import { BaseRestController, controller } from '@venizia/ignis';
import { parseMultipartBody, createContentDispositionHeader, HTTP } from '@venizia/ignis-helpers';
import fs from 'node:fs';
import path from 'node:path';

@controller({ path: '/files' })
export class FileController extends BaseRestController {
  override binding() {
    // Upload endpoint
    this.bindRoute({
      configs: { path: '/upload', method: 'post' },
    }).to({
      handler: async (ctx) => {
        const files = await parseMultipartBody({
          context: ctx,
          storage: 'disk',
          uploadDir: './uploads',
        });

        return ctx.json(
          {
            message: 'Files uploaded successfully',
            files: files.map(f => ({ name: f.originalname, size: f.size })),
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // Download endpoint
    this.bindRoute({
      configs: { path: '/:filename', method: 'get' },
    }).to({
      handler: async (ctx) => {
        const { filename } = ctx.req.valid('param');
        const filePath = path.join('./uploads', filename);

        // Read file
        const fileStat = fs.statSync(filePath);
        const fileStream = fs.createReadStream(filePath);

        // Set secure headers
        ctx.header('content-type', 'application/octet-stream');
        ctx.header('content-length', fileStat.size.toString());
        ctx.header('content-disposition', createContentDispositionHeader({
          filename,
          type: 'attachment',
        }));
        ctx.header('x-content-type-options', 'nosniff');

        return new Response(fileStream, {
          headers: ctx.res.headers,
          status: HTTP.ResultCodes.RS_2.Ok,
        });
      },
    });
  }
}
```
