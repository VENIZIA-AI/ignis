import type { IModelAccessSettings } from '@venizia/ignis-kernel';

/** What a model's `access.resolve` answers: a scope `where`, `ScopeFilters.UNRESTRICTED`, or no scope. */
export type TScopeResolution = ReturnType<IModelAccessSettings['resolve']>;
