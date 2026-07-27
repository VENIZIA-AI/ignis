# Building an E-commerce API

This tutorial guides you through building a complete e-commerce backend with products, orders, cart, and payments. You'll learn advanced patterns for real-world applications.

**Time to Complete:** ~2 hours

## What You'll Build

- Product catalog with categories
- Shopping cart management
- Order processing
- Payment integration (Stripe)
- Inventory management

## Prerequisites

- Completed [Building a CRUD API](./building-a-crud-api.md)
- PostgreSQL database running
- Basic understanding of [Dependency Injection](../core-concepts/dependency-injection.md)

## 1. Project Setup

### Initialize the Project

```bash
mkdir ecommerce-api
cd ecommerce-api
bun init -y

# Install dependencies
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis @venizia/ignis-helpers
bun add drizzle-orm drizzle-zod pg stripe
bun add -d typescript @types/bun @venizia/dev-configs drizzle-kit @types/pg
```

### Project Structure

```
ecommerce-api/
├── src/
│   ├── index.ts
│   ├── application.ts
│   ├── models/
│   │   ├── product.model.ts
│   │   ├── category.model.ts
│   │   ├── cart.model.ts
│   │   ├── order.model.ts
│   │   └── index.ts
│   ├── repositories/
│   │   ├── product.repository.ts
│   │   ├── category.repository.ts
│   │   ├── cart.repository.ts
│   │   └── order.repository.ts
│   ├── services/
│   │   ├── product.service.ts
│   │   ├── cart.service.ts
│   │   ├── order.service.ts
│   │   └── payment.service.ts
│   ├── controllers/
│   │   ├── product/
│   │   │   ├── definitions.ts
│   │   │   ├── product.controller.ts
│   │   │   └── index.ts
│   │   ├── cart/
│   │   │   ├── definitions.ts
│   │   │   ├── cart.controller.ts
│   │   │   └── index.ts
│   │   ├── order/
│   │   │   ├── definitions.ts
│   │   │   ├── order.controller.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── datasources/
│       └── postgres.datasource.ts
└── package.json
```

## 2. Database Models

Models in IGNIS combine Drizzle ORM schemas with Entity classes.

### Category Model

```typescript
// src/models/category.model.ts
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, text, varchar } from 'drizzle-orm/pg-core';

export const categoryTable = pgTable('Category', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  description: text('description'),
  parentId: text('parent_id'),
});

export type TCategorySchema = typeof categoryTable;
export type TCategory = TTableObject<TCategorySchema>;

@model({ type: 'entity' })
export class Category extends BaseEntity<typeof Category.schema> {
  static override schema = categoryTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'parent',
      type: RelationTypes.ONE,
      schema: categoryTable,
      metadata: { fields: [categoryTable.parentId], references: [categoryTable.id] },
    },
    {
      name: 'children',
      type: RelationTypes.MANY,
      schema: categoryTable,
      metadata: { fields: [categoryTable.id], references: [categoryTable.parentId] },
    },
  ];

  static override TABLE_NAME = 'Category';
}
```

### Product Model

```typescript
// src/models/product.model.ts
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, text, varchar, decimal, integer, boolean } from 'drizzle-orm/pg-core';
import { categoryTable } from './category.model';

export const productTable = pgTable('Product', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal('compare_at_price', { precision: 10, scale: 2 }),
  sku: varchar('sku', { length: 100 }).unique(),
  stock: integer('stock').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  categoryId: text('category_id'),
  imageUrl: text('image_url'),
});

export type TProductSchema = typeof productTable;
export type TProduct = TTableObject<TProductSchema>;

@model({ type: 'entity' })
export class Product extends BaseEntity<typeof Product.schema> {
  static override schema = productTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'category',
      type: RelationTypes.ONE,
      schema: categoryTable,
      metadata: { fields: [productTable.categoryId], references: [categoryTable.id] },
    },
  ];

  static override TABLE_NAME = 'Product';
}
```

### Cart Model

