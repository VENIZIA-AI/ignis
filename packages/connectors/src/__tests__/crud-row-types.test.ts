// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import {
  controller,
  ControllerFactory,
  CrudRoutes,
  model,
  repository,
} from '@venizia/ignis-kernel';
import type { TRepositoryDataObject, TRepositoryPersistObject } from '@venizia/ignis-kernel';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { BaseSearchEntity, SearchCollectionFactory, field } from '@/search/core/models';
import { DefaultSearchRepository } from '@/search/typesense/repositories';
import { FakeSearchDataSource } from './search/repositories/fake-search-connector';

type TEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless `Condition` is `true`. */
const assertType = <Condition extends true>(): Condition | undefined => undefined;

class RowTypesDataSource extends FakeSearchDataSource {}

type TArticle = { id: string; headline: string; views: number };

@model({ type: 'entity' })
class RowTypesArticle extends BaseSearchEntity {
  static override schema = SearchCollectionFactory.define({
    name: 'row-types-articles',
    fields: [field.string('headline', { searchable: true }), field.number('views')],
  });
}

@repository({ model: RowTypesArticle, dataSource: RowTypesDataSource })
class RowTypesArticleRepository extends DefaultSearchRepository<TArticle> {}

const noteTable = pgTable('row_types_note', {
  id: integer('id').primaryKey(),
  body: text('body').notNull(),
});

@model({ type: 'entity' })
class RowTypesNote extends BasePostgresEntity<typeof noteTable> {
  static override schema = noteTable;
}

@repository({ model: RowTypesNote, dataSource: 'RowTypesPostgres' })
class RowTypesNoteRepository extends DefaultCRUDRepository<typeof noteTable> {}

describe('a search-backed CRUD controller keeps the document type of its repository', () => {
  test('TRepositoryDataObject is the document, not object', () => {
    expect(
      assertType<TEqual<TRepositoryDataObject<RowTypesArticleRepository>, TArticle>>(),
    ).toBeUndefined();
    expect(
      assertType<TEqual<TRepositoryPersistObject<RowTypesArticleRepository>, TArticle>>(),
    ).toBeUndefined();

    // @ts-expect-error control: the document is not `object`
    assertType<TEqual<TRepositoryDataObject<RowTypesArticleRepository>, object>>();

    const unknownKey: TRepositoryDataObject<RowTypesArticleRepository> = {
      id: '1',
      headline: 'a',
      views: 1,
      // @ts-expect-error a key the document does not have
      anything: 1,
    };

    expect(unknownKey).toBeDefined();
  });

  test('this.repository and its payloads are typed with the document', () => {
    const CrudController = ControllerFactory.crud({
      repository: RowTypesArticleRepository,
      routes: { ...CrudRoutes.READ, create: true },
    });

    @controller({ path: '/articles' })
    class ArticleController extends CrudController {
      byHeadline(): Promise<unknown> {
        return this.repository.findOne({ filter: { where: { headline: 'a' } } });
      }

      // @ts-expect-error `title` is not a key of the document
      byTitle = () => this.repository.findOne({ filter: { where: { title: 'a' } } });

      wrongViews = () =>
        // @ts-expect-error `views` is a number
        this.repository.create({ data: { id: '1', headline: 'a', views: 'many' } });
    }

    expect(ArticleController).toBeDefined();
  });
});

describe('a relational CRUD controller keeps the table row type of its repository', () => {
  test('TRepositoryDataObject is the row of the table', () => {
    type TNoteRow = { id: number; body: string };

    expect(
      assertType<TEqual<TRepositoryDataObject<RowTypesNoteRepository>, TNoteRow>>(),
    ).toBeUndefined();

    // @ts-expect-error control: the row is not `object`
    assertType<TEqual<TRepositoryDataObject<RowTypesNoteRepository>, object>>();
  });

  test('this.repository and its payloads are typed with the table', () => {
    const CrudController = ControllerFactory.crud({
      repository: RowTypesNoteRepository,
      routes: { ...CrudRoutes.READ, create: true },
    });

    @controller({ path: '/notes' })
    class NoteController extends CrudController {
      byBody = () => this.repository.findOne({ filter: { where: { body: 'a' } } });

      // @ts-expect-error `title` is not a column of the table
      byTitle = () => this.repository.findOne({ filter: { where: { title: 'a' } } });

      // @ts-expect-error `body` is a string
      wrongBody = () => this.repository.create({ data: { id: 1, body: 2 } });
    }

    expect(NoteController).toBeDefined();
  });
});
