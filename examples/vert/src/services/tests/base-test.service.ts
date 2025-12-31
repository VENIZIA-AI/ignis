import { BaseService, BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';

// ----------------------------------------------------------------
// Base Test Service - Provides common repositories for all test services
// ----------------------------------------------------------------
export abstract class BaseTestService extends BaseService {
  constructor(
    scope: string,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    protected readonly configurationRepository: ConfigurationRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    protected readonly productRepository: ProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    })
    protected readonly saleChannelRepository: SaleChannelRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    })
    protected readonly saleChannelProductRepository: SaleChannelProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    protected readonly userRepository: UserRepository,
  ) {
    super({ scope });
  }

  // Run all tests in this service
  abstract run(): Promise<void>;

  // Helper to log section headers
  protected logSection(title: string): void {
    this.logger.info('='.repeat(80));
    this.logger.info(title);
    this.logger.info('='.repeat(80));
  }

  // Helper to log case headers
  protected logCase(title: string): void {
    this.logger.info('-'.repeat(80));
    this.logger.info(title);
  }
}
