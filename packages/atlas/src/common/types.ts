import type { AtlasModes, Corpora } from './constants';

type TConstructor<T> = new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };
type ValueOf<T> = T[keyof T];

/** Copied from `@venizia/ignis-helpers/common` (`src/common/types/const-value.ts`) - atlas must not depend on helpers. */
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

export type TAtlasMode = TConstValue<typeof AtlasModes>;
export type TCorpus = TConstValue<typeof Corpora>;
