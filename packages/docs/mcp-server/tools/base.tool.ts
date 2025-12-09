import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

/**
 * The tool type returned by createTool.
 */
export type MastraTool = ReturnType<typeof createTool>;

/**
 * Re-export createTool for use in subclasses.
 */
export { createTool };

// ============================================================================
// BASE TOOL CLASS
// ============================================================================

/**
 * Abstract base class for all MCP documentation tools.
 *
 * Provides a consistent structure for tool implementation with:
 * - Singleton pattern via getInstance()
 * - Required abstract members for tool definition
 * - Abstract toMastraTool() for type-safe conversion
 *
 * @template TInputSchema - The Zod input schema type
 * @template TOutputSchema - The Zod output schema type
 *
 * @example
 * ```typescript
 * class MyTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
 *   readonly id = 'myTool';
 *   readonly description = 'Does something useful';
 *   readonly inputSchema = InputSchema;
 *   readonly outputSchema = OutputSchema;
 *
 *   async execute(input: z.infer<typeof InputSchema>) {
 *     return { result: 'done' };
 *   }
 *
 *   toMastraTool() {
 *     return createTool({
 *       id: this.id,
 *       description: this.description,
 *       inputSchema: this.inputSchema,
 *       outputSchema: this.outputSchema,
 *       execute: async ({ context }) => this.execute(context),
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseTool<
  TInputSchema extends z.ZodType = z.ZodType,
  TOutputSchema extends z.ZodType = z.ZodType,
> {
  /**
   * Unique identifier for the tool.
   * Used by MCP clients to invoke the tool.
   *
   * @example 'searchDocs', 'getDocContent', 'listCategories'
   */
  abstract readonly id: string;

  /**
   * Detailed description of the tool's purpose and usage.
   * Should include: PURPOSE, WHEN TO USE, WHEN NOT TO USE, OUTPUT description.
   * This helps AI agents understand when and how to use the tool.
   */
  abstract readonly description: string;

  /**
   * Zod schema defining the input parameters.
   * Each field should have a .describe() for AI agent guidance.
   */
  abstract readonly inputSchema: TInputSchema;

  /**
   * Zod schema defining the output structure.
   * Helps AI agents understand and parse the response.
   */
  abstract readonly outputSchema: TOutputSchema;

  /**
   * Executes the tool's main logic.
   *
   * @param input - Validated input matching inputSchema
   * @returns Promise resolving to output matching outputSchema
   */
  abstract execute(input: z.infer<TInputSchema>): Promise<z.infer<TOutputSchema>>;

  /**
   * Converts this tool instance to a Mastra-compatible tool object.
   * Must be implemented by each subclass to ensure proper type inference.
   *
   * @returns A tool object compatible with @mastra/core createTool format
   *
   * @example
   * ```typescript
   * toMastraTool() {
   *   return createTool({
   *     id: this.id,
   *     description: this.description,
   *     inputSchema: this.inputSchema,
   *     outputSchema: this.outputSchema,
   *     execute: async ({ context }) => this.execute(context),
   *   });
   * }
   * ```
   */
  abstract getTool(): MastraTool;
}
