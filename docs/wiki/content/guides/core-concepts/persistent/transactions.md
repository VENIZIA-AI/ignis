# Transactions

IGNIS supports explicit transaction objects that can be passed across multiple services and repositories, allowing for complex, multi-step business logic to be atomic.

> [!NOTE] PostgreSQL-only capability
> Real transactions are a **PostgreSQL connector** capability - `BasePostgresDataSource.getCapabilities()` returns `{ transactions: true }` and its `beginTransaction()` opens a real database transaction, as documented below. The typesense connector inherits the engine-neutral `AbstractDataSource` default. Calling `beginTransaction()` on it throws a `501 Not Implemented` (`normalized.code: 'core.not_supported'`) via the shared `throwNotSupported` utility. See [Connectors](/references/base/connectors) for the capabilities model.

## Using Transactions

To use transactions, start one from a datasource (via the repository's `beginTransaction` method), and then pass it to subsequent operations via the `options` parameter.

```typescript
// 1. Start a transaction from the datasource (accessed through a repository)
const tx = await userRepo.beginTransaction({
  isolationLevel: 'SERIALIZABLE' // Optional, defaults to 'READ COMMITTED'
});

try {
  // 2. Pass transaction to operations
  // Create user (write methods return a { count, data } envelope)
  const { data: user } = await userRepo.create({
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
  // 4. Rollback on error. Nest it: rollback() throws if ROLLBACK itself fails, and a bare
  //    `await tx.rollback()` here would replace `err` with the rollback error.
  try {
    await tx.rollback();
  } catch (rollbackError) {
    logger.error('Rollback failed | %s', rollbackError);
  }

  throw err; // the original cause survives
}
```

> [!WARNING] `commit()` and `rollback()` throw on failure
> `COMMIT` can genuinely fail - a deadlock, a serialization failure under `SERIALIZABLE`, a dropped
> connection, a deferred constraint firing at commit time. When it does, `commit()` throws rather
> than resolving, so you never report success on a write that was never persisted. The connection is
> then destroyed instead of being returned to the pool. It may still hold an open
> transaction that the next borrower would inherit.
>
> `rollback()` behaves the same way when it is the FIRST verb to fail. One deliberate exception
> keeps the everyday `catch { await tx.rollback(); throw error; }` pattern safe. Calling
> `rollback()` on a transaction that already ended BY FAILURE (a failed `COMMIT` or a failed prior
> `ROLLBACK`) is a silent no-op. Nothing was committed and the connection is already destroyed, so
> the rollback's goal is achieved and your original error survives. The nested-try form above is
> still the safest general pattern, because a FIRST rollback that itself fails does throw.
>
> The destroy half is **driver-specific**: node-postgres (`pg`) discards the poisoned connection.
> But postgres-js has no destroy semantics (`ReservedSql.release()` takes no argument), so under the
> postgres-js driver the connection returns to the pool anyway. See
> [Postgres Drivers & Supabase](./postgres-drivers) for the full asymmetry.

## Transaction Object

`beginTransaction()` returns an `IDatabaseTransaction` with the following properties:

| Property/Method | Type | Description |
| :--- | :--- | :--- |
| `connector` | `TRelationalConnector<Schema>` | A Drizzle connector bound to the transaction's dedicated connection |
| `isolationLevel` | `TIsolationLevel` | The isolation level of this transaction |
| `isActive` | `boolean` | Whether the transaction is still active (not yet committed/rolled back) |
| `commit()` | `Promise<void>` | Commit and release the connection. **Throws** if `COMMIT` fails, and destroys the connection rather than pooling it |
| `rollback()` | `Promise<void>` | Rollback and release the connection. **Throws** if `ROLLBACK` fails, and destroys the connection rather than pooling it |

Calling `commit()` or `rollback()` on an already-ended transaction throws an error. The one exception: `rollback()` after the transaction ended BY FAILURE is a silent no-op (see the warning above).

## Isolation Levels

IGNIS supports standard PostgreSQL isolation levels:

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | (Default) Queries see only data committed before the query began. | General use, prevents dirty reads. |
| `REPEATABLE READ` | Queries see a snapshot as of the start of the transaction. | Reports, consistent reads across multiple queries. |
| `SERIALIZABLE` | Strictest level. Emulates serial execution. | Financial transactions, critical data integrity. |

> [!NOTE]
> IGNIS only supports these three levels. The fourth SQL-standard level (uncommitted reads) is **not** accepted - PostgreSQL treats it as `READ COMMITTED` anyway, so IGNIS omits it to avoid confusion.

## Best Practices

1.  **Always use `try...catch`, and nest the rollback**: `rollback()` throws when `ROLLBACK` fails. A bare `await tx.rollback()` inside a `catch` would discard the error that sent you there.
2.  **Wrap the rollback in its own `try...catch`**: log the rollback failure, and rethrow the original cause.
3.  **Keep it short**: Long-running transactions hold database connections from the pool and can cause connection exhaustion.
4.  **Pass explicit options**: When calling other services inside a transaction, ensure they accept and use the `transaction` option.

```typescript
// Service method supporting transactions
async createInitialOrder(opts: { userId: string; transaction?: IDatabaseTransaction }) {
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
    transaction?: IDatabaseTransaction;
  }) {
    const { orderData, items, transaction } = opts;

    // Create order
    const { data: order } = await this._orderRepository.create({
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
    const body = await c.req.json<{ order: TOrderCreate; items: TOrderItemCreate[] }>();

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
      try {
        await tx.rollback();
      } catch (rollbackError) {
        this.logger.error('Rollback failed | %s', rollbackError);
      }

      throw err;
    }
  }
}
```

## How Transactions Work Internally

When you pass a `transaction` option to a repository method, the repository uses the transaction's `connector` instead of the default datasource connector. That connector is a Drizzle instance bound to the transaction's dedicated connection. All operations within the transaction therefore use the same database connection and see a consistent view of the data.

```typescript
// Inside PostgresBaseRepository (simplified)
protected resolveConnector(opts?: { transaction?: IDatabaseTransaction }) {
  if (!opts?.transaction) {
    return this.dataSource.connector;
  }

  // Throws if the transaction has already been committed/rolled back,
  // or if it is not a postgres transaction.
  return opts.transaction.connector;
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
