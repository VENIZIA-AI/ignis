export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };
export type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };

export type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
export type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;
