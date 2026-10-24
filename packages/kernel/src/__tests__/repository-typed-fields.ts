/**
 * Never run. `tsc` checks the body during the build: `fields` types the row a read returns, and
 * every `@ts-expect-error` below fails the build the day it stops being an error.
 */
import type { IReadableRepository } from '@/repository';

type TProduct = { id: string; name: string; price: number; description: string | null };

declare const repo: IReadableRepository<TProduct>;

type TOrder = { id: string; status: string; items?: Array<{ id: string }> };

declare const orders: IReadableRepository<TOrder>;

type TEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <Assertion extends true>(): Assertion | undefined => undefined;

export async function typedFieldsShape() {
  // Array form: the row is exactly the listed keys.
  const byArray = await repo.find({ filter: { fields: ['id', 'name'] } });
  assertType<TEqual<typeof byArray, Array<Pick<TProduct, 'id' | 'name'>>>>();

  // Object form: only a `true` entry selects.
  const byObject = await repo.find({ filter: { fields: { id: true, price: true } } });
  assertType<TEqual<typeof byObject, Array<Pick<TProduct, 'id' | 'price'>>>>();

  // The same on findOne and findById.
  const one = await repo.findOne({ filter: { fields: ['name'] } });
  assertType<TEqual<NonNullable<typeof one>, Pick<TProduct, 'name'>>>();
  const byId = await repo.findById({ id: 'a', filter: { fields: ['price'] } });
  assertType<TEqual<NonNullable<typeof byId>, Pick<TProduct, 'price'>>>();

  // No `fields`: the whole row.
  const full = await repo.find({ filter: { where: { name: 'x' } } });
  assertType<TEqual<typeof full, Array<TProduct>>>();

  // A `fields` that is not a literal (a variable typed as the wide union): the whole row.
  const wide: Array<keyof TProduct> = ['id'];
  const dynamic = await repo.find({ filter: { fields: wide } });
  assertType<TEqual<typeof dynamic, Array<TProduct>>>();

  // An explicit result type still wins over `fields`.
  const named = await repo.find<{ id: string; extra: number }>({ filter: { fields: ['id'] } });
  assertType<TEqual<typeof named, Array<{ id: string; extra: number }>>>();

  // A relation an `include` adds (an optional key of the model) stays readable beside the selected columns.
  const order = await orders.findOne({
    filter: { fields: ['id'], include: [{ relation: 'items' }] },
  });
  assertType<TEqual<NonNullable<typeof order>['items'], TOrder['items']>>();

  // A typo in `fields` is an error.
  // @ts-expect-error - 'nmae' is not a column of TProduct
  await repo.find({ filter: { fields: ['id', 'nmae'] } });

  // Reading a column that was not selected is an error.
  const name: string = byArray[0]!.name;
  // @ts-expect-error - 'price' was not selected
  const price = byArray[0]!.price;

  return { name, price };
}
