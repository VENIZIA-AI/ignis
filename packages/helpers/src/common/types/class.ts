/** A concrete class constructor producing `T`. */
export type TConstructor<T> = new (...args: any[]) => T;
/** An abstract class constructor producing `T`; it cannot be called with `new` directly. */
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
/** A concrete class producing `T`, with any static members allowed. */
export type TClass<T> = TConstructor<T> & { [property: string]: any };
/** An abstract class producing `T`, with any static members allowed. */
export type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };

/** The constructor type a mixin accepts as its base: it must produce at least the members of `T`. */
export type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
/** `TMixinTarget` for an abstract base class. */
export type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;