```typescript
// src/models/cart.model.ts
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';
import { productTable } from './product.model';

export const cartTable = pgTable('Cart', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  userId: text('user_id'),
  sessionId: varchar('session_id', { length: 255 }),
});

export const cartItemTable = pgTable('CartItem', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  cartId: text('cart_id').notNull(),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').default(1).notNull(),
});

export type TCartSchema = typeof cartTable;
export type TCart = TTableObject<TCartSchema>;
export type TCartItemSchema = typeof cartItemTable;
export type TCartItem = TTableObject<TCartItemSchema>;

@model({ type: 'entity' })
export class Cart extends BaseEntity<typeof Cart.schema> {
  static override schema = cartTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'items',
      type: RelationTypes.MANY,
      schema: cartItemTable,
      metadata: { fields: [cartTable.id], references: [cartItemTable.cartId] },
    },
  ];

  static override TABLE_NAME = 'Cart';
}

@model({ type: 'entity' })
export class CartItem extends BaseEntity<typeof CartItem.schema> {
  static override schema = cartItemTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'cart',
      type: RelationTypes.ONE,
      schema: cartTable,
      metadata: { fields: [cartItemTable.cartId], references: [cartTable.id] },
    },
    {
      name: 'product',
      type: RelationTypes.ONE,
      schema: productTable,
      metadata: { fields: [cartItemTable.productId], references: [productTable.id] },
    },
  ];

  static override TABLE_NAME = 'CartItem';
}
```

### Order Model

```typescript
// src/models/order.model.ts
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  RelationTypes,
  TRelationConfig,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, text, varchar, decimal, integer, jsonb } from 'drizzle-orm/pg-core';
import { productTable } from './product.model';

export const orderTable = pgTable('Order', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  userId: text('user_id'),
  email: varchar('email', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  tax: decimal('tax', { precision: 10, scale: 2 }).default('0').notNull(),
  shipping: decimal('shipping', { precision: 10, scale: 2 }).default('0').notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  shippingAddress: jsonb('shipping_address'),
  billingAddress: jsonb('billing_address'),
  paymentIntentId: varchar('payment_intent_id', { length: 255 }),
});

export const orderItemTable = pgTable('OrderItem', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  orderId: text('order_id').notNull(),
  productId: text('product_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
});

export type TOrderSchema = typeof orderTable;
export type TOrder = TTableObject<TOrderSchema>;
export type TOrderItemSchema = typeof orderItemTable;
export type TOrderItem = TTableObject<TOrderItemSchema>;

@model({ type: 'entity' })
export class Order extends BaseEntity<typeof Order.schema> {
  static override schema = orderTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'items',
      type: RelationTypes.MANY,
      schema: orderItemTable,
      metadata: { fields: [orderTable.id], references: [orderItemTable.orderId] },
    },
  ];

  static override TABLE_NAME = 'Order';
}

@model({ type: 'entity' })
export class OrderItem extends BaseEntity<typeof OrderItem.schema> {
  static override schema = orderItemTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'order',
      type: RelationTypes.ONE,
      schema: orderTable,
      metadata: { fields: [orderItemTable.orderId], references: [orderTable.id] },
    },
    {
      name: 'product',
      type: RelationTypes.ONE,
      schema: productTable,
      metadata: { fields: [orderItemTable.productId], references: [productTable.id] },
    },
  ];

  static override TABLE_NAME = 'OrderItem';
}
```

### Models Index

```typescript
// src/models/index.ts
export * from './category.model';
export * from './product.model';
export * from './cart.model';
export * from './order.model';
```

## 3. DataSource

```typescript
// src/datasources/postgres.datasource.ts
import {
  BaseDataSource,
  datasource,
  ValueOrPromise,
} from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'ecommerce_db',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = Object.keys(this.getSchema());

    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schema.length,
      schema,
    );

    // The client must land on this.client - a local would leave beginTransaction() with nothing
    // to resolve a driver from, and it would throw `No driver and no client`. NodePostgresDriver
    // named in @datasource above is what wires the driver and Drizzle connector from it.
    this.client = new Pool(this.settings);
  }
}
```

## 4. Repositories

### Product Repository

```typescript
// src/repositories/product.repository.ts
import { Product } from '@/models/product.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({ model: Product, dataSource: PostgresDataSource })
export class ProductRepository extends DefaultCRUDRepository<typeof Product.schema> {}
```

### Category Repository

```typescript
// src/repositories/category.repository.ts
import { Category } from '@/models/category.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({ model: Category, dataSource: PostgresDataSource })
export class CategoryRepository extends DefaultCRUDRepository<typeof Category.schema> {}
```

