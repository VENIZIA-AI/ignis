import {
  BaseMetaLinkModel,
  BaseMetaLinkRepository,
  IDataSource,
  inject,
  metaLinkRelations,
} from '@venizia/ignis';

export class MetaLinkRepository extends BaseMetaLinkRepository {
  constructor(@inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource) {
    super({
      dataSource,
      entityClass: BaseMetaLinkModel,
      relations: metaLinkRelations.definitions,
    });
  }
}
