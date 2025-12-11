import { z } from "@hono/zod-openapi";

// -------------------------------------------------------------------------
export const requiredString = (opts?: { min?: number; max?: number; fixed?: number }) => {
  const { min, max, fixed } = opts ?? {};
  let rs = z.string().nonempty();

  if (min) {
    rs = rs.min(min);
  }

  if (max) {
    rs = rs.max(max);
  }

  if (fixed) {
    rs = rs.length(fixed);
  }

  return rs;
};

// -------------------------------------------------------------------------
export const AnyObjectSchema = z.object().catchall(z.any()).openapi({
  description: "Unknown schema",
});
