/** The rows an include loaded under `relation`: the key is not part of the table's row type. */
export const relatedOf = (opts: { row: object; relation: string }): Array<{ name: string }> => {
  const related: unknown = Reflect.get(opts.row, opts.relation);

  return Array.isArray(related) ? related : [];
};
