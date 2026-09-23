import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { repository } from '@venizia/ignis';
import { BaseMetaLinkModel, BaseMetaLinkRepository } from '@venizia/ignis/static-asset';

/** The static-asset component writes one MetaLink row per upload through this repository. */
@repository({ model: BaseMetaLinkModel, dataSource: PostgresDataSource })
export class MetaLinkRepository extends BaseMetaLinkRepository {}
