// `export * from './common'` would also publish five module-private names - `DEFAULT_CHANNEL_NAME`,
// `DEFAULT_TIMEOUT_MS`, `ChannelMessageKinds`, `TChannelMessage`, `IPendingRequest` - through
// `transport/index.ts`.
export { BffRoles } from './common/constants';
export type { ISharedBffTransportOptions, TBffRole } from './common/types';
export { SharedBffTransport } from './transport';
