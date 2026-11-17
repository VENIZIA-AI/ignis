import type { IMetaLinkRepository } from '@/components/static-asset/common';
import type { TMetaLink, TMetaLinkSchema } from '@/components/static-asset/models';
import type { TTableInsert } from '@venizia/ignis-connectors/postgres';

const SEEDED_AT = '2026-01-01T00:00:00.000Z';

/** A complete row: what the table fills in for a column the caller left out. */
const toRow = (opts: { id: string; data: Partial<TTableInsert<TMetaLinkSchema>> }): TMetaLink => ({
  id: opts.id,
  createdAt: SEEDED_AT,
  modifiedAt: SEEDED_AT,
  bucketName: '',
  objectName: '',
  link: '',
  mimetype: '',
  size: 0,
  etag: null,
  metadata: null,
  storageType: '',
  isSynced: false,
  variant: null,
  sequence: 0,
  principalType: null,
  principalId: null,
  ...opts.data,
});

/** In-memory stand-in for the MetaLink repository: equality `where` only, which is all the component asks of it. */
export class FakeMetaLinkRepository implements IMetaLinkRepository {
  readonly rows: TMetaLink[] = [];
  readonly updateCalls: string[] = [];
  private sequence = 0;

  /** Adds a row as if it was already stored. */
  seed(data: Partial<TTableInsert<TMetaLinkSchema>>): TMetaLink {
    this.sequence += 1;
    const row = toRow({ id: data.id ?? String(this.sequence), data });
    this.rows.push(row);

    return row;
  }

  private matchRows(where: object): TMetaLink[] {
    return this.rows.filter((row) =>
      Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value),
    );
  }

  async create(opts: { data: TTableInsert<TMetaLinkSchema> }) {
    return { count: 1, data: this.seed(opts.data) };
  }

  async updateById(opts: { id: string; data: Partial<TTableInsert<TMetaLinkSchema>> }) {
    this.updateCalls.push('updateById');
    const [row] = this.matchRows({ id: opts.id });
    Object.assign(row, opts.data);

    return { count: 1, data: row };
  }

  async updateBy(opts: { data: Partial<TTableInsert<TMetaLinkSchema>>; where: object }) {
    this.updateCalls.push('updateBy');
    const matched = this.matchRows(opts.where);

    for (const row of matched) {
      Object.assign(row, opts.data);
    }

    return { count: matched.length, data: matched };
  }

  async deleteBy(opts: { where: object }) {
    const matched = new Set(this.matchRows(opts.where));
    const kept = this.rows.filter((row) => !matched.has(row));
    this.rows.length = 0;
    this.rows.push(...kept);

    return { count: matched.size };
  }
}
