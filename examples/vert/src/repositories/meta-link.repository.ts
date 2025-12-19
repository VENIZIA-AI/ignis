import { PostgresDataSource } from '@/datasources';
import { BaseMetaLinkModel, BaseMetaLinkRepository, repository } from '@venizia/ignis';

@repository({
  model: BaseMetaLinkModel,
  dataSource: PostgresDataSource,
})
export class MetaLinkRepository extends BaseMetaLinkRepository {}
