export interface IApplicationEnvironment {
  get<ReturnType>(key: string, defaultValue?: ReturnType): ReturnType;
  set<ValueType>(key: string, value: ValueType): any;
}
