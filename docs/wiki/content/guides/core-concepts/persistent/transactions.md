# Transactions

Ignis supports explicit transaction objects that can be passed across multiple services and repositories, allowing for complex, multi-step business logic to be atomic.

## Using Transactions

To use transactions, start one from a datasource (via the repository's `beginTransaction` method), and then pass it to subsequent operations via the `options` parameter.

```typescript
// 1. Start a transaction from the datasource (accessed through a repository)
const tx = await userRepo.beginTransaction({
  isolationLevel: 'SERIALIZABLE' // Optional, defaults to 'READ COMMITTED'
});

try {
  // 2. Pass transaction to operations
  // Create user
  const user = await userRepo.create({
    data: userData,
    options: { transaction: tx }
  });

  // Create profile (using same transaction)
  await profileRepo.create({
    data: { userId: user.id, ...profileData },
    options: { transaction: tx }
  });

  // Call a service method (passing the transaction)
  await orderService.createInitialOrder({ userId: user.id, transaction: tx });

  // 3. Commit the transaction
  await tx.commit();
} catch (err) {
  // 4. Rollback on error
  await tx.rollback();
  throw err;
}
```

## Transaction Object

The transaction object returned by `beginTransaction()` has the following properties:

| Property/Method | Type | Description |
| :--- | :--- | :--- |
| `connector` | `TNodePostgresConnector` | A Drizzle connector bound to the transaction's database client |
| `isolationLevel` | `TIsolationLevel` | The isolation level of this transaction |
| `isActive` | `boolean` | Whether the transaction is still active (not yet committed/rolled back) |
| `commit()` | `Promise<void>` | Commit the transaction and release the connection |
| `rollback()` | `Promise<void>` | Rollback the transaction and release the connection |

Calling `commit()` or `rollback()` on an already-ended transaction throws an error.

## Isolation Levels

Ignis supports standard PostgreSQL isolation levels:

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | (Default) Queries see only data committed before the query began. | General use, prevents dirty reads. |
| `REPEATABLE READ` | Queries see a snapshot as of the start of the transaction. | Reports, consistent reads across multiple queries. |
| `SERIALIZABLE` | Strictest level. Emulates serial execution. | Financial transactions, critical data integrity. |

> [!NOTE]
> Ignis only supports these three levels. `READ UNCOMMITTED` is **not** accepted — PostgreSQL treats it as `READ COMMITTED` anyway, so Ignis omits it to avoid confusion.

## Best Practices

1.  **Always use `try...catch`**: Ensure `rollback()` is called on error to release the connection back to the pool.
2.  **Keep it short**: Long-running transactions hold database connections from the pool and can cause connection exhaustion.
3.  **Pass explicit options**: When calling other services inside a transaction, ensure they accept and use the `transaction` option.

```typescript
// Service method supporting transactions
async createInitialOrder(opts: { userId: string; transaction?: ITransaction }) {
  return this.orderRepository.create({
    data: { userId: opts.userId, status: 'PENDING' },
    options: { transaction: opts.transaction } // Forward the transaction
  });
}
```

## Transaction Pattern with Services

When building services that support transactions, follow this pattern:

```typescript
export class OrderService extends BaseService {
  constructor(
    @inject({ key: 'repositories.OrderRepository' })
    private _orderRepository: OrderRepository,
    @inject({ key: 'repositories.OrderItemRepository' })
    private _orderItemRepository: OrderItemRepository,
  ) {
    super({ scope: OrderService.name });
  }

  async createOrderWithItems(opts: {
    orderData: TOrderCreate;
    items: TOrderItemCreate[];
    transaction?: ITransaction;
  }) {
    const { orderData, items, transaction } = opts;

    // Create order
    const order = await this._orderRepository.create({
      data: orderData,
      options: { transaction },
    });

    // Create order items
    for (const item of items) {
      await this._orderItemRepository.create({
        data: { ...item, orderId: order.id },
        options: { transaction },
      });
    }

    return order;
  }
}
```

## Using from Controllers

```typescript
@controller({ path: '/orders' })
export class OrderController extends BaseRestController {
  constructor(
    @inject({ key: 'repositories.OrderRepository' })
    private _orderRepository: OrderRepository,
    @inject({ key: 'services.OrderService' })
    private _orderService: OrderService,
  ) {
    super({ scope: OrderController.name });
  }

  @post({ configs: OrderRoutes.CREATE })
  async createOrder(c: TRouteContext) {
    const body = c.req.valid<{ order: any; items: any[] }>('json');

    const tx = await this._orderRepository.beginTransaction({
      isolationLevel: 'SERIALIZABLE',
    });

    try {
      const order = await this._orderService.createOrderWithItems({
        orderData: body.order,
        items: body.items,
        transaction: tx,
      });

      await tx.commit();
      return c.json(order, HTTP.ResultCodes.RS_2.Created);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}
```

## How Transactions Work Internally

When you pass a `transaction` option to a repository method, the repository uses the transaction's `connector` (a Drizzle instance bound to the transaction's `PoolClient`) instead of the default datasource connector. This ensures all operations within the transaction use the same database connection and see a consistent view of the data.

```typescript
// Inside AbstractRepository (simplified)
protected resolveConnector(opts?: { transaction?: ITransaction }) {
  if (opts?.transaction) {
    return opts.transaction.connector;
  }
  return this.dataSource.connector;
}
```

> **Deep Dive:** See [Repository Reference](../../../references/base/repositories/) for more transaction options and patterns.

## See Also

- **Related Concepts:**
  - [Repositories](/guides/core-concepts/persistent/repositories) - Provide transaction API
  - [Services](/guides/core-concepts/services) - Orchestrate transactional operations
  - [Controllers](/guides/core-concepts/rest-controllers) - Initiate transactions from HTTP handlers
  - [DataSources](/guides/core-concepts/persistent/datasources) - Database connections

- **References:**
  - [Repositories API](/references/base/repositories/) - Transaction methods and options
  - [BaseDataSource API](/references/base/datasources) - Connection and transaction management

- **External Resources:**
  - [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) - Transaction fundamentals
  - [Isolation Levels](https://www.postgresql.org/docs/current/transaction-iso.html) - Understanding isolation levels

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - Transaction design patterns
  - [Common Pitfalls](/best-practices/common-pitfalls) - Transaction anti-patterns

- **Tutorials:**
  - [E-commerce API](/guides/tutorials/ecommerce-api) - Order creation with transactions
