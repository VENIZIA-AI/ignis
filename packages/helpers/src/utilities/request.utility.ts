import { getError } from "@/helpers/error";
import fs from "node:fs";
import path from "node:path";

// -------------------------------------------------------------------------
export interface IRequestedRemark {
  id: string;
  url: string;
  method: string;
  [extra: string | symbol]: any;
}

interface IParseMultipartOptions<C extends { req: any } = { req: any }> {
  storage?: "memory" | "disk";
  uploadDir?: string;
  context: C;
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

export const parseMultipartBody = async <C extends { req: any } = { req: any }>(
  opts: IParseMultipartOptions<C>,
): Promise<IParsedFile[]> => {
  const { storage = "memory", uploadDir = "./uploads", context } = opts;

  if (storage === "disk" && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const formData = await context.req.formData();
  const files: IParsedFile[] = [];

  for (const [fieldname, value] of formData.entries()) {
    if (typeof value === "string") {
      continue;
    }

    const file = value as File;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsedFile: IParsedFile = {
      fieldname,
      originalname: file.name,
      encoding: "utf8", // Default encoding
      mimetype: file.type,
      size: file.size,
    };

    switch (storage) {
      case "memory": {
        parsedFile.buffer = buffer;
        break;
      }
      case "disk": {
        // Store on disk (like multer.diskStorage())
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        // Sanitize filename to prevent path traversal
        const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
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
// Sanitize filename for Content-Disposition
export const sanitizeFilename = (filename: string): string => {
  // Remove any path components (security)
  const basename = path.basename(filename);

  // Remove or replace dangerous characters
  // Allow only alphanumeric, spaces, hyphens, underscores, and dots
  const sanitized = basename.replace(/[^\w\s.-]/g, "_");

  // Prevent empty filename
  return sanitized || "download";
};

// Create RFC 5987 encoded filename
export const encodeRFC5987 = (filename: string): string => {
  return encodeURIComponent(filename)
    .replace(/['()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\*/g, "%2A");
};

// Create safe Content-Disposition header
export const createContentDispositionHeader = (filename: string): string => {
  const sanitized = sanitizeFilename(filename);
  const encoded = encodeRFC5987(sanitized);

  // Use both ASCII fallback and UTF-8 encoded version for better compatibility
  // filename= for old browsers, filename*= for modern browsers with UTF-8 support
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
};
