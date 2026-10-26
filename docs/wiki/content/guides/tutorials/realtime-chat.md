# Building a Real-Time Chat Application

This tutorial shows you how to build a real-time chat application with rooms, direct messages, typing indicators, and presence using Socket.IO - powered by the `SocketIOComponent` and `SocketIOServerHelper`.

**What You'll Build:**

- Chat rooms (channels)
- Direct messages between users
- Typing indicators
- Online/offline presence
- Message history with pagination

## Prerequisites

- Completed [Building a CRUD API](./building-a-crud-api.md)
- Understanding of [Socket.IO Component](/extensions/components/socket-io/)
- Understanding of [Socket.IO Helper](/extensions/helpers/socket-io/)
- Redis for pub/sub (required by `SocketIOServerHelper`)

## 1. Project Setup

```bash
mkdir chat-api
cd chat-api
bun init -y

# Install dependencies
bun add hono @hono/zod-openapi @venizia/ignis @venizia/ignis-helpers \
  @venizia/ignis-boot winston winston-transport winston-daily-rotate-file
bun add drizzle-orm drizzle-zod pg
bun add -d typescript @types/bun @venizia/dev-configs drizzle-kit @types/pg

# Socket.IO, its Redis adapters, and the Bun engine
bun add socket.io @socket.io/redis-adapter @socket.io/redis-emitter @socket.io/bun-engine
```

> [!NOTE]
> `socket.io`, `@socket.io/redis-adapter` and `@socket.io/redis-emitter` are optional peer dependencies of `@venizia/ignis-helpers`, not dependencies. Install them yourself. For the client side, install `socket.io-client` separately.

## 2. Database Models

Each model is a Drizzle table plus a class built from it with `ModelFactory.defineEntity`. Relations point at tables, keyed by name, and `many` pairs with the `one` of the same name on the other table. See the [Models guide](/guides/core-concepts/persistent/models) for details.

### User Model

```typescript
// src/models/user.model.ts
import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
} from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
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

@model()
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
```

### Room Model

```typescript
// src/models/room.model.ts
import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  many,
  one,
} from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
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

@model()
export class Room extends ModelFactory.defineEntity({
  table: roomTable,
  relations: () => ({
    creator: one(userTable, {
      fields: [roomTable.createdBy],
      references: [userTable.id],
    }),
    // Pairs with the `room` relation on RoomMember
    members: many(roomMemberTable, { relationName: 'room' }),
  }),
}) {}

@model()
export class RoomMember extends ModelFactory.defineEntity({
  table: roomMemberTable,
  relations: () => ({
    room: one(roomTable, {
      fields: [roomMemberTable.roomId],
      references: [roomTable.id],
    }),
    user: one(userTable, {
      fields: [roomMemberTable.userId],
      references: [userTable.id],
    }),
  }),
}) {}

export type TRoom = TEntityObject<typeof Room>;
export type TRoomMember = TEntityObject<typeof RoomMember>;
```

### Message Model

```typescript
// src/models/message.model.ts
import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
  one,
} from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
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

@model()
export class Message extends ModelFactory.defineEntity({
  table: messageTable,
  relations: () => ({
    room: one(roomTable, {
      fields: [messageTable.roomId],
      references: [roomTable.id],
    }),
    sender: one(userTable, {
      fields: [messageTable.senderId],
      references: [userTable.id],
    }),
  }),
}) {}

@model()
export class DirectMessage extends ModelFactory.defineEntity({
  table: directMessageTable,
  relations: () => ({
    sender: one(userTable, {
      fields: [directMessageTable.senderId],
      references: [userTable.id],
    }),
    receiver: one(userTable, {
      fields: [directMessageTable.receiverId],
      references: [userTable.id],
    }),
  }),
}) {}

export type TMessage = TEntityObject<typeof Message>;
export type TDirectMessage = TEntityObject<typeof DirectMessage>;
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
  ValueOrPromise,
} from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BaseDataSource<IDataSourceConfigs> {
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
    const schema = Object.keys(this.getSchema());

    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schema.length,
      schema,
    );

    // The client must land on this.client - a local would leave beginTransaction() with nothing
    // to resolve a driver from, and it would throw `No driver and no client`. NodePostgresDriver
    // named in @datasource above is what wires the driver and Drizzle connector from it.
    this.client = new Pool(this.settings);
  }

  // Abstract on the Postgres tier - every Postgres datasource implements it.
  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

## 4. Repositories

### User Repository

```typescript
// src/repositories/user.repository.ts
import { User, type userTable } from '@/models/user.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof userTable> {}
```

### Room Repository

```typescript
// src/repositories/room.repository.ts
import { Room, RoomMember, type roomTable, type roomMemberTable } from '@/models/room.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: RoomMember, dataSource: PostgresDataSource })
export class RoomMemberRepository extends DefaultCRUDRepository<typeof roomMemberTable> {}

