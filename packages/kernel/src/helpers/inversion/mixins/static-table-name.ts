/** `TABLE_NAME` is deliberately outside `IEntityStatics` (not part of the neutral contract), so it is read here, checked. */
export class StaticTableName {
  /** The static `TABLE_NAME` of a model class, when it is a string. */
  static read(opts: { modelClass: object }): string | undefined {
    const { modelClass } = opts;

    return 'TABLE_NAME' in modelClass && typeof modelClass.TABLE_NAME === 'string'
      ? modelClass.TABLE_NAME
      : undefined;
  }
}
