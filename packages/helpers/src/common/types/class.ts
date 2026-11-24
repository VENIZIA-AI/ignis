import type { TAbstractConstructor } from '@venizia/ignis-inversion';

// The constructor and class types live in inversion, the lowest layer. One declaration, re-exported here so every
// `@venizia/ignis-helpers/common` import keeps working.
export type { TAbstractConstructor, TClass, TConstructor } from '@venizia/ignis-inversion';

/** An abstract class producing `T`. */
export type TAbstractClass<T> = TAbstractConstructor<T>;

/**
 * The constructor shape a mixin base takes. TypeScript requires `new (...args: any[]) => T` here (error TS2545: a mixin class must have a constructor with a single rest parameter of type `any[]`), so this is the one `any` the language mandates.
 */
export type TMixinConstructor<T> = new (...args: any[]) => T;
/** The abstract form of {@link TMixinConstructor}. */
export type TAbstractMixinConstructor<T> = abstract new (...args: any[]) => T;

/** The constructor type a mixin accepts as its base: it must produce at least the members of `T`. */
export type TMixinTarget<T> = TMixinConstructor<{ [P in keyof T]: T[P] }>;
/** `TMixinTarget` for an abstract base class. */
export type TAbstractMixinTarget<T> = TAbstractMixinConstructor<{ [P in keyof T]: T[P] }>;
