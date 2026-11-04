/** Read and write contract of the application environment store; `get` returns `defaultValue` when the key is absent. */
export interface IApplicationEnvironment {
  get<ReturnType, BeforeTransformType = unknown>(
    key: string,
    opts?: {
      defaultValue?: ReturnType;
      transform?: (value: BeforeTransformType) => ReturnType;
    },
  ): ReturnType;
  set<ValueType>(key: string, value: ValueType): any;
}
