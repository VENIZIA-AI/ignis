import {
  Bootstrapper,
  ControllerBooter,
  DatasourceBooter,
  IBootableApplication,
  IBootOptions,
  IBootReport,
  RepositoryBooter,
  ServiceBooter,
} from '@venizia/ignis-boot';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { BindingScopes, Container } from '@venizia/ignis-inversion';

export const BootMixin = <T extends TMixinTarget<Container>>(baseClass: T) => {
  class Mixed extends baseClass implements IBootableApplication {
    constructor(...args: any[]) {
      super(...args);

      this.bind({ key: `@app/boot-options` }).toValue(this.bootOptions ?? {});

      this.bind({ key: 'booter.DatasourceBooter' }).toClass(DatasourceBooter).setTags('booter');
      this.bind({ key: 'booter.RepositoryBooter' }).toClass(RepositoryBooter).setTags('booter');
      this.bind({ key: 'booter.ServiceBooter' }).toClass(ServiceBooter).setTags('booter');
      this.bind({ key: 'booter.ControllerBooter' }).toClass(ControllerBooter).setTags('booter');

      this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);
    }

    bootOptions?: IBootOptions | undefined;

    boot(): Promise<IBootReport> {
      const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
      return bootstrapper.boot({});
    }
  }

  return Mixed;
};
