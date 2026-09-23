import {
  BaseApplication,
  BaseService,
  BindingNamespaces,
  CoreBindings,
  inject,
  service,
} from '@venizia/ignis';
import {
  AdvancedFilterQueryTestService,
  ArrayOperatorTestService,
  BaseTestService,
  ComprehensiveOperatorTestService,
  CrudTestService,
  DefaultFilterTestService,
  FieldSelectionTestService,
  HiddenPropertiesTestService,
  InclusionTestService,
  JsonFilterTestService,
  JsonOrderByTestService,
  JsonUpdateTestService,
  RowLockingTestService,
  TransactionTestService,
  UserAuditTestService,
} from './tests';

/**
 * Runs every repository suite against the live database, in order. Each case logs PASSED or FAILED;
 * `src/services/tests/TEST_CASES.md` lists them. The application runs this at boot when
 * `APP_ENV_RUN_REPOSITORY_TESTS=true`.
 */
@service()
export class RepositoryTestService extends BaseService {
  static readonly SUITES = [
    CrudTestService,
    TransactionTestService,
    JsonOrderByTestService,
    JsonFilterTestService,
    ArrayOperatorTestService,
    FieldSelectionTestService,
    InclusionTestService,
    HiddenPropertiesTestService,
    ComprehensiveOperatorTestService,
    AdvancedFilterQueryTestService,
    DefaultFilterTestService,
    UserAuditTestService,
    JsonUpdateTestService,
    RowLockingTestService,
  ];

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private readonly application: BaseApplication,
  ) {
    super({ scope: RepositoryTestService.name });
  }

  async runAllTests(): Promise<void> {
    for (const suite of RepositoryTestService.SUITES) {
      const instance = this.application.get<BaseTestService>({
        key: { namespace: BindingNamespaces.SERVICE, key: suite.name },
      });
      await instance.run();
    }
  }
}
