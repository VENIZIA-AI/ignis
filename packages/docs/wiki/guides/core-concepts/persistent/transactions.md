# Transactions

Ignis supports explicit transaction objects that can be passed across multiple services and repositories, allowing for complex, multi-step business logic to be atomic.

## Using Transactions

To use transactions, start one from a repository or datasource, and then pass it to subsequent operations via the `options` parameter.

```typescript
// 1. Start a transaction
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

## Isolation Levels

Ignis supports standard PostgreSQL isolation levels:

| Level | Description | Use Case |
|-------|-------------|----------|
| `READ COMMITTED` | (Default) Queries see only data committed before the query began. | General use, prevents dirty reads. |
| `REPEATABLE READ` | Queries see a snapshot as of the start of the transaction. | Reports, consistent reads across multiple queries. |
| `SERIALIZABLE` | Strictest level. Emulates serial execution. | Financial transactions, critical data integrity. |

## Best Practices

1.  **Always use `try...catch...finally`**: Ensure `rollback()` is called on error to release the connection.
2.  **Keep it short**: Long-running transactions hold database locks and connections.
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
export class OrderController extends BaseController {
  constructor(
    @inject({ key: 'repositories.OrderRepository' })
    private _orderRepository: OrderRepository,
    @inject({ key: 'services.OrderService' })
    private _orderService: OrderService,
  ) {
    super({ scope: OrderController.name, path: '/orders' });
  }

  @post({ configs: OrderRoutes.CREATE })
  async createOrder(c: TRouteContext<typeof OrderRoutes.CREATE>) {
    const body = c.req.valid('json');

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

> **Deep Dive:** See [Repository Reference](../../../references/base/repositories/) for more transaction options and patterns.
