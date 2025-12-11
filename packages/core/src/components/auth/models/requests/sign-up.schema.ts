import { z } from "@hono/zod-openapi";

export const SignUpRequestSchema = z
  .object({
    username: z.string().nonempty().min(8),
    credential: z.string().nonempty().min(8),
  })
  .openapi({
    required: ["username", "credential"],
    examples: [
      {
        username: "example_username",
        credential: "example_credential",
      },
    ],
  });

export type TSignUpRequest = z.infer<typeof SignUpRequestSchema>;