@repository({ model: Room, dataSource: PostgresDataSource })
export class RoomRepository extends DefaultCRUDRepository<typeof roomTable> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,

    // From 2nd parameter, inject additional dependencies
    @inject({ key: 'repositories.RoomMemberRepository' })
    private _memberRepository: RoomMemberRepository,
  ) {
    super(dataSource);
  }

  async findByUser(opts: { userId: string }) {
    const memberships = await this._memberRepository.find({
      filter: { where: { userId: opts.userId }, include: [{ relation: 'room' }] },
    });
    return memberships.map(m => m.room);
  }

  async isMember(opts: { roomId: string; userId: string }): Promise<boolean> {
    const member = await this._memberRepository.findOne({
      filter: { where: { roomId: opts.roomId, userId: opts.userId } },
    });
    return !!member;
  }

  async addMember(opts: { roomId: string; userId: string; role?: string }) {
    const { data } = await this._memberRepository.create({
      data: {
        roomId: opts.roomId,
        userId: opts.userId,
        role: opts.role ?? 'member',
      },
    });
    return data;
  }

  async removeMember(opts: { roomId: string; userId: string }) {
    return this._memberRepository.deleteAll({
      where: { roomId: opts.roomId, userId: opts.userId },
    });
  }

  async getMember(opts: { roomId: string; userId: string }) {
    return this._memberRepository.findOne({
      filter: { where: { roomId: opts.roomId, userId: opts.userId } },
    });
  }

  async getMembers(opts: { roomId: string }) {
    return this._memberRepository.find({
      filter: { where: { roomId: opts.roomId }, include: [{ relation: 'user' }] },
    });
  }
}
```

### Message Repository

```typescript
// src/repositories/message.repository.ts
import { Message, DirectMessage, type messageTable, type directMessageTable } from '@/models/message.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { inject, repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

@repository({ model: DirectMessage, dataSource: PostgresDataSource })
export class DirectMessageRepository extends DefaultCRUDRepository<typeof directMessageTable> {}

@repository({ model: Message, dataSource: PostgresDataSource })
export class MessageRepository extends DefaultCRUDRepository<typeof messageTable> {
  constructor(
    // First parameter MUST be DataSource injection
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,

    // From 2nd parameter, inject additional dependencies
    @inject({ key: 'repositories.DirectMessageRepository' })
    private _directMessageRepository: DirectMessageRepository,
  ) {
    super(dataSource);
  }

  async createDirectMessage(opts: { senderId: string; receiverId: string; content: string }) {
    const { data } = await this._directMessageRepository.create({ data: opts });
    return data;
  }

  async findDirectMessages(opts: {
    userId1: string;
    userId2: string;
    limit?: number;
    before?: string;
  }) {
    return this._directMessageRepository.find({
      filter: {
        where: {
          or: [
            { senderId: opts.userId1, receiverId: opts.userId2 },
            { senderId: opts.userId2, receiverId: opts.userId1 },
          ],
        },
        order: ['createdAt DESC'],
        limit: opts.limit ?? 50,
      },
    });
  }