### Cart Repository

```typescript
// src/repositories/cart.repository.ts
import { Cart, CartItem } from '@/models/cart.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository, inject } from '@venizia/ignis';

@repository({ model: CartItem, dataSource: PostgresDataSource })
export class CartItemRepository extends DefaultCRUDRepository<typeof CartItem.schema> {}

@repository({ model: Cart, dataSource: PostgresDataSource })
export class CartRepository extends DefaultCRUDRepository<typeof Cart.schema> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,

    // From 2nd parameter, inject additional dependencies
    @inject({ key: 'repositories.CartItemRepository' })
    private _cartItemRepo: CartItemRepository,
  ) {
    super(dataSource);
  }

  async findCartItem(opts: { cartId: string; productId: string }) {
    return this._cartItemRepo.findOne({
      filter: { where: { cartId: opts.cartId, productId: opts.productId } },
    });
  }

  async addCartItem(opts: { cartId: string; productId: string; quantity: number }) {
    const rs = await this._cartItemRepo.create({ data: opts });
    return rs.data;
  }

  async updateCartItem(opts: { itemId: string; data: { quantity: number } }) {
    return this._cartItemRepo.updateById({ id: opts.itemId, data: opts.data });
  }

  async deleteCartItem(opts: { itemId: string }) {
    return this._cartItemRepo.deleteById({ id: opts.itemId });
  }

  async getCartItems(opts: { cartId: string }) {
    return this._cartItemRepo.find({ filter: { where: { cartId: opts.cartId } } });
  }

  async clearCart(opts: { cartId: string }) {
    return this._cartItemRepo.deleteAll({ where: { cartId: opts.cartId } });
  }
}
```

### Order Repository

```typescript
// src/repositories/order.repository.ts
import { Order, OrderItem } from '@/models/order.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository, inject } from '@venizia/ignis';

@repository({ model: OrderItem, dataSource: PostgresDataSource })
export class OrderItemRepository extends DefaultCRUDRepository<typeof OrderItem.schema> {}

@repository({ model: Order, dataSource: PostgresDataSource })
export class OrderRepository extends DefaultCRUDRepository<typeof Order.schema> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,

    // From 2nd parameter, inject additional dependencies
    @inject({ key: 'repositories.OrderItemRepository' })
    private _orderItemRepo: OrderItemRepository,
  ) {
    super(dataSource);
  }

  async createOrderItem(opts: {
    orderId: string;
    productId: string;
    name: string;
    price: string;
    quantity: number;
  }) {
    const rs = await this._orderItemRepo.create({ data: opts });
    return rs.data;
  }

  async getOrderItems(opts: { orderId: string }) {
    return this._orderItemRepo.find({ filter: { where: { orderId: opts.orderId } } });
  }
}
```

## 5. Product Service with Inventory

```typescript
// src/services/product.service.ts
import { inject } from '@venizia/ignis';
import { BaseService } from '@venizia/ignis';
import { ProductRepository } from '../repositories/product.repository';
import { getError } from '@venizia/ignis-helpers';

export class ProductService extends BaseService {
  constructor(
    @inject({ key: 'repositories.ProductRepository' })
    private _productRepo: ProductRepository,
  ) {
    super({ scope: ProductService.name });
  }

  async getActiveProducts(opts: { categoryId?: string; limit?: number; offset?: number }) {
    return this._productRepo.find({
      filter: {
        where: {
          isActive: true,
          ...(opts.categoryId && { categoryId: opts.categoryId }),
        },
        order: ['createdAt DESC'],
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
      },
    });
  }

  async getProductById(opts: { id: string }) {
    const product = await this._productRepo.findById({ id: opts.id });
    if (!product) {
      throw getError({ statusCode: 404, message: 'Product not found' });
    }
    return product;
  }

  async checkStock(opts: { productId: string; quantity: number }): Promise<boolean> {
    const product = await this.getProductById({ id: opts.productId });
    return product.stock >= opts.quantity;
  }

  async reserveStock(opts: { productId: string; quantity: number }) {
    const product = await this.getProductById({ id: opts.productId });

    if (product.stock < opts.quantity) {
      throw getError({
        statusCode: 400,
        message: `Insufficient stock. Available: ${product.stock}`,
      });
    }

    await this._productRepo.updateById({ id: opts.productId, data: {
      stock: product.stock - opts.quantity,
    } });
  }

  async releaseStock(opts: { productId: string; quantity: number }) {
    const product = await this.getProductById({ id: opts.productId });
    await this._productRepo.updateById({ id: opts.productId, data: {
      stock: product.stock + opts.quantity,
    } });
  }
}
```

