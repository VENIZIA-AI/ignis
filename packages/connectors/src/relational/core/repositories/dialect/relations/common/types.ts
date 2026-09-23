import type { RelationTypes } from '@venizia/ignis-kernel';
import type { AnyColumn } from 'drizzle-orm';
import type { TRelationConfig } from '../../../common';
import type { OneRelationSides } from './constants';

/** A foreign key always names at least one column. */
export type TColumns = [AnyColumn, ...Array<AnyColumn>];

export interface IForeignKeyLink {
  columns: TColumns;
  foreignColumns: TColumns;
}

export type TOneMetadata = Extract<TRelationConfig, { type: typeof RelationTypes.ONE }>['metadata'];

export type TManyMetadata = Extract<
  TRelationConfig,
  { type: typeof RelationTypes.MANY }
>['metadata'];

export type TOneResolution =
  | { side: typeof OneRelationSides.OWNING; link: IForeignKeyLink }
  | { side: typeof OneRelationSides.INVERSE };