  async findConversations(opts: { userId: string }) {
    // Get unique conversation partners
    const sent = await this._directMessageRepository.find({
      filter: { where: { senderId: opts.userId }, include: [{ relation: 'receiver' }] },
    });
    const received = await this._directMessageRepository.find({
      filter: { where: { receiverId: opts.userId }, include: [{ relation: 'sender' }] },
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
  service,
  SocketIOBindingKeys,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';
import { getError } from '@venizia/ignis-helpers';
import { ISocketIOClient, SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';
import { Socket } from 'socket.io';
import { MessageRepository } from '../repositories/message.repository';
import { RoomRepository } from '../repositories/room.repository';
import { UserRepository } from '../repositories/user.repository';

@service()
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
    private _messageRepository: MessageRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: 'RoomRepository',
      }),
    })
    private _roomRepository: RoomRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: 'UserRepository',
      }),
    })
    private _userRepository: UserRepository,
  ) {
    super({ scope: ChatService.name });
  }

  // ---------------------------------------------------------------------------
  // SocketIOServerHelper - lazy getter (bound after server starts via post-start hook)
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
  // Socket event handlers - called from clientConnectedFn after authentication
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
    const { data: room } = await this._roomRepository.create({ data: opts });

    // Add creator as admin
    await this._roomRepository.addMember({ roomId: room.id, userId: opts.createdBy, role: 'admin' });

    return room;
  }

  async joinRoom(opts: { roomId: string; userId: string }) {
    const room = await this._roomRepository.findById({ id: opts.roomId });
    if (!room) {
      throw getError({ statusCode: 404, message: 'Room not found' });
    }

    if (room.isPrivate) {
      const isMember = await this._roomRepository.isMember({ roomId: opts.roomId, userId: opts.userId });
      if (!isMember) {
        throw getError({ statusCode: 403, message: 'Cannot join private room' });
      }
    } else {
      await this._roomRepository.addMember({ roomId: opts.roomId, userId: opts.userId, role: 'member' });
    }

    return room;
  }

  async leaveRoom(opts: { roomId: string; userId: string }) {
    await this._roomRepository.removeMember({ roomId: opts.roomId, userId: opts.userId });
  }

  async getUserRooms(opts: { userId: string }) {
    return this._roomRepository.findByUser({ userId: opts.userId });
  }

  // ---------------------------------------------------------------------------
  // Message operations
  // ---------------------------------------------------------------------------
  async sendMessage(opts: { roomId: string; senderId: string; content: string; type?: string }) {
    const isMember = await this._roomRepository.isMember({ roomId: opts.roomId, userId: opts.senderId });
    if (!isMember) {
      throw getError({ statusCode: 403, message: 'Not a member of this room' });
    }

    const { data: message } = await this._messageRepository.create({
      data: {
        roomId: opts.roomId,
        senderId: opts.senderId,
        content: opts.content,
        type: opts.type ?? 'text',
      },
    });

    const sender = await this._userRepository.findById({ id: opts.senderId });

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
    const message = await this._messageRepository.findById({ id: opts.messageId });

    if (!message) {
      throw getError({ statusCode: 404, message: 'Message not found' });
    }

    if (message.senderId !== opts.userId) {
      throw getError({ statusCode: 403, message: 'Cannot edit others messages' });
    }

    return this._messageRepository.updateById({
      id: opts.messageId,
      data: {
        content: opts.content,
        editedAt: new Date(),
      },
    });
  }

  async deleteMessage(opts: { messageId: string; userId: string }) {
    const message = await this._messageRepository.findById({ id: opts.messageId });

    if (!message) {
      throw getError({ statusCode: 404, message: 'Message not found' });
    }

    if (message.senderId !== opts.userId) {
      const member = await this._roomRepository.getMember({ roomId: message.roomId, userId: opts.userId });
      if (!member || member.role !== 'admin') {
        throw getError({ statusCode: 403, message: 'Cannot delete this message' });
      }
    }

    return this._messageRepository.updateById({
      id: opts.messageId,
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getMessages(opts: { roomId: string; limit?: number; before?: string }) {
    const where: any = {
      roomId: opts.roomId,
      deletedAt: null,
    };

    if (opts.before) {
      const beforeMessage = await this._messageRepository.findById({ id: opts.before });
      if (beforeMessage) {
        where.createdAt = { lt: beforeMessage.createdAt };
      }
    }

    return this._messageRepository.find({
      filter: {
        where,
        order: ['createdAt DESC'],
        limit: opts.limit ?? 50,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Direct message operations
  // ---------------------------------------------------------------------------
  async sendDirectMessage(opts: { senderId: string; receiverId: string; content: string }) {
    return this._messageRepository.createDirectMessage(opts);
  }

  async getDirectMessages(opts: { userId1: string; userId2: string; limit?: number; before?: string }) {
    return this._messageRepository.findDirectMessages({
      userId1: opts.userId1,
      userId2: opts.userId2,
      limit: opts.limit,
      before: opts.before,
    });
  }

  async getConversations(opts: { userId: string }) {
    return this._messageRepository.findConversations({ userId: opts.userId });
  }

  // ---------------------------------------------------------------------------
  // Presence operations
  // ---------------------------------------------------------------------------
  async setOnline(opts: { userId: string }) {
    await this._userRepository.updateById({
      id: opts.userId,
      data: {
        isOnline: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async setOffline(opts: { userId: string }) {
    await this._userRepository.updateById({
      id: opts.userId,
      data: {
        isOnline: false,
        lastSeenAt: new Date(),
      },
    });
  }

  async getOnlineUsers(opts: { roomId: string }) {
    const members = await this._roomRepository.getMembers({ roomId: opts.roomId });
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
> **Lazy getter pattern**: `SocketIOServerHelper` is bound via a post-start hook, so it's not available during DI construction. The `private get socketIOHelper()` getter resolves it lazily on first access. See [Send a message from a service](/extensions/components/socket-io/#send-a-message-from-a-service) for details.

## 6. Application Setup

The application binds Redis, authentication, and the client connected handler via `SocketIOBindingKeys`, then registers `SocketIOComponent`. No manual Socket.IO server creation needed. Repositories, `ChatService` and `ChatController` carry decorators, and `artifacts: AutoArtifacts` registers them - `preConfigure()` names none of them.

```typescript
// src/application.ts
import {
  BaseApplication,
  BindingKeys,
  BindingNamespaces,
  IApplicationConfigs,
  IApplicationInfo,
  SocketIOBindingKeys,
  SocketIOComponent,
  ValueOrPromise,
} from '@venizia/ignis';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { applicationEnvironment, RedisSingleHelper } from '@venizia/ignis-helpers';
// Socket.IO symbols are sub-path only - the root barrel does not re-export them.
import {
  type ISocketIOServerBaseOptions,
  SocketIOServerHelper,
} from '@venizia/ignis-helpers/socket-io';
import { ChatService } from './services/chat.service';

export const appConfigs: IApplicationConfigs = {
  host: process.env.HOST ?? '0.0.0.0',
  port: +(process.env.PORT ?? 3000),
  path: { base: '/api', isStrict: true },
  // Finds the repositories, ChatService and ChatController
  artifacts: AutoArtifacts,
};

export class ChatApp extends BaseApplication {
  private redisHelper: RedisSingleHelper;

  getAppInfo(): IApplicationInfo {
    // description is required - ApiReferenceComponent reads it for the OpenAPI document.
    return {
      name: 'chat-api',
      version: '1.0.0',
      description: 'Rooms, direct messages and presence over Socket.IO',
    };
  }

  staticConfigure() {}

  preConfigure(): ValueOrPromise<void> {
    // Repositories, ChatService and ChatController need no call here: AutoArtifacts registers them.

    // Setup Socket.IO
    this.setupSocketIO();
  }

  postConfigure(): ValueOrPromise<void> {}

  setupMiddlewares(): ValueOrPromise<void> {}

  // ---------------------------------------------------------------------------
  private setupSocketIO() {
    // 1. Redis connection - SocketIOServerHelper creates 3 duplicate connections
    //    for adapter (pub/sub) and emitter automatically
    this.redisHelper = new RedisSingleHelper({
      name: 'chat-redis',
      host: process.env.APP_ENV_REDIS_HOST ?? 'localhost',
      port: +(process.env.APP_ENV_REDIS_PORT ?? 6379),
      password: process.env.APP_ENV_REDIS_PASSWORD ?? '',
      autoConnect: false,
    });

    this.bind<RedisSingleHelper>({
      key: SocketIOBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // 2. Authentication handler - called when a client emits 'authenticate'
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

    // 3. Client connected handler - called AFTER successful authentication
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

    // 4. (Optional) Custom server options - override defaults
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

    // 5. Register the component - that's it!
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
  └── setupSocketIO()
        ├── Bind RedisSingleHelper → REDIS_CONNECTION
        ├── Bind authenticateFn → AUTHENTICATE_HANDLER
        ├── Bind clientConnectedFn → CLIENT_CONNECTED_HANDLER
        ├── Bind server options → SERVER_OPTIONS
        └── this.component(SocketIOComponent)

initialize()
  └── SocketIOComponent.binding()
        ├── resolveBindings() - reads all bound values
        ├── RuntimeModules.detect() - auto-detect Node.js or Bun
        └── registerPostStartHook('socket-io-initialize')

start()
  ├── startBunModule() / startNodeModule() - server starts
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
// src/controllers/chat/chat.controller.ts
import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  controller,
  inject,
  jsonContent,
  jsonResponse,
  TRouteContext,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { ChatService } from '../services/chat.service';

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isPrivate: z.boolean().default(false),
});
type TCreateRoom = z.infer<typeof CreateRoomSchema>;

const PaginationQuerySchema = z.object({
  limit: z.string().optional(),
  before: z.string().optional(),
});
type TPaginationQuery = z.infer<typeof PaginationQuerySchema>;

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
    request: {
      body: jsonContent({
        description: 'Room data',
        schema: CreateRoomSchema,
      }),
    },
    responses: jsonResponse({
      description: 'Created room',
      schema: z.any(),
    }),
  },
  GET_MESSAGES: {
    method: HTTP.Methods.GET,
    path: '/rooms/{roomId}/messages',
    request: {
      params: z.object({ roomId: z.string() }),
      query: PaginationQuerySchema,
    },
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
    request: {
      params: z.object({ userId: z.string() }),
      query: PaginationQuerySchema,
    },
    responses: jsonResponse({
      description: 'Direct messages',
      schema: z.array(z.any()),
    }),
  },
} as const;

@controller({ path: '/chat' })
export class ChatController extends BaseRestController {
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
      handler: async (context: TRouteContext) => {
        const userId = context.get('userId');
        const rooms = await this._chatService.getUserRooms({ userId });
        return context.json(rooms, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // POST /chat/rooms
    this.bindRoute({ configs: ChatRoutes.CREATE_ROOM }).to({
      handler: async (context: TRouteContext) => {
        const userId = context.get('userId');
        const data = context.req.valid<TCreateRoom>('json');
        const room = await this._chatService.createRoom({ ...data, createdBy: userId });
        return context.json(room, HTTP.ResultCodes.RS_2.Created);
      },
    });

    // GET /chat/rooms/{roomId}/messages
    this.bindRoute({ configs: ChatRoutes.GET_MESSAGES }).to({
      handler: async (context: TRouteContext) => {
        const { roomId } = context.req.valid<{ roomId: string }>('param');
        const { limit, before } = context.req.valid<TPaginationQuery>('query');

        const messages = await this._chatService.getMessages({
          roomId,
          limit: limit ? parseInt(limit) : undefined,
          before: before ?? undefined,
        });

        return context.json(messages, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // GET /chat/conversations
    this.bindRoute({ configs: ChatRoutes.GET_CONVERSATIONS }).to({
      handler: async (context: TRouteContext) => {
        const userId = context.get('userId');
        const conversations = await this._chatService.getConversations({ userId });
        return context.json(conversations, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // GET /chat/dm/{userId}
    this.bindRoute({ configs: ChatRoutes.GET_DIRECT_MESSAGES }).to({
      handler: async (context: TRouteContext) => {
        const currentUserId = context.get('userId');
        const { userId: otherUserId } = context.req.valid<{ userId: string }>('param');
        const { limit, before } = context.req.valid<TPaginationQuery>('query');

        const messages = await this._chatService.getDirectMessages({
          userId1: currentUserId,
          userId2: otherUserId,
          limit: limit ? parseInt(limit) : undefined,
          before: before ?? undefined,
        });

        return context.json(messages, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

## 8. Client Usage

Clients must follow the `SocketIOServerHelper` authentication flow: **connect** → **emit `authenticate`** → **receive `authenticated`** - then they're ready to send and receive events.

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
  // Connection lifecycle - follows SocketIOServerHelper's auth flow
  // ---------------------------------------------------------------------------
  private setupLifecycle() {
    // Step 1: Connected - now send authenticate event
    this._socket.on('connect', () => {
      console.log('Connected | id:', this._socket.id);
      this._socket.emit('authenticate');
    });

    // Step 2: Authenticated - ready to use
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
      // Server is checking we're alive - no action needed
    });

    this._socket.on('disconnect', (reason: string) => {
      console.log('Disconnected:', reason);
      this._authenticated = false;
    });
  }

  // ---------------------------------------------------------------------------
  // Custom event handlers - registered after authentication
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
import { SocketIOClientHelper } from '@venizia/ignis-helpers/socket-io';

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

When you bind a `RedisSingleHelper` (or any `AbstractRedisHelper` subclass) to `SocketIOBindingKeys.REDIS_CONNECTION`, the `SocketIOServerHelper` automatically:

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

Run multiple instances behind a load balancer - Redis keeps them in sync:

```bash
# Instance 1
APP_ENV_SERVER_PORT=3001 bun run server:dev

# Instance 2
APP_ENV_SERVER_PORT=3002 bun run server:dev

# Both instances share Socket.IO state via Redis
# Clients on Instance 1 can receive messages from Instance 2
```

All calls to `socketIOHelper.send()` go through the Redis emitter, so messages reach clients regardless of which server instance they're connected to.

### Redis Configuration

The only thing you need is a `RedisSingleHelper` bound to the correct key (already done in the application setup):

```typescript
this.redisHelper = new RedisSingleHelper({
  name: 'chat-redis',
  host: process.env.APP_ENV_REDIS_HOST ?? 'localhost',
  port: +(process.env.APP_ENV_REDIS_PORT ?? 6379),
  password: process.env.APP_ENV_REDIS_PASSWORD ?? '',
  autoConnect: false,
});

this.bind<RedisSingleHelper>({
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
| Scaling | Redis adapter/emitter - automatic via `RedisSingleHelper` binding |
| Runtime | Auto-detected (Node.js or Bun) by `SocketIOComponent` |

## Next Steps

- Add file/image sharing with [Storage Helper](/extensions/helpers/storage/)
- Add push notifications
- Implement read receipts
- Add message reactions
- Deploy with [Deployment Guide](/best-practices/deployment-strategies)

## See Also

- [Socket.IO Component](/extensions/components/socket-io/) - Component reference
- [Socket.IO Helper](/extensions/helpers/socket-io/) - Server + Client helper API
- [Socket.IO Test Example](https://github.com/VENIZIA-AI/ignis/tree/main/examples/socket-io-test) - Working example with a boot-and-call smoke test
