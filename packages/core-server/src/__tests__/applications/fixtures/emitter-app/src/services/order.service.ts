import { inject, service } from '@venizia/ignis-kernel';
import { OrderEmitter } from '../emitters/order.emitter';

@service()
export class OrderService {
  constructor(@inject({ target: OrderEmitter }) readonly emitter: OrderEmitter) {}
}
