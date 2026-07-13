// Never '@venizia/ignis-boot' here: importing the package from inside itself resolves through its
// own dist, so the source depends on a build of itself - a stale or half-written dist then breaks
// the very code that produces it.
import { ControllerBooter, DatasourceBooter, RepositoryBooter, ServiceBooter } from '@/booters';
import { Bootstrapper } from '@/bootstrapper';
import { IBootableApplication, IBootOptions, IBootReport } from '@/common/types';
import { TMixinTarget } from '@venizia/ignis-helpers';
import { BindingScopes, Container } from '@venizia/ignis-inversion';

export const BootMixin = <T extends TMixinTarget<Container>>(baseClass: T) => {
  class Mixed extends baseClass implements IBootableApplication {
    constructor(...args: any[]) {
      super(...args);

      this.bind({ key: '@app/instance' }).toProvider(() => this);

      this.bind({ key: 'booter.DatasourceBooter' }).toClass(DatasourceBooter).setTags('booter');
      this.bind({ key: 'booter.RepositoryBooter' }).toClass(RepositoryBooter).setTags('booter');
      this.bind({ key: 'booter.ServiceBooter' }).toClass(ServiceBooter).setTags('booter');
      this.bind({ key: 'booter.ControllerBooter' }).toClass(ControllerBooter).setTags('booter');

      this.bind({ key: 'bootstrapper' }).toClass(Bootstrapper).setScope(BindingScopes.SINGLETON);
    }

    bootOptions?: IBootOptions | undefined;
    projectRoot?: string;

    boot(): Promise<IBootReport> {
      this.bind({ key: '@app/boot-options' }).toValue(this.bootOptions ?? {});
      this.bind({ key: '@app/project_root' }).toValue(this.projectRoot ?? process.cwd());

      const bootstrapper = this.get<Bootstrapper>({ key: 'bootstrapper' });
      return bootstrapper.boot({});
    }
  }

  return Mixed;
};