## 6. Cart Service

```typescript
// src/services/cart.service.ts
import { inject } from '@venizia/ignis';
import { BaseService } from '@venizia/ignis';
import { CartRepository } from '../repositories/cart.repository';
import { ProductService } from './product.service';
import { getError } from '@venizia/ignis-helpers';

interface ICartItem {
  productId: string;
  quantity: number;
}

export class CartService extends BaseService {
  constructor(
    @inject({ key: 'repositories.CartRepository' })
    private _cartRepo: CartRepository,
    @inject({ key: 'services.ProductService' })
    private _productService: ProductService,
  ) {
    super({ scope: CartService.name });
  }

  async getOrCreateCart(opts: { userId?: string; sessionId?: string }) {
    // Try to find existing cart
    let cart = await this._cartRepo.findOne({
      filter: { where: opts.userId
        ? { userId: opts.userId }
        : { sessionId: opts.sessionId } },
    });

    if (!cart) {
      const rs = await this._cartRepo.create({ data: { userId: opts.userId, sessionId: opts.sessionId } });
      cart = rs.data;
    }

    return cart;
  }

  async addItem(opts: { cartId: string; productId: string; quantity?: number }) {
    const quantity = opts.quantity ?? 1;
    // Validate product exists and has stock
    const product = await this._productService.getProductById({ id: opts.productId });

    if (!product.isActive) {
      throw getError({ statusCode: 400, message: 'Product is not available' });
    }

    if (product.stock < quantity) {
      throw getError({ statusCode: 400, message: 'Insufficient stock' });
    }

    // Check if item already in cart
    const existingItem = await this._cartRepo.findCartItem({ cartId: opts.cartId, productId: opts.productId });

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + quantity;
      if (product.stock < newQuantity) {
        throw getError({ statusCode: 400, message: 'Insufficient stock for requested quantity' });
      }
      return this._cartRepo.updateCartItem({ itemId: existingItem.id, data: { quantity: newQuantity } });
    }

    // Add new item
    return this._cartRepo.addCartItem({
      cartId: opts.cartId,
      productId: opts.productId,
      quantity,
    });
  }

  async updateItemQuantity(opts: { cartId: string; productId: string; quantity: number }) {
    if (opts.quantity <= 0) {
      return this.removeItem({ cartId: opts.cartId, productId: opts.productId });
    }

    const product = await this._productService.getProductById({ id: opts.productId });
    if (product.stock < opts.quantity) {
      throw getError({ statusCode: 400, message: 'Insufficient stock' });
    }

    const item = await this._cartRepo.findCartItem({ cartId: opts.cartId, productId: opts.productId });
    if (!item) {
      throw getError({ statusCode: 404, message: 'Item not in cart' });
    }

    return this._cartRepo.updateCartItem({ itemId: item.id, data: { quantity: opts.quantity } });
  }

  async removeItem(opts: { cartId: string; productId: string }) {
    const item = await this._cartRepo.findCartItem({ cartId: opts.cartId, productId: opts.productId });
    if (item) {
      await this._cartRepo.deleteCartItem({ itemId: item.id });
    }
  }

  async getCartWithItems(opts: { cartId: string }) {
    const cart = await this._cartRepo.findById({ id: opts.cartId });
    if (!cart) {
      throw getError({ statusCode: 404, message: 'Cart not found' });
    }

    const items = await this._cartRepo.getCartItems({ cartId: opts.cartId });

    // Calculate totals
    let subtotal = 0;
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const product = await this._productService.getProductById({ id: item.productId });
        const itemTotal = Number(product.price) * item.quantity;
        subtotal += itemTotal;

        return {
          ...item,
          product,
          itemTotal,
        };
      })
    );

    return {
      ...cart,
      items: itemsWithDetails,
      subtotal,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async clearCart(opts: { cartId: string }) {
    await this._cartRepo.clearCart({ cartId: opts.cartId });
  }
}
```

