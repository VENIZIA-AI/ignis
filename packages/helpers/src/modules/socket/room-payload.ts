import { RecordUtility } from '@/utilities/record.utility';

/** Reads the room list of a socket server's join and leave messages. */
export class SocketRoomPayload {
  /**
   * Narrows an untrusted room payload to the strings it actually contains.
   *
   * The payload is data any authenticated client sends: `{"rooms":"lobby"}` passes a `rooms?.length` test (a string
   * has one) and has no `filter` or `map`. Both transports call the handler with no `try`/`catch` around it, so that
   * TypeError would take the process down.
   */
  static toRoomList(payload: unknown): string[] {
    const rooms = RecordUtility.isRecord(payload) ? payload.rooms : undefined;

    return Array.isArray(rooms)
      ? rooms.filter((room): room is string => typeof room === 'string')
      : [];
  }
}
