import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import {
  ControllerBooter,
  DatasourceBooter,
  RepositoryBooter,
  ServiceBooter,
} from '@venizia/ignis-boot';
import { Binding, ValueOrPromise } from '@venizia/ignis-helpers';

export class BootComponent extends BaseComponent {
  constructor(@inject({ key: CoreBindings.APPLICATION_INSTANCE }) application: BaseApplication) {
    super({
      scope: BootComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        ['booter.DatasourceBooter']: Binding.bind<DatasourceBooter>({
          key: 'booter.DatasourceBooter',
        })
          .toClass(DatasourceBooter)
          .setTags('booter'),
        ['booter.RepositoryBooter']: Binding.bind<RepositoryBooter>({
          key: 'booter.RepositoryBooter',
        })
          .toClass(RepositoryBooter)
          .setTags('booter'),
        ['booter.ServiceBooter']: Binding.bind<ServiceBooter>({
          key: 'booter.ServiceBooter',
        })
          .toClass(ServiceBooter)
          .setTags('booter'),
        ['booter.ControllerBooter']: Binding.bind<ControllerBooter>({
          key: 'booter.ControllerBooter',
        })
          .toClass(ControllerBooter)
          .setTags('booter'),
      },
    });
  }

  override binding(): ValueOrPromise<void> {}
}
