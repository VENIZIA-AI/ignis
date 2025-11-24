import { getError } from '@/helpers/error';
import { Context } from 'hono';
import fs from 'node:fs';
import path from 'node:path';

// -------------------------------------------------------------------------
export interface IRequestedRemark {
  id: string;
  url: string;
  method: string;
  [extra: string | symbol]: any;
}

interface IParseMultipartOptions {
  storage?: 'memory' | 'disk';
  uploadDir?: string;
  context: Context;
}

interface IParsedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  filename?: string;
  path?: string;
}

export const parseMultipartBody = async (opts: IParseMultipartOptions): Promise<IParsedFile[]> => {
  const { storage = 'memory', uploadDir = './uploads', context } = opts;

  if (storage === 'disk' && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const formData = await context.req.formData();
  const files: IParsedFile[] = [];

  for (const [fieldname, value] of formData.entries()) {
    if (typeof value === 'string') {
      continue;
    }

    const file = value as File;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsedFile: IParsedFile = {
      fieldname,
      originalname: file.name,
      encoding: 'utf8', // Default encoding
      mimetype: file.type,
      size: file.size,
    };

    switch (storage) {
      case 'memory': {
        parsedFile.buffer = buffer;
        break;
      }
      case 'disk': {
        // Store on disk (like multer.diskStorage())
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        // Sanitize filename to prevent path traversal
        const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${timestamp}-${randomString}-${sanitizedName}`;
        const filepath = path.join(uploadDir, filename);

        fs.writeFileSync(filepath, buffer);

        parsedFile.filename = filename;
        parsedFile.path = filepath;
        break;
      }
      default: {
        throw getError({
          message: `[parseMultipartBody] storage: ${storage} | Invalid storage type | Valids: ['memory', 'disk']`,
        });
      }
    }

    files.push(parsedFile);
  }

  return files;
};

// -------------------------------------------------------------------------
/* export const getRequestId = (opts: { request: Request }) => {
  return get(opts.request, 'requestId');
}; */

// -------------------------------------------------------------------------
/* export const getRequestIp = (opts: { request: Request }) => {
  return get(opts.request, 'requestForwardedIp') ?? 'N/A';
}; */

// -------------------------------------------------------------------------
/* export const getRequestRemark = (opts: { request: Request }): IRequestedRemark | undefined => {
  return get(opts.request, 'requestedRemark');
}; */
