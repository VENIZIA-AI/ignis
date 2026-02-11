# Building a Real-Time Chat Application

This tutorial shows you how to build a real-time chat application with rooms, direct messages, typing indicators, and presence using Socket.IO — powered by the `SocketIOComponent` and `SocketIOServerHelper`.

**What You'll Build:**

- Chat rooms (channels)
- Direct messages between users
- Typing indicators
- Online/offline presence
- Message history with pagination

## Prerequisites

- Completed [Building a CRUD API](./building-a-crud-api.md)
- Understanding of [Socket.IO Component](/references/components/socket-io/)
- Understanding of [Socket.IO Helper](/references/helpers/socket-io/)
- Redis for pub/sub (required by `SocketIOServerHelper`)

## 1. Project Setup

```bash
mkdir chat-api
cd chat-api
bun init -y

# Install dependencies
bun add hono @hono/zod-openapi @venizia/ignis dotenv-flow
bun add drizzle-orm drizzle-zod pg
bun add -d typescript @types/bun @venizia/dev-configs drizzle-kit @types/pg

# For Bun runtime — Socket.IO engine
bun add @socket.io/bun-engine
```

> [!NOTE]
> You do **not** need to install `socket.io` directly. It is included as a dependency of `@venizia/ignis-helpers`. For the client side, install `socket.io-client` separately.

## 2. Database Models

Models in IGNIS combine Drizzle ORM schemas with Entity classes.

### User Model

```typescript
// src/models/user.model.ts
import {
  BaseEntity,
  createRelations,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const userTable = pgTable('User', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  displayName: varchar('display_name', { length: 100 }),
  avatar: text('avatar'),
  isOnline: boolean('is_online').default(false).notNull(),
  lastSeenAt: timestamp('last_seen_at'),
});

export const userRelations = createRelations({
  source: userTable,
  relations: [],
});

export type TUserSchema = typeof userTable;
export type TUser = TTableObject<TUserSchema>;

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelations.definitions;
  static override TABLE_NAME = 'User';
}
```

### Room Model

```typescript
// src/models/room.model.ts
import {
  BaseEntity,
  createRelations,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { userTable } from './user.model';

export const roomTable = pgTable('Room', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isPrivate: boolean('is_private').default(false).notNull(),
  createdBy: text('created_by').notNull(),
});

export const roomMemberTable = pgTable('RoomMember', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  roomId: text('room_id').notNull(),
  userId: text('user_id').notNull(),
  role: varchar('role', { length: 20 }).default('member').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  lastReadAt: timestamp('last_read_at'),
});

export const roomRelations = createRelations({
  source: roomTable,
  relations: [
    { type: 'one', name: 'creator', target: () => userTable, fields: ['createdBy'], references: ['id'] },
    { type: 'many', name: 'members', target: () => roomMemberTable, fields: ['id'], references: ['roomId'] },
  ],
});

export const roomMemberRelations = createRelations({
  source: roomMemberTable,
  relations: [
    { type: 'one', name: 'room', target: () => roomTable, fields: ['roomId'], references: ['id'] },
    { type: 'one', name: 'user', target: () => userTable, fields: ['userId'], references: ['id'] },
  ],
});

export type TRoomSchema = typeof roomTable;
export type TRoom = TTableObject<TRoomSchema>;
export type TRoomMemberSchema = typeof roomMemberTable;
export type TRoomMember = TTableObject<TRoomMemberSchema>;

@model({ type: 'entity' })
export class Room extends BaseEntity<typeof Room.schema> {
  static override schema = roomTable;
  static override relations = () => roomRelations.definitions;
  static override TABLE_NAME = 'Room';
}

@model({ type: 'entity' })
export class RoomMember extends BaseEntity<typeof RoomMember.schema> {
  static override schema = roomMemberTable;
  static override relations = () => roomMemberRelations.definitions;
  static override TABLE_NAME = 'RoomMember';
}
```

### Message Model

```typescript
// src/models/message.model.ts
import {
  BaseEntity,
  createRelations,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  TTableObject,
} from '@venizia/ignis';
import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { userTable } from './user.model';
import { roomTable } from './room.model';

export const messageTable = pgTable('Message', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  roomId: text('room_id').notNull(),
  senderId: text('sender_id').notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 20 }).default('text').notNull(),
  metadata: text('metadata'),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
});

export const directMessageTable = pgTable('DirectMessage', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  senderId: text('sender_id').notNull(),
  receiverId: text('receiver_id').notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 20 }).default('text').notNull(),
  metadata: text('metadata'),
  readAt: timestamp('read_at'),
  deletedAt: timestamp('deleted_at'),
});

export const messageRelations = createRelations({
  source: messageTable,
  relations: [
    { type: 'one', name: 'room', target: () => roomTable, fields: ['roomId'], references: ['id'] },
    { type: 'one', name: 'sender', target: () => userTable, fields: ['senderId'], references: ['id'] },
  ],
});

export const directMessageRelations = createRelations({
  source: directMessageTable,
  relations: [
    { type: 'one', name: 'sender', target: () => userTable, fields: ['senderId'], references: ['id'] },
    { type: 'one', name: 'receiver', target: () => userTable, fields: ['receiverId'], references: ['id'] },
  ],
});

export type TMessageSchema = typeof messageTable;
export type TMessage = TTableObject<TMessageSchema>;
export type TDirectMessageSchema = typeof directMessageTable;
export type TDirectMessage = TTableObject<TDirectMessageSchema>;

@model({ type: 'entity' })
export class Message extends BaseEntity<typeof Message.schema> {
  static override schema = messageTable;
  static override relations = () => messageRelations.definitions;
  static override TABLE_NAME = 'Message';
}

@model({ type: 'entity' })
export class DirectMessage extends BaseEntity<typeof DirectMessage.schema> {
  static override schema = directMessageTable;
  static override relations = () => directMessageRelations.definitions;
  static override TABLE_NAME = 'DirectMessage';
}
```

