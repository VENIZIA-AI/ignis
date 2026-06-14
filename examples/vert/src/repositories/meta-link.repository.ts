import { PostgresDataSource } from '@/datasources';
import { repository } from '@venizia/ignis';
import { BaseMetaLinkModel, BaseMetaLinkRepository } from '@venizia/ignis/static-asset';

@repository({ model: BaseMetaLinkModel, dataSource: PostgresDataSource })
export class MetaLinkRepository extends BaseMetaLinkRepository {}