## 7. Order Service with Payments

```typescript
// src/services/order.service.ts
import { inject } from '@venizia/ignis';
import { BaseService } from '@venizia/ignis';
import { OrderRepository } from '../repositories/order.repository';
import { CartService } from './cart.service';
import { ProductService } from './product.service';
import { PaymentService } from './payment.service';
import { getError } from '@venizia/ignis-helpers';

interface IOrderAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface ICreateOrderInput {
  cartId: string;
  email: string;
  shippingAddress: IOrderAddress;
  billingAddress?: IOrderAddress;
}

export class OrderService extends BaseService {
  constructor(
    @inject({ key: 'repositories.OrderRepository' })
    private _orderRepo: OrderRepository,
    @inject({ key: 'services.CartService' })
    private _cartService: CartService,
    @inject({ key: 'services.ProductService' })
    private _productService: ProductService,
    @inject({ key: 'services.PaymentService' })
    private _paymentService: PaymentService,
  ) {
    super({ scope: OrderService.name });
  }

  async createOrder(opts: { input: ICreateOrderInput }) {
    // Get cart with items
    const cart = await this._cartService.getCartWithItems({ cartId: opts.input.cartId });

    if (cart.items.length === 0) {
      throw getError({ statusCode: 400, message: 'Cart is empty' });
    }

    // Validate stock for all items
    for (const item of cart.items) {
      const hasStock = await this._productService.checkStock({
        productId: item.productId,
        quantity: item.quantity,
      });
      if (!hasStock) {
        throw getError({
          statusCode: 400,
          message: `Insufficient stock for ${item.product.name}`,
        });
      }
    }

    // Calculate totals
    const subtotal = cart.subtotal;
    const tax = subtotal * 0.1; // 10% tax
    const shipping = subtotal > 100 ? 0 : 10; // Free shipping over $100
    const total = subtotal + tax + shipping;

    // Create payment intent
    const paymentIntent = await this._paymentService.createPaymentIntent({
      amount: Math.round(total * 100), // Stripe uses cents
      currency: 'usd',
      metadata: {
        cartId: opts.input.cartId,
        email: opts.input.email,
      },
    });

    // Create order
    const { data: order } = await this._orderRepo.create({ data: {
      email: opts.input.email,
      status: 'pending_payment',
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      shipping: shipping.toString(),
      total: total.toString(),
      shippingAddress: opts.input.shippingAddress,
      billingAddress: opts.input.billingAddress ?? opts.input.shippingAddress,
      paymentIntentId: paymentIntent.id,
    } });

    // Create order items
    for (const item of cart.items) {
      await this._orderRepo.createOrderItem({
        orderId: order.id,
        productId: item.productId,
        name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
      });
    }

    return {
      order,
      clientSecret: paymentIntent.client_secret,
    };
  }

  async confirmPayment(opts: { orderId: string; paymentIntentId: string }) {
    const order = await this._orderRepo.findById({ id: opts.orderId });

    if (!order) {
      throw getError({ statusCode: 404, message: 'Order not found' });
    }

    if (order.paymentIntentId !== opts.paymentIntentId) {
      throw getError({ statusCode: 400, message: 'Invalid payment' });
    }

    // Verify payment with Stripe
    const isSuccessful = await this._paymentService.verifyPayment({ paymentIntentId: opts.paymentIntentId });

    if (!isSuccessful) {
      throw getError({ statusCode: 400, message: 'Payment not confirmed' });
    }

    // Update order status
    await this._orderRepo.updateById({ id: opts.orderId, data: { status: 'paid' } });

    // Reserve stock for all items
    const orderItems = await this._orderRepo.getOrderItems({ orderId: opts.orderId });
    for (const item of orderItems) {
      await this._productService.reserveStock({ productId: item.productId, quantity: item.quantity });
    }

    return this._orderRepo.findById({ id: opts.orderId });
  }

  async getOrdersByUser(opts: { userId: string }) {
    return this._orderRepo.find({
      filter: {
        where: { userId: opts.userId },
        order: ['createdAt DESC'],
      },
    });
  }

  async getOrderById(opts: { orderId: string }) {
    const order = await this._orderRepo.findById({ id: opts.orderId });
    if (!order) {
      throw getError({ statusCode: 404, message: 'Order not found' });
    }

    const items = await this._orderRepo.getOrderItems({ orderId: opts.orderId });
    return { ...order, items };
  }

  async updateOrderStatus(opts: { orderId: string; status: string }) {
    const validStatuses = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!validStatuses.includes(opts.status)) {
      throw getError({ statusCode: 400, message: 'Invalid status' });
    }

    return this._orderRepo.updateById({ id: opts.orderId, data: { status: opts.status } });
  }
}
```

