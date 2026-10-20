// The tables drizzle-kit generates migrations from: every model table, plus the static-asset
// component's MetaLink table, which this application writes through MetaLinkRepository.
import { BaseMetaLinkModel } from '@venizia/ignis/static-asset';

export { configurationTable } from './models/entities/configuration.model';
export { organizationTable } from './models/entities/organization.model';
export { permissionTable } from './models/entities/permission.model';
export { policyDefinitionTable } from './models/entities/policy-definition.model';
export { productTable } from './models/entities/product.model';
export { roleTable } from './models/entities/role.model';
export { saleChannelProductTable } from './models/entities/sale-channel-product.model';
export { saleChannelTable } from './models/entities/sale-channel.model';
export { userTable } from './models/entities/user.model';

export const metaLinkTable = BaseMetaLinkModel.schema;
