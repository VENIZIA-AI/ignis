const isNamedRow = (value: unknown): value is { name: string } =>
  typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string';

/** The rows an include loaded under `relation` that `isRelated` accepts: the key is not part of the table's row type. */
export const relatedRowsOf = <Related>(opts: {
  row: object;
  relation: string;
  isRelated: (value: unknown) => value is Related;
}): Array<Related> => {
  const related: unknown = Reflect.get(opts.row, opts.relation);

  return Array.isArray(related) ? related.filter(opts.isRelated) : [];
};

/** The named rows an include loaded under `relation`. */
export const relatedOf = (opts: { row: object; relation: string }): Array<{ name: string }> =>
  relatedRowsOf({ ...opts, isRelated: isNamedRow });