## 8. Payment Service (Stripe)

```typescript
// src/services/payment.service.ts
import { BaseService } from '@venizia/ignis';
import Stripe from 'stripe';
import { applicationEnvironment } from '@venizia/ignis-helpers';

export class PaymentService extends BaseService {
  private _stripe: Stripe;

  constructor() {
    super({ scope: PaymentService.name });

    const secretKey = applicationEnvironment.get<string>('APP_ENV_STRIPE_SECRET_KEY');
    this._stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  async createPaymentIntent(opts: {
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
  }) {
    return this._stripe.paymentIntents.create({
      amount: opts.amount,
      currency: opts.currency,
      metadata: opts.metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async verifyPayment(opts: { paymentIntentId: string }): Promise<boolean> {
    const paymentIntent = await this._stripe.paymentIntents.retrieve(opts.paymentIntentId);
    return paymentIntent.status === 'succeeded';
  }

  async refundPayment(opts: { paymentIntentId: string; amount?: number }) {
    return this._stripe.refunds.create({
      payment_intent: opts.paymentIntentId,
      amount: opts.amount, // undefined = full refund
    });
  }

  async createWebhookEvent(opts: { payload: string; signature: string }) {
    const webhookSecret = applicationEnvironment.get<string>('APP_ENV_STRIPE_WEBHOOK_SECRET');
    return this._stripe.webhooks.constructEvent(opts.payload, opts.signature, webhookSecret);
  }
}
```

## 9. Controllers

### Product Controller

```typescript
// src/controllers/product/product.controller.ts
import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  controller,
  get,
  inject,
  jsonContent,
  TRouteContext,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { ProductService } from '../services/product.service';

// Define route configs with PascalCase type and SCREAMING_SNAKE_CASE keys
const ProductRoutes = {
  LIST: {
    method: HTTP.Methods.GET,
    path: '/',
    request: {
      query: z.object({
        category: z.string().optional(),
        limit: z.string().optional(),
        offset: z.string().optional(),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'List of products',
        schema: z.object({
          products: z.array(z.any()),
          total: z.number(),
        }),
      }),
    },
  },
  GET_BY_ID: {
    method: HTTP.Methods.GET,
    path: '/{id}',
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Product details',
        schema: z.any(),
      }),
    },
  },
} as const;

type ProductRoutes = typeof ProductRoutes;

@controller({ path: '/products' })
export class ProductController extends BaseRestController {
  constructor(
    @inject({ key: 'services.ProductService' })
    private _productService: ProductService,
  ) {
    super({ scope: ProductController.name, path: '/products' });
  }

  override binding() {}

  @get({ configs: ProductRoutes.LIST })
  async listProducts(c: TRouteContext) {
    const { category, limit, offset } = c.req.valid<{ category?: string; limit?: string; offset?: string }>('query');

    const products = await this._productService.getActiveProducts({
      categoryId: category,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    return c.json({ products, total: products.length });
  }

  @get({ configs: ProductRoutes.GET_BY_ID })
  async getProduct(c: TRouteContext) {
    const { id } = c.req.valid<{ id: string }>('param');
    const product = await this._productService.getProductById({ id });
    return c.json(product);
  }
}
```

### Cart Controller

