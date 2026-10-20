export const DEFAULT_CHANNEL_NAME = 'ignis.bff';
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Which part this tab plays. `ELECTING` is the brief window before the lock answers. */
export class BffRoles {
  static readonly ELECTING = 'electing';
  static readonly LEADER = 'leader';
  static readonly FOLLOWER = 'follower';
}

export class ChannelMessageKinds {
  static readonly REQUEST = 'ignis.bff.request';
  static readonly RESPONSE = 'ignis.bff.response';
  static readonly ERROR = 'ignis.bff.error';
}
