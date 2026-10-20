import { service } from '@venizia/ignis-kernel';

@service()
export class PlainService {}

console.log(`plain=${PlainService.name}`);
