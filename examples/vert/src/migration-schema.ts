/**
 * Migration schema file for drizzle-kit.
 *
 * drizzle-kit expects raw pgTable() exports, not class references.
 * This file re-exports the `.schema` static properties from each entity model
 * so drizzle-kit can detect and manage them.
 */
import { Configuration } from './models/entities/configuration.model';
import { User } from './models/entities/user.model';
import { Product } from './models/entities/product.model';
import { SaleChannel } from './models/entities/sale-channel.model';
import { SaleChannelProduct } from './models/entities/sale-channel-product.model';
import { Organization } from './models/entities/organization.model';
import { Role } from './models/entities/role.model';
import { Permission } from './models/entities/permission.model';
import { PolicyDefinition } from './models/entities/policy-definition.model';

export const configuration = Configuration.schema;
export const user = User.schema;
export const product = Product.schema;
export const saleChannel = SaleChannel.schema;
export const saleChannelProduct = SaleChannelProduct.schema;
export const organization = Organization.schema;
export const role = Role.schema;
export const permission = Permission.schema;
export const policyDefinition = PolicyDefinition.schema;
