import { BaseService, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import type { ITestCaseContext } from './base-test.cases';

/**
 * The repositories every suite reads. A suite declares no constructor: the container reads these
 * injections off the base class, and the logger scope is the suite's own class name.
 */
export abstract class BaseTestService extends BaseService {
  constructor(
    @inject({ target: ConfigurationRepository })
    protected readonly configurationRepository: ConfigurationRepository,
    @inject({ target: ProductRepository })
    protected readonly productRepository: ProductRepository,
    @inject({ target: SaleChannelRepository })
    protected readonly saleChannelRepository: SaleChannelRepository,
    @inject({ target: SaleChannelProductRepository })
    protected readonly saleChannelProductRepository: SaleChannelProductRepository,
    @inject({ target: UserRepository })
    protected readonly userRepository: UserRepository,
  ) {
    super({ scope: new.target.name });
  }

  abstract run(): Promise<void>;

  protected logSection(title: string): void {
    this.logger.info('='.repeat(80));
    this.logger.info(title);
    this.logger.info('='.repeat(80));
  }

  protected logCase(title: string): void {
    this.logger.info('-'.repeat(80));
    this.logger.info(title);
  }

  protected caseContext(): ITestCaseContext {
    return {
      logger: this.logger,
      logCase: title => this.logCase(title),
      configurationRepository: this.configurationRepository,
      productRepository: this.productRepository,
      saleChannelRepository: this.saleChannelRepository,
      saleChannelProductRepository: this.saleChannelProductRepository,
      userRepository: this.userRepository,
    };
  }
}
