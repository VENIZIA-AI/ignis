import { ConstClass, type TConstValue } from '@/common';

/** How a frame sees rows: `scoped` by its own scope, `system` without one. */
export class ExecutionModes extends ConstClass {
  static readonly SCOPED = 'scoped';
  static readonly SYSTEM = 'system';
}
/** Union of the `ExecutionModes` values. */
export type TExecutionMode = TConstValue<typeof ExecutionModes>;