### Models Index

```typescript
// src/models/index.ts
export * from './user.model';
export * from './room.model';
export * from './message.model';
```

## 3. DataSource

```typescript
// src/datasources/postgres.datasource.ts
import {
  BaseDataSource,
  datasource,
  TNodePostgresConnector,
  ValueOrPromise,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'chat_db',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();

    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      Object.keys(schema).length,
      Object.keys(schema),
    );

    const client = new Pool(this.settings);
    this.connector = drizzle({ client, schema });
  }
}
```

## 4. Repositories

### User Repository

```typescript
// src/repositories/user.repository.ts
import { User } from '@/models/user.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

### Room Repository

```typescript
// src/repositories/room.repository.ts
import { Room, RoomMember } from '@/models/room.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository, inject } from '@venizia/ignis';

@repository({ model: RoomMember, dataSource: PostgresDataSource })
export class RoomMemberRepository extends DefaultCRUDRepository<typeof RoomMember.schema> {}

@repository({ model: Room, dataSource: PostgresDataSource })
export class RoomRepository extends DefaultCRUDRepository<typeof Room.schema> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,

    // From 2nd parameter, inject additional dependencies
    @inject({ key: 'repositories.RoomMemberRepository' })
    private _memberRepo: RoomMemberRepository,
  ) {
    super(dataSource);
  }

  async findByUser(opts: { userId: string }) {
    const memberships = await this._memberRepo.find({
      where: { userId: opts.userId },
      include: { room: true },
    });
    return memberships.map(m => m.room);
  }

  async isMember(opts: { roomId: string; userId: string }): Promise<boolean> {
    const member = await this._memberRepo.findOne({
      where: { roomId: opts.roomId, userId: opts.userId },
    });
    return !!member;
  }

  async addMember(opts: { roomId: string; userId: string; role?: string }) {
    return this._memberRepo.create({
      roomId: opts.roomId,
      userId: opts.userId,
      role: opts.role ?? 'member',
    });
  }

  async removeMember(opts: { roomId: string; userId: string }) {
    return this._memberRepo.deleteAll({
      where: { roomId: opts.roomId, userId: opts.userId },
    });
  }

  async getMember(opts: { roomId: string; userId: string }) {
    return this._memberRepo.findOne({
      where: { roomId: opts.roomId, userId: opts.userId },
    });
  }

  async getMembers(opts: { roomId: string }) {
    return this._memberRepo.find({
      where: { roomId: opts.roomId },
      include: { user: true },
    });
  }
}
```

### Message Repository

```typescript
// src/repositories/message.repository.ts
import { Message, DirectMessage } from '@/models/message.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository, inject } from '@venizia/ignis';

@repository({ model: DirectMessage, dataSource: PostgresDataSource })
export class DirectMessageRepository extends DefaultCRUDRepository<typeof DirectMessage.schema> {}

