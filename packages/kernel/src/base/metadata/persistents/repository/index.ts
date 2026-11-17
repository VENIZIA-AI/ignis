import { MetadataRegistry } from '@/helpers/inversion';
import type { TRepositoryMetadata } from '@/helpers/inversion';
import type { IDataSource } from '../../../datasources';
import type { AbstractEntity } from '../../../models';
import { applyRepositoryMetadata, inheritRepositoryMetadata } from './resolve';

/**
 * Class decorator that registers a repository and binds it to a model (or, for a remote repository, only a datasource). Called without arguments on a subclass it reuses the type, model and datasource of its nearest decorated parent; registration options are not inherited.
 *
 * @example
 * ```typescript
 * import { repository } from '@venizia/ignis';
 * import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
 * import { AppDataSource } from './app.datasource';
 * import { Note, noteTable } from './note.model';
 *
 * export @repository({ model: Note, dataSource: AppDataSource })
 * class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}
 * ```
 */
export const repository = <
  Model extends AbstractEntity = AbstractEntity,
  DataSource extends IDataSource = IDataSource,
>(
  metadata?: TRepositoryMetadata<Model, DataSource>,
): ClassDecorator => {
  return (target) => {
    const registry = MetadataRegistry.getInstance();

    if (!metadata) {
      applyRepositoryMetadata({
        metadata: inheritRepositoryMetadata({ target, registry }),
        registration: {},
        target,
        registry,
      });

      return;
    }

    applyRepositoryMetadata({ metadata, registration: metadata, target, registry });
  };
};
