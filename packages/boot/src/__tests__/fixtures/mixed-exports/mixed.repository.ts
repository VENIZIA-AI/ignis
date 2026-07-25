/** Only the CLASS may be discovered - binding an exported function as an artifact would have the booter call `new` on it. */
export class MixedRepository {}

export function buildWhereClause() {
  return {};
}

export const normalizeId = (id: string) => id.trim();

export const TABLE_NAME = 'mixed';
