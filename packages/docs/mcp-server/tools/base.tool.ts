import type { Tool } from '@mastra/core/tools';
import type { z } from 'zod';

/** Abstract base class for all MCP documentation tools. */
export abstract class BaseTool<TInputSchema extends z.ZodType, TOutputSchema extends z.ZodType> {
  abstract readonly id: string;
  abstract readonly description: string;
  abstract readonly inputSchema: TInputSchema;
  abstract readonly outputSchema: TOutputSchema;

  abstract execute(opts: z.infer<TInputSchema>): Promise<z.infer<TOutputSchema>>;

  /** Converts this tool instance to a Mastra-compatible tool object. */
  abstract getTool(): Tool<z.infer<TInputSchema>, z.infer<TOutputSchema>>;
}