```typescript
// src/controllers/cart/cart.controller.ts
import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  controller,
  get,
  post,
  put,
  del,
  inject,
  jsonContent,
  TRouteContext,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { CartService } from '../services/cart.service';

const CartRoutes = {
  GET: {
    method: HTTP.Methods.GET,
    path: '/',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Current cart',
        schema: z.any(),
      }),
    },
  },
  ADD_ITEM: {
    method: HTTP.Methods.POST,
    path: '/items',
    request: {
      body: jsonContent({
        schema: z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().positive().default(1),
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Created]: jsonContent({
        description: 'Item added to cart',
        schema: z.any(),
      }),
    },
  },
  UPDATE_ITEM: {
    method: HTTP.Methods.PUT,
    path: '/items/{productId}',
    request: {
      params: z.object({ productId: z.string().uuid() }),
      body: jsonContent({
        schema: z.object({
          quantity: z.number().int().min(0),
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Item quantity updated',
        schema: z.any(),
      }),
    },
  },
  REMOVE_ITEM: {
    method: HTTP.Methods.DELETE,
    path: '/items/{productId}',
    request: {
      params: z.object({ productId: z.string().uuid() }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.NoContent]: {
        description: 'Item removed from cart',
      },
    },
  },
} as const;

type CartRoutes = typeof CartRoutes;

@controller({ path: '/cart' })
export class CartController extends BaseRestController {
  constructor(
    @inject({ key: 'services.CartService' })
    private _cartService: CartService,
  ) {
    super({ scope: CartController.name, path: '/cart' });
  }

  override binding() {}

  @get({ configs: CartRoutes.GET })
  async getCart(c: TRouteContext) {
    const sessionId = c.req.header('X-Session-ID') ?? 'guest';
    const cart = await this._cartService.getOrCreateCart({ sessionId });
    const cartWithItems = await this._cartService.getCartWithItems({ cartId: cart.id });
    return c.json(cartWithItems);
  }

  @post({ configs: CartRoutes.ADD_ITEM })
  async addToCart(c: TRouteContext) {
    const sessionId = c.req.header('X-Session-ID') ?? 'guest';
    const { productId, quantity } = c.req.valid<{ productId: string; quantity: number }>('json');

    const cart = await this._cartService.getOrCreateCart({ sessionId });
    await this._cartService.addItem({ cartId: cart.id, productId, quantity });

    const updatedCart = await this._cartService.getCartWithItems({ cartId: cart.id });
    return c.json(updatedCart, HTTP.ResultCodes.RS_2.Created);
  }

  @put({ configs: CartRoutes.UPDATE_ITEM })
  async updateCartItem(c: TRouteContext) {
    const sessionId = c.req.header('X-Session-ID') ?? 'guest';
    const { productId } = c.req.valid<{ productId: string }>('param');
    const { quantity } = c.req.valid<{ quantity: number }>('json');

    const cart = await this._cartService.getOrCreateCart({ sessionId });
    await this._cartService.updateItemQuantity({ cartId: cart.id, productId, quantity });

    const updatedCart = await this._cartService.getCartWithItems({ cartId: cart.id });
    return c.json(updatedCart);
  }

  @del({ configs: CartRoutes.REMOVE_ITEM })
  async removeFromCart(c: TRouteContext) {
    const sessionId = c.req.header('X-Session-ID') ?? 'guest';
    const { productId } = c.req.valid<{ productId: string }>('param');

    const cart = await this._cartService.getOrCreateCart({ sessionId });
    await this._cartService.removeItem({ cartId: cart.id, productId });

    return c.body(null, HTTP.ResultCodes.RS_2.NoContent);
  }
}
```

### Order Controller

