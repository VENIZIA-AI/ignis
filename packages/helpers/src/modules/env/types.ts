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
