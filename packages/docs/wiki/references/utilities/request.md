# Request Utility

The Request utility provides functions for handling HTTP request data, such as parsing multipart form data.

## `parseMultipartBody`

The `parseMultipartBody` function is an asynchronous utility for parsing `multipart/form-data` request bodies, which is essential for handling file uploads. It can store the uploaded files in memory or on disk.

### `parseMultipartBody(opts)`

-   `opts` (object):
    -   `context` (Hono.Context): The Hono context object for the current request.
    -   `storage` ('memory' | 'disk', optional): The storage strategy for uploaded files. Defaults to `'memory'`.
    -   `uploadDir` (string, optional): The directory to save files to when using the `'disk'` storage strategy. Defaults to `'./uploads'`.

The function returns a `Promise` that resolves to an array of `IParsedFile` objects.

### `IParsedFile` Interface

-   `fieldname`: The name of the form field.
-   `originalname`: The original name of the uploaded file.
-   `encoding`: The file's encoding.
-   `mimetype`: The MIME type of the file.
-   `size`: The size of the file in bytes.
-   `buffer` (Buffer, optional): The file's content as a Buffer (if `storage` is `'memory'`).
-   `filename` (string, optional): The name of the file on disk (if `storage` is `'disk'`).
-   `path` (string, optional): The full path to the file on disk (if `storage` is `'disk'`).

### Example

Here is an example of how to use `parseMultipartBody` in a controller to handle a file upload.

```typescript
import { BaseController, controller, ... } from '@venizia/ignis';
import { parseMultipartBody } from '@venizia/ignis';

@controller({ path: '/files' })
export class FileController extends BaseController {
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

          return c.json({ message: `${files.length} file(s) uploaded successfully.` });
        } catch (error) {
          return c.json({ message: 'Failed to upload files', error: error.message }, 500);
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

#### `createContentDispositionHeader(filename: string): string`

-   `filename` (string): The filename to use in the Content-Disposition header.

The function returns a properly formatted `Content-Disposition` header string with both ASCII and UTF-8 encoded filenames for maximum browser compatibility.

**Features:**
- Automatic filename sanitization (removes path components and dangerous characters)
- UTF-8 encoding support for international characters
- RFC 5987 compliant
- Fallback for older browsers

**Example:**

```typescript
import { createContentDispositionHeader } from '@venizia/ignis-helpers';

// In a download endpoint
ctx.header('content-disposition', createContentDispositionHeader('my-document.pdf'));

// Output: attachment; filename="my-document.pdf"; filename*=UTF-8''my-document.pdf
```

---

### `sanitizeFilename`

Sanitizes a filename by removing dangerous characters and path components.

#### `sanitizeFilename(filename: string): string`

-   `filename` (string): The filename to sanitize.

Returns a safe filename suitable for use in headers or filesystem operations.

**Features:**
- Removes path components (prevents directory traversal attacks)
- Allows only alphanumeric characters, spaces, hyphens, underscores, and dots
- Replaces dangerous characters with underscores
- Prevents empty filenames

**Example:**

```typescript
import { sanitizeFilename } from '@venizia/ignis-helpers';

sanitizeFilename('../../etc/passwd');        // Returns: 'passwd'
sanitizeFilename('my<file>name.txt');        // Returns: 'my_file_name.txt'
sanitizeFilename('документ.pdf');            // Returns: '_________.pdf'
sanitizeFilename('');                        // Returns: 'download'
```

---

### `encodeRFC5987`

Encodes a filename according to RFC 5987 for use in HTTP headers.

#### `encodeRFC5987(filename: string): string`

-   `filename` (string): The filename to encode.

Returns an RFC 5987 encoded string suitable for the `filename*` parameter in Content-Disposition headers.

**Example:**

```typescript
import { encodeRFC5987 } from '@venizia/ignis-helpers';

encodeRFC5987('my document.pdf');     // Returns: 'my%20document.pdf'
encodeRFC5987('файл.txt');            // Returns: '%D1%84%D0%B0%D0%B9%D0%BB.txt'
```

---

## Complete File Download Example

Here's a complete example combining multipart upload parsing with secure file downloads:

```typescript
import { BaseController, controller } from '@venizia/ignis';
import { parseMultipartBody, createContentDispositionHeader, HTTP } from '@venizia/ignis-helpers';
import fs from 'node:fs';
import path from 'node:path';

@controller({ path: '/files' })
export class FileController extends BaseController {
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

        return ctx.json({
          message: 'Files uploaded successfully',
          files: files.map(f => ({ name: f.originalname, size: f.size })),
        });
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
        ctx.header('content-disposition', createContentDispositionHeader(filename));
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
