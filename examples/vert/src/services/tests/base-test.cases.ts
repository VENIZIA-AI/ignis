import type { ILogger } from '@venizia/ignis-helpers';
import type {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';

export interface ITestCaseContext {
  logger: ILogger;
  logCase: (title: string) => void;
  configurationRepository: ConfigurationRepository;
  productRepository: ProductRepository;
  saleChannelRepository: SaleChannelRepository;
  saleChannelProductRepository: SaleChannelProductRepository;
  userRepository: UserRepository;
}

/** One group of cases of a test service; the service builds the context and owns the run order. */
export abstract class BaseTestCases {
  constructor(protected readonly context: ITestCaseContext) {}
}
