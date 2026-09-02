export type TNullable<T> = T | undefined | null;

export type AnyType = any;
export type AnyObject = Record<string | symbol | number, any>;

export type TOptions<T extends object = {}> = T;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

export type TPrettify<T> = { [K in keyof T]: T[K] } & {};
