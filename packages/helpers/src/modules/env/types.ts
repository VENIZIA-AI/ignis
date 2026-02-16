// ----------------------------------------------------------------------------------------------------------------------------------------
// Environment Interface
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IApplicationEnvironment {
  get<ReturnType>(key: string): ReturnType;
  set<ValueType>(key: string, value: ValueType): any;
}
