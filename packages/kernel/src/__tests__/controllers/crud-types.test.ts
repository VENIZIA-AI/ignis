import { CrudControllerFactory } from '@/base/controllers/factory/controller';
import type { TRepositoryDataObject, TRepositoryPersistObject } from '@/base/controllers/common';
import { controller, repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { StubRepository } from './stub-repository';

type TEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless `Condition` is `true`. */
const assertType = <Condition extends true>(): Condition | undefined => undefined;

interface IWidget {
  id: string;
  name: string;
}

type TWidgetInsert = { name: string };

const widgetSchema = z.object({ id: z.string(), name: z.string() });
const schemas: Record<string, AnyType> = { widget: widgetSchema };

class TypedProbeWidget extends AbstractEntity<typeof widgetSchema> {
  constructor() {
    super({ name: TypedProbeWidget.name });
  }

  getSchema<T>(): T {
    return schemas.widget;
  }
}

@repository({ model: TypedProbeWidget, dataSource: 'ProbeDataSource' })
class WidgetRepository extends StubRepository<IWidget> {}

describe('CrudControllerFactory.build - the row types come from the repository class', () => {
  test('TRepositoryDataObject and TRepositoryPersistObject read the row and persist types exactly', () => {
    assertType<TEqual<TRepositoryDataObject<WidgetRepository>, IWidget>>();
    // @ts-expect-error control: the equality helper really tells the row type from `object`
    assertType<TEqual<TRepositoryDataObject<WidgetRepository>, object>>();

    // @ts-expect-error a key the row does not have
    const unknownKey: TRepositoryDataObject<WidgetRepository> = { id: '1', name: 'a', anything: 1 };
    // @ts-expect-error a key of the wrong type
    const wrongType: TRepositoryDataObject<WidgetRepository> = { id: 1, name: 'a' };

    expect([unknownKey, wrongType]).toHaveLength(2);
    expect(
      assertType<TEqual<TRepositoryPersistObject<WidgetRepository>, IWidget>>(),
    ).toBeUndefined();
  });

  test('this.repository is typed with the row of the repository class', () => {
    const CrudController = CrudControllerFactory.build({
      repository: WidgetRepository,
      routes: { find: true },
    });

    @controller({ path: '/widgets' })
    class WidgetController extends CrudController {
      names(): Promise<unknown> {
        // Typed: the filter is checked against IWidget, and `row` is IWidget.
        return this.repository.findOne({ filter: { where: { name: 'a' } } });
      }

      wrongKey(): Promise<unknown> {
        // @ts-expect-error `title` is not a key of IWidget
        return this.repository.findOne({ filter: { where: { title: 'a' } } });
      }

      createdRow() {
        // @ts-expect-error the persist object has no `anything`
        return this.repository.create({ data: { name: 'a', anything: 1 } });
      }
    }

    expect(WidgetController).toBeDefined();
    expect(assertType<TEqual<TWidgetInsert, { name: string }>>()).toBeUndefined();
  });

  test('a repository that is not an AbstractRepository is refused when its instance is injected', () => {
    class LooksLikeARepository {
      dataSource: AnyType;
      entity: AnyType;
      getEntity(): AnyType {
        return undefined;
      }
    }

    const CrudController = CrudControllerFactory.build({
      repository: WidgetRepository,
      routes: { find: true },
    });

    @controller({ path: '/widgets' })
    class WidgetController extends CrudController {}

    // @ts-expect-error a structural fake is not an AbstractRepository
    const instance = new WidgetController(new LooksLikeARepository());

    expect(instance).toBeDefined();
  });
});