@repository({ model: Message, dataSource: PostgresDataSource })
export class MessageRepository extends DefaultCRUDRepository<typeof Message.schema> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,

    // From 2nd parameter, inject additional dependencies
    @inject({ key: 'repositories.DirectMessageRepository' })
    private _dmRepo: DirectMessageRepository,
  ) {
    super(dataSource);
  }

  async createDirectMessage(opts: { senderId: string; receiverId: string; content: string }) {
    return this._dmRepo.create(opts);
  }

  async findDirectMessages(opts: {
    userId1: string;
    userId2: string;
    limit?: number;
    before?: string;
  }) {
    return this._dmRepo.find({
      where: {
        or: [
          { senderId: opts.userId1, receiverId: opts.userId2 },
          { senderId: opts.userId2, receiverId: opts.userId1 },
        ],
      },
      orderBy: { createdAt: 'desc' },
      limit: opts.limit ?? 50,
    });
  }

  async findConversations(opts: { userId: string }) {
    // Get unique conversation partners
    const sent = await this._dmRepo.find({
      where: { senderId: opts.userId },
      include: { receiver: true },
    });
    const received = await this._dmRepo.find({
      where: { receiverId: opts.userId },
      include: { sender: true },
    });

    // Combine and deduplicate
    const partners = new Map();
    sent.forEach(m => partners.set(m.receiverId, m.receiver));
    received.forEach(m => partners.set(m.senderId, m.sender));

    return Array.from(partners.values());
  }
}
```

## 5. Chat Service

The `ChatService` handles business logic for rooms, messages, and presence. It also registers Socket.IO event handlers on each authenticated client via the `clientConnectedFn` callback.

```typescript
// src/services/chat.service.ts
import {
  BaseApplication,
  BaseService,
  CoreBindings,
  inject,
  SocketIOBindingKeys,
  SocketIOServerHelper,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';
import { ISocketIOClient, getError } from '@venizia/ignis-helpers';
import { Socket } from 'socket.io';
import { MessageRepository } from '../repositories/message.repository';
import { RoomRepository } from '../repositories/room.repository';
import { UserRepository } from '../repositories/user.repository';

export class ChatService extends BaseService {
  private _socketIOHelper: SocketIOServerHelper | null = null;
  private _typingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: 'MessageRepository',
      }),
    })
    private _messageRepo: MessageRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: 'RoomRepository',
      }),
    })
    private _roomRepo: RoomRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: 'UserRepository',
      }),
    })
    private _userRepo: UserRepository,
  ) {
    super({ scope: ChatService.name });
  }

  // ---------------------------------------------------------------------------
  // SocketIOServerHelper — lazy getter (bound after server starts via post-start hook)
  // ---------------------------------------------------------------------------
  private get socketIOHelper(): SocketIOServerHelper {
    if (!this._socketIOHelper) {
      this._socketIOHelper =
        this.application.get<SocketIOServerHelper>({
          key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
          isOptional: true,
        }) ?? null;
    }

    if (!this._socketIOHelper) {
      throw new Error('[ChatService] SocketIO not initialized. Server must be started first.');
    }

    return this._socketIOHelper;
  }

  // ---------------------------------------------------------------------------
  // Socket event handlers — called from clientConnectedFn after authentication
  // ---------------------------------------------------------------------------
  registerClientHandlers(opts: { socket: Socket }) {
    const logger = this.logger.for(this.registerClientHandlers.name);
    const { socket } = opts;
    const socketId = socket.id;

    logger.info('Registering chat handlers | socketId: %s', socketId);

    // --- Set user online (using socket ID as user identifier for simplicity) ---
    this.broadcastPresence({ userId: socketId, status: 'online' });

    // --- Room handlers ---
    socket.on('room:join', async (data: { roomId: string; userId: string }) => {
      try {
        await this.joinRoom({ roomId: data.roomId, userId: data.userId });

        // Also join the Socket.IO room for real-time delivery
        socket.join(`room:${data.roomId}`);

        // Notify room members
        this.socketIOHelper.send({
          destination: `room:${data.roomId}`,
          payload: {
            topic: 'room:user-joined',
            data: { roomId: data.roomId, userId: data.userId },
          },
        });

        logger.info('User joined room | userId: %s | roomId: %s', data.userId, data.roomId);
      } catch (error) {
        this.socketIOHelper.send({
          destination: socketId,
          payload: {
            topic: 'error',
            data: { code: 'JOIN_FAILED', message: (error as Error).message },
          },
        });
      }
    });

    socket.on('room:leave', (data: { roomId: string; userId: string }) => {
      socket.leave(`room:${data.roomId}`);

      this.socketIOHelper.send({
        destination: `room:${data.roomId}`,
        payload: {
          topic: 'room:user-left',
          data: { roomId: data.roomId, userId: data.userId },
        },
      });

      logger.info('User left room | userId: %s | roomId: %s', data.userId, data.roomId);
    });

    // --- Message handlers ---
    socket.on(
      'message:send',
      async (data: { roomId: string; content: string; type?: string; userId: string }) => {
        try {
          const message = await this.sendMessage({
            roomId: data.roomId,
            senderId: data.userId,
            content: data.content,
            type: data.type,
          });

          // Broadcast to room
          this.socketIOHelper.send({
            destination: `room:${data.roomId}`,
            payload: { topic: 'message:new', data: message },
          });

          // Clear typing indicator
          this.clearTyping({ socketId, roomId: data.roomId });
        } catch (error) {
          this.socketIOHelper.send({
            destination: socketId,
            payload: {
              topic: 'error',
              data: { code: 'SEND_FAILED', message: (error as Error).message },
            },
          });
        }
      },
    );

    socket.on('message:edit', async (data: { messageId: string; content: string; userId: string }) => {
      try {
        const message = await this.editMessage({
          messageId: data.messageId,
          userId: data.userId,
          content: data.content,
        });

        this.socketIOHelper.send({
          destination: `room:${message.roomId}`,
          payload: { topic: 'message:edited', data: message },
        });
      } catch (error) {
        this.socketIOHelper.send({
          destination: socketId,
          payload: {
            topic: 'error',
            data: { code: 'EDIT_FAILED', message: (error as Error).message },
          },
        });
      }
    });

    socket.on('message:delete', async (data: { messageId: string; userId: string }) => {
      try {
        const message = await this.deleteMessage({
          messageId: data.messageId,
          userId: data.userId,
        });

        this.socketIOHelper.send({
          destination: `room:${message.roomId}`,
          payload: {
            topic: 'message:deleted',
            data: { messageId: data.messageId, roomId: message.roomId },
          },
        });
      } catch (error) {
        this.socketIOHelper.send({
          destination: socketId,
          payload: {
            topic: 'error',
            data: { code: 'DELETE_FAILED', message: (error as Error).message },
          },
        });
      }
    });

    // --- Direct message handlers ---
    socket.on('dm:send', async (data: { receiverId: string; content: string; userId: string }) => {
      try {
        const message = await this.sendDirectMessage({
          senderId: data.userId,
          receiverId: data.receiverId,
          content: data.content,
        });

        // Send to receiver
        this.socketIOHelper.send({
          destination: data.receiverId,
          payload: { topic: 'dm:new', data: message },
        });

        // Send back to sender
        this.socketIOHelper.send({
          destination: socketId,
          payload: { topic: 'dm:new', data: message },
        });
      } catch (error) {
        this.socketIOHelper.send({
          destination: socketId,
          payload: {
            topic: 'error',
            data: { code: 'DM_FAILED', message: (error as Error).message },
          },
        });
      }
    });

    // --- Typing handlers ---
    socket.on('typing:start', (data: { roomId: string }) => {
      this.handleTyping({ socketId, roomId: data.roomId, isTyping: true });
    });

    socket.on('typing:stop', (data: { roomId: string }) => {
      this.handleTyping({ socketId, roomId: data.roomId, isTyping: false });
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      logger.info('User disconnected | socketId: %s', socketId);
      this.broadcastPresence({ userId: socketId, status: 'offline' });
    });

    logger.info('Chat handlers registered | socketId: %s', socketId);
  }

  // ---------------------------------------------------------------------------
  // Room operations
  // ---------------------------------------------------------------------------
  async createRoom(opts: { name: string; description?: string; isPrivate?: boolean; createdBy: string }) {
    const room = await this._roomRepo.create(opts);

    // Add creator as admin
    await this._roomRepo.addMember({ roomId: room.id, userId: opts.createdBy, role: 'admin' });

    return room;
  }

  async joinRoom(opts: { roomId: string; userId: string }) {
    const room = await this._roomRepo.findById(opts.roomId);
    if (!room) {
      throw getError({ statusCode: 404, message: 'Room not found' });
    }

    if (room.isPrivate) {
      const isMember = await this._roomRepo.isMember({ roomId: opts.roomId, userId: opts.userId });
      if (!isMember) {
        throw getError({ statusCode: 403, message: 'Cannot join private room' });
      }
    } else {
      await this._roomRepo.addMember({ roomId: opts.roomId, userId: opts.userId, role: 'member' });
    }

    return room;
  }

  async leaveRoom(opts: { roomId: string; userId: string }) {
    await this._roomRepo.removeMember({ roomId: opts.roomId, userId: opts.userId });
  }

  async getUserRooms(opts: { userId: string }) {
    return this._roomRepo.findByUser({ userId: opts.userId });
  }

  // ---------------------------------------------------------------------------
  // Message operations
  // ---------------------------------------------------------------------------
  async sendMessage(opts: { roomId: string; senderId: string; content: string; type?: string }) {
    const isMember = await this._roomRepo.isMember({ roomId: opts.roomId, userId: opts.senderId });
    if (!isMember) {
      throw getError({ statusCode: 403, message: 'Not a member of this room' });
    }

    const message = await this._messageRepo.create({
      roomId: opts.roomId,
      senderId: opts.senderId,
      content: opts.content,
      type: opts.type ?? 'text',
    });

    const sender = await this._userRepo.findById(opts.senderId);

    return {
      ...message,
      sender: {
        id: sender.id,
        username: sender.username,
        displayName: sender.displayName,
        avatar: sender.avatar,
      },
    };
  }

  async editMessage(opts: { messageId: string; userId: string; content: string }) {
    const message = await this._messageRepo.findById(opts.messageId);

    if (!message) {
      throw getError({ statusCode: 404, message: 'Message not found' });
    }

    if (message.senderId !== opts.userId) {
      throw getError({ statusCode: 403, message: 'Cannot edit others messages' });
    }

    return this._messageRepo.updateById(opts.messageId, {
      content: opts.content,
      editedAt: new Date(),
    });
  }

  async deleteMessage(opts: { messageId: string; userId: string }) {
    const message = await this._messageRepo.findById(opts.messageId);

    if (!message) {
      throw getError({ statusCode: 404, message: 'Message not found' });
    }

    if (message.senderId !== opts.userId) {
      const member = await this._roomRepo.getMember({ roomId: message.roomId, userId: opts.userId });
      if (!member || member.role !== 'admin') {
        throw getError({ statusCode: 403, message: 'Cannot delete this message' });
      }
    }

    return this._messageRepo.updateById(opts.messageId, {
      deletedAt: new Date(),
    });
  }

  async getMessages(opts: { roomId: string; limit?: number; before?: string }) {
    const where: any = {
      roomId: opts.roomId,
      deletedAt: null,
    };

    if (opts.before) {
      const beforeMessage = await this._messageRepo.findById(opts.before);
      if (beforeMessage) {
        where.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    return this._messageRepo.find({
      where,
      orderBy: { createdAt: 'desc' },
      limit: opts.limit ?? 50,
    });
  }

  // ---------------------------------------------------------------------------
  // Direct message operations
  // ---------------------------------------------------------------------------
  async sendDirectMessage(opts: { senderId: string; receiverId: string; content: string }) {
    return this._messageRepo.createDirectMessage(opts);
  }

  async getDirectMessages(opts: { userId1: string; userId2: string; limit?: number; before?: string }) {
    return this._messageRepo.findDirectMessages({
      userId1: opts.userId1,
      userId2: opts.userId2,
      limit: opts.limit,
      before: opts.before,
    });
  }

  async getConversations(opts: { userId: string }) {
    return this._messageRepo.findConversations({ userId: opts.userId });
  }

  // ---------------------------------------------------------------------------
  // Presence operations
  // ---------------------------------------------------------------------------
  async setOnline(opts: { userId: string }) {
    await this._userRepo.updateById(opts.userId, {
      isOnline: true,
      lastSeenAt: new Date(),
    });
  }

  async setOffline(opts: { userId: string }) {
    await this._userRepo.updateById(opts.userId, {
      isOnline: false,
      lastSeenAt: new Date(),
    });
  }

  async getOnlineUsers(opts: { roomId: string }) {
    const members = await this._roomRepo.getMembers({ roomId: opts.roomId });
    return members.filter(m => m.user.isOnline);
  }

  // ---------------------------------------------------------------------------
  // Typing indicator helpers
  // ---------------------------------------------------------------------------
  private handleTyping(opts: { socketId: string; roomId: string; isTyping: boolean }) {
    const key = `${opts.roomId}:${opts.socketId}`;

    const existingTimeout = this._typingTimeouts.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Broadcast typing status to room
    this.socketIOHelper.send({
      destination: `room:${opts.roomId}`,
      payload: {
        topic: 'typing:update',
        data: { roomId: opts.roomId, userId: opts.socketId, isTyping: opts.isTyping },
      },
    });

    if (opts.isTyping) {
      // Auto-stop typing after 3 seconds
      const timeout = setTimeout(() => {
        this.socketIOHelper.send({
          destination: `room:${opts.roomId}`,
          payload: {
            topic: 'typing:update',
            data: { roomId: opts.roomId, userId: opts.socketId, isTyping: false },
          },
        });
        this._typingTimeouts.delete(key);
      }, 3000);

      this._typingTimeouts.set(key, timeout);
    }
  }

  private clearTyping(opts: { socketId: string; roomId: string }) {
    const key = `${opts.roomId}:${opts.socketId}`;
    const timeout = this._typingTimeouts.get(key);

    if (timeout) {
      clearTimeout(timeout);
      this._typingTimeouts.delete(key);
    }

    this.socketIOHelper.send({
      destination: `room:${opts.roomId}`,
      payload: {
        topic: 'typing:update',
        data: { roomId: opts.roomId, userId: opts.socketId, isTyping: false },
      },
    });
  }

  private broadcastPresence(opts: { userId: string; status: string }) {
    this.socketIOHelper.send({
      payload: {
        topic: 'presence:changed',
        data: { userId: opts.userId, status: opts.status, lastSeenAt: new Date().toISOString() },
      },
    });
  }
}
```

> [!IMPORTANT]
> **Lazy getter pattern**: `SocketIOServerHelper` is bound via a post-start hook, so it's not available during DI construction. The `private get socketIOHelper()` getter resolves it lazily on first access. See [Socket.IO Component](/references/components/socket-io/#step-3-use-in-servicescontrollers) for details.

## 6. Application Setup

The application binds Redis, authentication, and the client connected handler via `SocketIOBindingKeys`, then registers `SocketIOComponent`. No manual Socket.IO server creation needed.

```typescript
// src/application.ts
import {
  applicationEnvironment,
  BaseApplication,
  BindingKeys,
  BindingNamespaces,
  IApplicationConfigs,
  IApplicationInfo,
  ISocketIOServerBaseOptions,
  RedisHelper,
  SocketIOBindingKeys,
  SocketIOComponent,
  SocketIOServerHelper,
  ValueOrPromise,
} from '@venizia/ignis';
import { ChatService } from './services/chat.service';
import { ChatController } from './controllers/chat.controller';
import { UserRepository } from './repositories/user.repository';
import { RoomRepository, RoomMemberRepository } from './repositories/room.repository';
import { MessageRepository, DirectMessageRepository } from './repositories/message.repository';

export class ChatApp extends BaseApplication {
  private redisHelper: RedisHelper;

  getAppInfo(): IApplicationInfo {
    return { name: 'chat-api', version: '1.0.0' };
  }

  staticConfigure() {}

  preConfigure(): ValueOrPromise<void> {
    // Register repositories
    this.repository(UserRepository);
    this.repository(RoomRepository);
    this.repository(RoomMemberRepository);
    this.repository(MessageRepository);
    this.repository(DirectMessageRepository);

    // Register services
    this.service(ChatService);

    // Register controllers
    this.controller(ChatController);

    // Setup Socket.IO
    this.setupSocketIO();
  }

  postConfigure(): ValueOrPromise<void> {}

  setupMiddlewares(): ValueOrPromise<void> {}

  // ---------------------------------------------------------------------------
  private setupSocketIO() {
    // 1. Redis connection — SocketIOServerHelper creates 3 duplicate connections
    //    for adapter (pub/sub) and emitter automatically
    this.redisHelper = new RedisHelper({
      name: 'chat-redis',
      host: process.env.APP_ENV_REDIS_HOST ?? 'localhost',
      port: +(process.env.APP_ENV_REDIS_PORT ?? 6379),
      password: process.env.APP_ENV_REDIS_PASSWORD,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: SocketIOBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // 2. Authentication handler — called when a client emits 'authenticate'
    //    Receives the Socket.IO handshake (headers, query, auth object)
    const authenticateFn: ISocketIOServerBaseOptions['authenticateFn'] = handshake => {
      const token =
        handshake.headers.authorization?.replace('Bearer ', '') ??
        handshake.auth?.token;

      if (!token) {
        return false;
      }

      // Implement your JWT/session verification here
      // For example: return verifyJWT(token);
      return true;
    };

    this.bind<ISocketIOServerBaseOptions['authenticateFn']>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Client connected handler — called AFTER successful authentication
    //    This is where you register custom event handlers on each socket
    const clientConnectedFn: ISocketIOServerBaseOptions['clientConnectedFn'] = ({ socket }) => {
      const chatService = this.get<ChatService>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: ChatService.name,
        }),
      });

      chatService.registerClientHandlers({ socket });
    };

    this.bind<ISocketIOServerBaseOptions['clientConnectedFn']>({
      key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // 4. (Optional) Custom server options — override defaults
    this.bind({
      key: SocketIOBindingKeys.SERVER_OPTIONS,
    }).toValue({
      identifier: 'chat-socket-server',
      path: '/io',
      cors: {
        origin: process.env.APP_ENV_CORS_ORIGIN ?? '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // 5. Register the component — that's it!
    //    SocketIOComponent handles:
    //    - Runtime detection (Node.js / Bun)
    //    - Post-start hook to create SocketIOServerHelper after server starts
    //    - Redis adapter + emitter setup (automatic)
    //    - Binding SocketIOServerHelper to SOCKET_IO_INSTANCE
    this.component(SocketIOComponent);
  }

  // ---------------------------------------------------------------------------
  override async stop(): Promise<void> {
    this.logger.info('[stop] Shutting down chat application...');

    // 1. Shutdown Socket.IO (disconnects all clients, closes IO server, quits Redis)
    const socketIOHelper = this.get<SocketIOServerHelper>({
      key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
      isOptional: true,
    });

    if (socketIOHelper) {
      await socketIOHelper.shutdown();
    }

    // 2. Disconnect Redis helper
    if (this.redisHelper) {
      await this.redisHelper.disconnect();
    }

    await super.stop();
  }
}
```

### How It Works

```
Application Lifecycle
═════════════════════

preConfigure()
  ├── Register repositories, services, controllers
  └── setupSocketIO()
        ├── Bind RedisHelper → REDIS_CONNECTION
        ├── Bind authenticateFn → AUTHENTICATE_HANDLER
        ├── Bind clientConnectedFn → CLIENT_CONNECTED_HANDLER
        ├── Bind server options → SERVER_OPTIONS
        └── this.component(SocketIOComponent)

initialize()
  └── SocketIOComponent.binding()
        ├── resolveBindings() — reads all bound values
        ├── RuntimeModules.detect() — auto-detect Node.js or Bun
        └── registerPostStartHook('socket-io-initialize')

start()
  ├── startBunModule() / startNodeModule() — server starts
  └── executePostStartHooks()
        └── 'socket-io-initialize'
              ├── Create SocketIOServerHelper (with Redis adapter + emitter)
              ├── Bind to SOCKET_IO_INSTANCE
              └── Wire into server (runtime-specific)

Client connects → 'authenticate' event → authenticateFn() → 'authenticated'
  └── clientConnectedFn({ socket }) → chatService.registerClientHandlers({ socket })
```

## 7. REST API for Chat History

```typescript
// src/controllers/chat.controller.ts
import { z } from '@hono/zod-openapi';
import {
  BaseController,
  controller,
  inject,
  jsonResponse,
  TRouteContext,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { ChatService } from '../services/chat.service';

const ChatRoutes = {
  GET_ROOMS: {
    method: HTTP.Methods.GET,
    path: '/rooms',
    responses: jsonResponse({
      description: 'User rooms',
      schema: z.array(z.any()),
    }),
  },
  CREATE_ROOM: {
    method: HTTP.Methods.POST,
    path: '/rooms',
    responses: jsonResponse({
      description: 'Created room',
      schema: z.any(),
    }),
  },
  GET_MESSAGES: {
    method: HTTP.Methods.GET,
    path: '/rooms/{roomId}/messages',
    responses: jsonResponse({
      description: 'Room messages',
      schema: z.array(z.any()),
    }),
  },
  GET_CONVERSATIONS: {
    method: HTTP.Methods.GET,
    path: '/conversations',
    responses: jsonResponse({
      description: 'User conversations',
      schema: z.array(z.any()),
    }),
  },
  GET_DIRECT_MESSAGES: {
    method: HTTP.Methods.GET,
    path: '/dm/{userId}',
    responses: jsonResponse({
      description: 'Direct messages',
      schema: z.array(z.any()),
    }),
  },
} as const;

@controller({ path: '/chat' })
export class ChatController extends BaseController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: 'ChatService',
      }),
    })
    private _chatService: ChatService,
  ) {
    super({ scope: ChatController.name });
    this.definitions = ChatRoutes;
  }

  override binding() {
    // GET /chat/rooms
    this.bindRoute({ configs: ChatRoutes.GET_ROOMS }).to({
      handler: async (c: TRouteContext) => {
        const userId = c.get('userId');
        const rooms = await this._chatService.getUserRooms({ userId });
        return c.json(rooms, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // POST /chat/rooms
    this.bindRoute({ configs: ChatRoutes.CREATE_ROOM }).to({
      handler: async (c: TRouteContext) => {
        const userId = c.get('userId');
        const data = await c.req.json<{ name: string; description?: string; isPrivate: boolean }>();
        const room = await this._chatService.createRoom({ ...data, createdBy: userId });
        return c.json(room, HTTP.ResultCodes.RS_2.Created);
      },
    });

    // GET /chat/rooms/:roomId/messages
    this.bindRoute({ configs: ChatRoutes.GET_MESSAGES }).to({
      handler: async (c: TRouteContext) => {
        const roomId = c.req.param('roomId');
        const limit = c.req.query('limit');
        const before = c.req.query('before');

        const messages = await this._chatService.getMessages({
          roomId,
          limit: limit ? parseInt(limit) : undefined,
          before: before ?? undefined,
        });

        return c.json(messages, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // GET /chat/conversations
    this.bindRoute({ configs: ChatRoutes.GET_CONVERSATIONS }).to({
      handler: async (c: TRouteContext) => {
        const userId = c.get('userId');
        const conversations = await this._chatService.getConversations({ userId });
        return c.json(conversations, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // GET /chat/dm/:userId
    this.bindRoute({ configs: ChatRoutes.GET_DIRECT_MESSAGES }).to({
      handler: async (c: TRouteContext) => {
        const currentUserId = c.get('userId');
        const otherUserId = c.req.param('userId');
        const limit = c.req.query('limit');
        const before = c.req.query('before');

        const messages = await this._chatService.getDirectMessages({
          userId1: currentUserId,
          userId2: otherUserId,
          limit: limit ? parseInt(limit) : undefined,
          before: before ?? undefined,
        });

        return c.json(messages, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

## 8. Client Usage

Clients must follow the `SocketIOServerHelper` authentication flow: **connect** → **emit `authenticate`** → **receive `authenticated`** — then they're ready to send and receive events.

### JavaScript Client Example

```typescript
// client/chat-client.ts
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';
const SOCKET_PATH = '/io';

class ChatClient {
  private _socket: Socket;
  private _authenticated = false;

  constructor(opts: { token: string }) {
    this._socket = io(SERVER_URL, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      extraHeaders: {
        Authorization: `Bearer ${opts.token}`,
      },
    });

    this.setupLifecycle();
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle — follows SocketIOServerHelper's auth flow
  // ---------------------------------------------------------------------------
  private setupLifecycle() {
    // Step 1: Connected — now send authenticate event
    this._socket.on('connect', () => {
      console.log('Connected | id:', this._socket.id);
      this._socket.emit('authenticate');
    });

    // Step 2: Authenticated — ready to use
    this._socket.on('authenticated', (data: { id: string; time: string }) => {
      console.log('Authenticated | id:', data.id);
      this._authenticated = true;
      this.setupEventHandlers();
    });

    // Authentication failed
    this._socket.on('unauthenticated', (data: { message: string }) => {
      console.error('Authentication failed:', data.message);
      this._authenticated = false;
    });

    // Keep-alive ping from server (every 30s)
    this._socket.on('ping', () => {
      // Server is checking we're alive — no action needed
    });

    this._socket.on('disconnect', (reason: string) => {
      console.log('Disconnected:', reason);
      this._authenticated = false;
    });
  }

  // ---------------------------------------------------------------------------
  // Custom event handlers — registered after authentication
  // ---------------------------------------------------------------------------
  private setupEventHandlers() {
    this._socket.on('message:new', (message) => {
      console.log('New message:', message);
    });

    this._socket.on('dm:new', (message) => {
      console.log('Direct message:', message);
    });

    this._socket.on('typing:update', (data) => {
      const action = data.isTyping ? 'typing' : 'stopped typing';
      console.log(`User ${data.userId} is ${action} in room ${data.roomId}`);
    });

    this._socket.on('presence:changed', (data) => {
      console.log(`User ${data.userId} is now ${data.status}`);
    });

    this._socket.on('room:user-joined', (data) => {
      console.log(`User ${data.userId} joined room ${data.roomId}`);
    });

    this._socket.on('room:user-left', (data) => {
      console.log(`User ${data.userId} left room ${data.roomId}`);
    });

    this._socket.on('error', (error) => {
      console.error('Error:', error);
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  joinRoom(opts: { roomId: string; userId: string }) {
    this._socket.emit('room:join', opts);
  }

  leaveRoom(opts: { roomId: string; userId: string }) {
    this._socket.emit('room:leave', opts);
  }

  sendMessage(opts: { roomId: string; content: string; userId: string }) {
    this._socket.emit('message:send', opts);
  }

  sendDirectMessage(opts: { receiverId: string; content: string; userId: string }) {
    this._socket.emit('dm:send', opts);
  }

  startTyping(opts: { roomId: string }) {
    this._socket.emit('typing:start', opts);
  }

  stopTyping(opts: { roomId: string }) {
    this._socket.emit('typing:stop', opts);
  }

  disconnect() {
    this._socket.disconnect();
  }
}

// Usage
const chat = new ChatClient({ token: 'your-jwt-token' });

// After 'authenticated' event fires, you can use:
// chat.joinRoom({ roomId: 'room-uuid', userId: 'user-uuid' });
// chat.sendMessage({ roomId: 'room-uuid', content: 'Hello everyone!', userId: 'user-uuid' });
```

### Using `SocketIOClientHelper`

For server-to-server or microservice communication, use the built-in `SocketIOClientHelper`:

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers';

const client = new SocketIOClientHelper({
  identifier: 'chat-service-client',
  host: 'http://localhost:3000',
  options: {
    path: '/io',
    extraHeaders: {
      Authorization: 'Bearer service-token',
    },
  },
  onConnected: () => {
    client.authenticate();
  },
  onAuthenticated: () => {
    console.log('Ready!');

    // Subscribe to events
    client.subscribe({
      event: 'message:new',
      handler: (data) => console.log('New message:', data),
    });

    // Emit events
    client.emit({
      topic: 'message:send',
      data: { roomId: 'general', content: 'Hello from service!', userId: 'service-user' },
    });

    // Join rooms
    client.joinRooms({ rooms: ['room:general'] });
  },
});
```

## 9. Scaling with Redis

Redis scaling is **built-in** and **automatic** when using `SocketIOComponent`. You do not need to set up the Redis adapter manually.

### How It Works

When you bind a `RedisHelper` to `SocketIOBindingKeys.REDIS_CONNECTION`, the `SocketIOServerHelper` automatically:

1. Creates 3 duplicate Redis connections from your helper
2. Sets up `@socket.io/redis-adapter` for cross-instance pub/sub
3. Sets up `@socket.io/redis-emitter` for message broadcasting

```
Process A                     Redis                     Process B
┌─────────────┐           ┌──────────┐           ┌─────────────┐
│ SocketIO     │──pub────► │          │ ◄──pub────│ SocketIO     │
│ ServerHelper │◄──sub──── │  Pub/Sub │ ──sub────►│ ServerHelper │
│              │           │          │           │              │
│ Emitter      │──emit───► │ Streams  │ ◄──emit───│ Emitter      │
└─────────────┘           └──────────┘           └─────────────┘
```

### Multi-Instance Deployment

Run multiple instances behind a load balancer — Redis keeps them in sync:

```bash
# Instance 1
APP_ENV_SERVER_PORT=3001 bun run start

# Instance 2
APP_ENV_SERVER_PORT=3002 bun run start

# Both instances share Socket.IO state via Redis
# Clients on Instance 1 can receive messages from Instance 2
```

All calls to `socketIOHelper.send()` go through the Redis emitter, so messages reach clients regardless of which server instance they're connected to.

### Redis Configuration

The only thing you need is a `RedisHelper` bound to the correct key (already done in the application setup):

```typescript
this.redisHelper = new RedisHelper({
  name: 'chat-redis',
  host: process.env.APP_ENV_REDIS_HOST ?? 'localhost',
  port: +(process.env.APP_ENV_REDIS_PORT ?? 6379),
  password: process.env.APP_ENV_REDIS_PASSWORD,
  autoConnect: false,
});

this.bind<RedisHelper>({
  key: SocketIOBindingKeys.REDIS_CONNECTION,
}).toValue(this.redisHelper);
```

## Summary

| Feature | Implementation |
|---------|---------------|
| Rooms | `SocketIOServerHelper` rooms + database persistence |
| Direct Messages | `socketIOHelper.send({ destination: receiverId })` + database |
| Typing Indicators | Custom socket events with auto-timeout (3s) |
| Presence | `socketIOHelper.send()` broadcast on connect/disconnect |
| History | REST API with cursor-based pagination |
| Authentication | `SocketIOServerHelper` built-in flow (connect → authenticate → authenticated) |
| Scaling | Redis adapter/emitter — automatic via `RedisHelper` binding |
| Runtime | Auto-detected (Node.js or Bun) by `SocketIOComponent` |

## Next Steps

- Add file/image sharing with [Storage Helper](/references/helpers/storage/)
- Add push notifications
- Implement read receipts
- Add message reactions
- Deploy with [Deployment Guide](/best-practices/deployment-strategies)

## See Also

- [Socket.IO Component](/references/components/socket-io/) — Component reference
- [Socket.IO Helper](/references/helpers/socket-io/) — Server + Client helper API
- [Socket.IO Test Example](https://github.com/VENIZIA-AI/ignis/tree/main/examples/socket-io-test) — Working example with automated test client
