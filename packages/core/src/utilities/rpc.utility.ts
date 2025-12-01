import type { BaseApplication } from '@/base/applications';

export type AppType<T extends BaseApplication> = ReturnType<T['getRootRouter']>;
export type InferAppType<T extends BaseApplication> = ReturnType<T['getRootRouter']>;