```typescript
// src/controllers/order/order.controller.ts
import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  controller,
  get,
  post,
  inject,
  jsonContent,
  TRouteContext,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { OrderService } from '../services/order.service';

const OrderRoutes = {
  CREATE: {
    method: HTTP.Methods.POST,
    path: '/',
    request: {
      body: jsonContent({
        schema: z.object({
          cartId: z.string().uuid(),
          email: z.string().email(),
          shippingAddress: z.object({
            name: z.string(),
            line1: z.string(),
            line2: z.string().optional(),
            city: z.string(),
            state: z.string(),
            postalCode: z.string(),
            country: z.string(),
          }),
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Created]: jsonContent({
        description: 'Order created',
        schema: z.object({
          order: z.any(),
          clientSecret: z.string(),
        }),
      }),
    },
  },
  CONFIRM: {
    method: HTTP.Methods.POST,
    path: '/{id}/confirm',
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: jsonContent({
        schema: z.object({
          paymentIntentId: z.string(),
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Order confirmed',
        schema: z.any(),
      }),
    },
  },
  GET_BY_ID: {
    method: HTTP.Methods.GET,
    path: '/{id}',
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Order details',
        schema: z.any(),
      }),
    },
  },
} as const;

type OrderRoutes = typeof OrderRoutes;

@controller({ path: '/orders' })
export class OrderController extends BaseRestController {
  constructor(
    @inject({ key: 'services.OrderService' })
    private _orderService: OrderService,
  ) {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding() {}

  @post({ configs: OrderRoutes.CREATE })
  async createOrder(c: TRouteContext) {
    const body = c.req.valid<any>('json'); // Use explicit type if available
    const result = await this._orderService.createOrder({ input: body });
    return c.json(result, HTTP.ResultCodes.RS_2.Created);
  }

  @post({ configs: OrderRoutes.CONFIRM })
  async confirmOrder(c: TRouteContext) {
    const { id: orderId } = c.req.valid<{ id: string }>('param');
    const { paymentIntentId } = c.req.valid<{ paymentIntentId: string }>('json');

    const order = await this._orderService.confirmPayment({ orderId, paymentIntentId });
    return c.json(order);
  }

  @get({ configs: OrderRoutes.GET_BY_ID })
  async getOrder(c: TRouteContext) {
    const { id: orderId } = c.req.valid<{ id: string }>('param');
    const order = await this._orderService.getOrderById({ orderId });
    return c.json(order);
  }
}
```

## 10. Application Setup

```typescript
// src/application.ts
import { BaseApplication, IApplicationInfo } from '@venizia/ignis';
import { HealthCheckComponent, ApiReferenceComponent } from '@venizia/ignis';

import { ProductController } from './controllers/product';
import { CartController } from './controllers/cart';
import { OrderController } from './controllers/order';

import { ProductService } from './services/product.service';
import { CartService } from './services/cart.service';
import { OrderService } from './services/order.service';
import { PaymentService } from './services/payment.service';

import { ProductRepository } from './repositories/product.repository';
import { CartRepository } from './repositories/cart.repository';
import { OrderRepository } from './repositories/order.repository';

import { PostgresDataSource } from './datasources/postgres.datasource';

export class EcommerceApp extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'ecommerce-api', version: '1.0.0' };
  }

  staticConfigure() {}

  preConfigure() {
    // DataSources
    this.dataSource(PostgresDataSource);

    // Repositories
    this.repository(ProductRepository);
    this.repository(CartRepository);
    this.repository(OrderRepository);

    // Services
    this.service(ProductService);
    this.service(CartService);
    this.service(OrderService);
    this.service(PaymentService);

    // Controllers
    this.controller(ProductController);
    this.controller(CartController);
    this.controller(OrderController);

    // Components
    this.component(HealthCheckComponent);
    this.component(ApiReferenceComponent);
  }

  postConfigure() {}

  setupMiddlewares() {}
}
```

## 11. Running the Application

### Environment Variables

```bash
# .env
NODE_ENV=development
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=3000

# Database
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=ecommerce
APP_ENV_POSTGRES_PASSWORD=password
APP_ENV_POSTGRES_DATABASE=ecommerce_db

# Stripe
APP_ENV_STRIPE_SECRET_KEY=sk_test_xxx
APP_ENV_STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Start the Server

```bash
bun run server:dev
```

### Test the API

```bash
# Get products
curl http://localhost:3000/api/products

# Add to cart
curl -X POST http://localhost:3000/api/cart/items \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: my-session" \
  -d '{"productId": "uuid-here", "quantity": 2}'

# Get cart
curl http://localhost:3000/api/cart \
  -H "X-Session-ID: my-session"

# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-uuid",
    "email": "customer@example.com",
    "shippingAddress": {
      "name": "John Doe",
      "line1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    }
  }'
```

## Summary

You've built a complete e-commerce API with:

| Feature | Implementation |
|---------|---------------|
| Product Catalog | ProductService with filtering |
| Shopping Cart | CartService with session handling |
| Order Processing | OrderService with stock validation |
| Payments | PaymentService with Stripe integration |
| Inventory | Stock reservation on order confirmation |

## Next Steps

- Add user authentication with [Auth Component](/extensions/components/authentication/)
- Add order notifications with [Mail Component](/extensions/components/mail/)
- Add real-time updates with [Socket.IO](./realtime-chat.md)
- Deploy with [Deployment Guide](/best-practices/deployment-strategies)
