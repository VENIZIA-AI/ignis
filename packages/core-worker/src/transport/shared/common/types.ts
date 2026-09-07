import type { TConstValue } from '@venizia/ignis-helpers/common';
import type {
  IBffErrorEnvelope,
  IBffRequestEnvelope,
  IBffResponseEnvelope,
} from '@/envelope/common';
import { BffRoles, ChannelMessageKinds } from './constants';

export type TBffRole = TConstValue<typeof BffRoles>;

/**
 * There is deliberately no "a new leader is ready" broadcast. A follower cannot act on one safely:
 * BroadcastChannel does not order messages across senders, so a request posted around the moment of
 * promotion may well be answered by the new leader - and a follower that failed its in-flight
 * requests on hearing the announcement would turn some of those successes into errors. The request
 * timeout is the one honest answer for that window.
 */
export type TChannelMessage =
  | { kind: typeof ChannelMessageKinds.REQUEST; envelope: IBffRequestEnvelope }
  | { kind: typeof ChannelMessageKinds.RESPONSE; envelope: IBffResponseEnvelope }
  | { kind: typeof ChannelMessageKinds.ERROR; envelope: IBffErrorEnvelope };

export interface IPendingRequest {
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
  release: () => void;
}

export interface ISharedBffTransportOptions {
  /** Builds the Worker. Called ONLY by whichever tab wins the election - the others never start one. */
  createWorker: () => Worker;
  /** Distinguishes independent BFFs on one origin. The lock name is derived from it. */
  channelName?: string;
  timeoutMs?: number;
  scope?: string;
}
