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
import { BaseController, controller, ... } from '@vez/ignis';
import { parseMultipartBody } from '@vez/ignis';

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
