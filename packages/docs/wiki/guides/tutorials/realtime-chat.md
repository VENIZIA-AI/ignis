# Building a Real-Time Chat Application

This tutorial shows you how to build a real-time chat application with rooms, direct messages, typing indicators, and presence using Socket.IO.

**⏱️ Time to Complete:** ~75 minutes

## What You'll Build

- Chat rooms (channels)
- Direct messages between users
- Typing indicators
- Online/offline presence
- Message history with pagination

## Prerequisites

- Completed [Building a CRUD API](./building-a-crud-api.md)
- Understanding of [Socket.IO Component](/references/components/socket-io)
- Redis for pub/sub (optional but recommended for scaling)

## 1. Project Setup

```bash
mkdir chat-api
cd chat-api
bun init -y

# Install dependencies
bun add hono @hono/zod-openapi @venizia/ignis dotenv-flow
bun add drizzle-orm drizzle-zod pg socket.io
bun add -d typescript @types/bun @venizia/dev-configs drizzle-kit @types/pg
```

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

## 5. Socket.IO Events

Define your event types:

```typescript
// src/types/socket.types.ts

// Client -> Server events
export interface ClientToServerEvents {
  // Rooms
  'room:join': (roomId: string) => void;
  'room:leave': (roomId: string) => void;

  // Messages
  'message:send': (data: { roomId: string; content: string; type?: string }) => void;
  'message:edit': (data: { messageId: string; content: string }) => void;
  'message:delete': (data: { messageId: string }) => void;

  // Direct messages
  'dm:send': (data: { receiverId: string; content: string }) => void;

  // Typing
  'typing:start': (roomId: string) => void;
  'typing:stop': (roomId: string) => void;

  // Presence
  'presence:update': (status: 'online' | 'away' | 'busy') => void;
}

// Server -> Client events
export interface ServerToClientEvents {
  // Messages
  'message:new': (message: Message) => void;
  'message:edited': (message: Message) => void;
  'message:deleted': (data: { messageId: string; roomId: string }) => void;

  // Direct messages
  'dm:new': (message: DirectMessage) => void;

  // Typing
  'typing:update': (data: { roomId: string; userId: string; isTyping: boolean }) => void;

  // Presence
  'presence:changed': (data: { userId: string; status: string; lastSeenAt?: Date }) => void;

  // Room
  'room:user-joined': (data: { roomId: string; user: User }) => void;
  'room:user-left': (data: { roomId: string; userId: string }) => void;

  // Errors
  'error': (error: { code: string; message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  username: string;
}
```

## 6. Chat Service

```typescript
// src/services/chat.service.ts
import { injectable, inject } from '@venizia/ignis';
import { BaseService } from '@venizia/ignis';
import { MessageRepository } from '../repositories/message.repository';
import { RoomRepository } from '../repositories/room.repository';
import { UserRepository } from '../repositories/user.repository';
import { getError } from '@venizia/ignis-helpers';

@injectable()
export class ChatService extends BaseService {
  constructor(
    @inject('repositories.MessageRepository')
    private _messageRepo: MessageRepository,
    @inject('repositories.RoomRepository')
    private _roomRepo: RoomRepository,
    @inject('repositories.UserRepository')
    private _userRepo: UserRepository,
  ) {
    super({ scope: ChatService.name });
  }

  // Room operations
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

    // Check if private room requires invitation
    if (room.isPrivate) {
      const isMember = await this._roomRepo.isMember({ roomId: opts.roomId, userId: opts.userId });
      if (!isMember) {
        throw getError({ statusCode: 403, message: 'Cannot join private room' });
      }
    } else {
      // Auto-join public rooms
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

  // Message operations
  async sendMessage(opts: { roomId: string; senderId: string; content: string; type?: string }) {
    // Verify user is member of room
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

    // Get sender info for the response
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
      // Check if user is room admin
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
      // Cursor-based pagination
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

  // Direct message operations
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

  // Presence operations
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
}
```

## 7. Socket.IO Handler

```typescript
// src/socket/chat.handler.ts
import { Server, Socket } from 'socket.io';
import { ChatService } from '../services/chat.service';
import { RedisHelper, LoggerFactory } from '@venizia/ignis-helpers';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.types';

type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class ChatSocketHandler {
  private _logger = LoggerFactory.getLogger(['ChatSocketHandler']);
  private _typingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private _io: ChatServer,
    private _chatService: ChatService,
  ) {}

  setupHandlers(socket: ChatSocket) {
    const userId = socket.data.userId;
    const username = socket.data.username;

    this._logger.info('User connected', { userId, username, socketId: socket.id });

    // Set user online
    this._chatService.setOnline({ userId });
    this.broadcastPresence({ userId, status: 'online' });

    // Room handlers
    socket.on('room:join', async (roomId) => {
      try {
        await this._chatService.joinRoom({ roomId, userId });
        socket.join(`room:${roomId}`);

        // Notify room members
        socket.to(`room:${roomId}`).emit('room:user-joined', {
          roomId,
          user: { id: userId, username },
        });

        this._logger.info('User joined room', { userId, roomId });
      } catch (error) {
        socket.emit('error', { code: 'JOIN_FAILED', message: error.message });
      }
    });

    socket.on('room:leave', async (roomId) => {
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('room:user-left', { roomId, userId });
      this._logger.info('User left room', { userId, roomId });
    });

    // Message handlers
    socket.on('message:send', async (data) => {
      try {
        const message = await this._chatService.sendMessage({
          roomId: data.roomId,
          senderId: userId,
          content: data.content,
          type: data.type,
        });

        // Broadcast to room
        this._io.to(`room:${data.roomId}`).emit('message:new', message);

        // Clear typing indicator
        this.clearTyping({ socket, roomId: data.roomId });
      } catch (error) {
        socket.emit('error', { code: 'SEND_FAILED', message: error.message });
      }
    });

    socket.on('message:edit', async (data) => {
      try {
        const message = await this._chatService.editMessage({
          messageId: data.messageId,
          userId,
          content: data.content,
        });
        this._io.to(`room:${message.roomId}`).emit('message:edited', message);
      } catch (error) {
        socket.emit('error', { code: 'EDIT_FAILED', message: error.message });
      }
    });

    socket.on('message:delete', async (data) => {
      try {
        const message = await this._chatService.deleteMessage({ messageId: data.messageId, userId });
        this._io.to(`room:${message.roomId}`).emit('message:deleted', {
          messageId: data.messageId,
          roomId: message.roomId,
        });
      } catch (error) {
        socket.emit('error', { code: 'DELETE_FAILED', message: error.message });
      }
    });

    // Direct message handlers
    socket.on('dm:send', async (data) => {
      try {
        const message = await this._chatService.sendDirectMessage({
          senderId: userId,
          receiverId: data.receiverId,
          content: data.content,
        });

        // Send to receiver (if online)
        this._io.to(`user:${data.receiverId}`).emit('dm:new', message);

        // Send back to sender
        socket.emit('dm:new', message);
      } catch (error) {
        socket.emit('error', { code: 'DM_FAILED', message: error.message });
      }
    });

    // Typing handlers
    socket.on('typing:start', (roomId) => {
      this.handleTyping({ socket, roomId, isTyping: true });
    });

    socket.on('typing:stop', (roomId) => {
      this.handleTyping({ socket, roomId, isTyping: false });
    });

    // Presence handlers
    socket.on('presence:update', (status) => {
      this.broadcastPresence({ userId, status });
    });

    // Disconnect
    socket.on('disconnect', () => {
      this._logger.info('User disconnected', { userId, socketId: socket.id });
      this._chatService.setOffline({ userId });
      this.broadcastPresence({ userId, status: 'offline' });
    });

    // Join user's personal room for DMs
    socket.join(`user:${userId}`);
  }

  private handleTyping(opts: { socket: ChatSocket; roomId: string; isTyping: boolean }) {
    const userId = opts.socket.data.userId;
    const key = `${opts.roomId}:${userId}`;

    // Clear existing timeout
    const existingTimeout = this._typingTimeouts.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Broadcast typing status
    opts.socket.to(`room:${opts.roomId}`).emit('typing:update', {
      roomId: opts.roomId,
      userId,
      isTyping: opts.isTyping,
    });

    if (opts.isTyping) {
      // Auto-stop typing after 3 seconds
      const timeout = setTimeout(() => {
        opts.socket.to(`room:${opts.roomId}`).emit('typing:update', {
          roomId: opts.roomId,
          userId,
          isTyping: false,
        });
        this._typingTimeouts.delete(key);
      }, 3000);

      this._typingTimeouts.set(key, timeout);
    }
  }

  private clearTyping(opts: { socket: ChatSocket; roomId: string }) {
    const userId = opts.socket.data.userId;
    const key = `${opts.roomId}:${userId}`;

    const timeout = this._typingTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this._typingTimeouts.delete(key);
    }

    opts.socket.to(`room:${opts.roomId}`).emit('typing:update', {
      roomId: opts.roomId,
      userId,
      isTyping: false,
    });
  }

  private broadcastPresence(opts: { userId: string; status: string }) {
    this._io.emit('presence:changed', {
      userId: opts.userId,
      status: opts.status,
      lastSeenAt: new Date(),
    });
  }
}
```

## 8. Application Setup

```typescript
// src/application.ts
import { BaseApplication, IApplicationInfo, SocketIOComponent } from '@venizia/ignis';
import { EnvHelper } from '@venizia/ignis-helpers';
import { Server } from 'socket.io';
import { ChatSocketHandler } from './socket/chat.handler';
import { ChatService } from './services/chat.service';
import { verifyToken } from './middleware/auth';

export class ChatApp extends BaseApplication {
  private _io: Server;
  private _chatHandler: ChatSocketHandler;

  getAppInfo(): IApplicationInfo {
    return { name: 'chat-api', version: '1.0.0' };
  }

  staticConfigure() {}

  preConfigure() {
    // Register services and repositories
    this.service(ChatService);
    // ... other bindings

    // Add Socket.IO component
    this.component(SocketIOComponent);
  }

  postConfigure() {
    this.setupSocketIO();
  }

  setupMiddlewares() {}

  private setupSocketIO() {
    const httpServer = this.getHttpServer();

    this._io = new Server(httpServer, {
      cors: {
        origin: EnvHelper.get('APP_ENV_CORS_ORIGIN') ?? '*',
        methods: ['GET', 'POST'],
      },
    });

    // Authentication middleware
    this._io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const user = await verifyToken(token);
        socket.data.userId = user.id;
        socket.data.username = user.username;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    // Get chat service from container
    const chatService = this.container.get<ChatService>('services.ChatService');
    this._chatHandler = new ChatSocketHandler(this._io, chatService);

    // Handle connections
    this._io.on('connection', (socket) => {
      this._chatHandler.setupHandlers(socket);
    });
  }
}
```

## 9. REST API for Chat History

```typescript
// src/controllers/chat.controller.ts
import { z } from '@hono/zod-openapi';
import {
  BaseController,
  controller,
  get,
  post,
  inject,
  HTTP,
  jsonContent,
  TRouteContext,
} from '@venizia/ignis';
import { ChatService } from '../services/chat.service';

const ChatRoutes = {
  GET_ROOMS: {
    method: HTTP.Methods.GET,
    path: '/rooms',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'User rooms',
        schema: z.array(z.any()),
      }),
    },
  },
  CREATE_ROOM: {
    method: HTTP.Methods.POST,
    path: '/rooms',
    request: {
      body: jsonContent({
        schema: z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          isPrivate: z.boolean().default(false),
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Created]: jsonContent({
        description: 'Created room',
        schema: z.any(),
      }),
    },
  },
  GET_MESSAGES: {
    method: HTTP.Methods.GET,
    path: '/rooms/:roomId/messages',
    request: {
      params: z.object({ roomId: z.string().uuid() }),
      query: z.object({
        limit: z.string().optional(),
        before: z.string().optional(),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Room messages',
        schema: z.array(z.any()),
      }),
    },
  },
  GET_CONVERSATIONS: {
    method: HTTP.Methods.GET,
    path: '/conversations',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'User conversations',
        schema: z.array(z.any()),
      }),
    },
  },
  GET_DIRECT_MESSAGES: {
    method: HTTP.Methods.GET,
    path: '/dm/:userId',
    request: {
      params: z.object({ userId: z.string().uuid() }),
      query: z.object({
        limit: z.string().optional(),
        before: z.string().optional(),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        description: 'Direct messages',
        schema: z.array(z.any()),
      }),
    },
  },
} as const;

type ChatRoutes = typeof ChatRoutes;

@controller({ path: '/chat' })
export class ChatController extends BaseController {
  constructor(
    @inject('services.ChatService')
    private _chatService: ChatService,
  ) {
    super({ scope: ChatController.name, path: '/chat' });
  }

  override binding() {}

  @get({ configs: ChatRoutes.GET_ROOMS })
  async getRooms(c: TRouteContext) {
    const userId = c.get('userId');
    const rooms = await this._chatService.getUserRooms({ userId });
    return c.json(rooms);
  }

  @post({ configs: ChatRoutes.CREATE_ROOM })
  async createRoom(c: TRouteContext) {
    const userId = c.get('userId');
    const data = c.req.valid<{ name: string; description?: string; isPrivate: boolean }>('json');

    const room = await this._chatService.createRoom({
      ...data,
      createdBy: userId,
    });

    return c.json(room, HTTP.ResultCodes.RS_2.Created);
  }

  @get({ configs: ChatRoutes.GET_MESSAGES })
  async getMessages(c: TRouteContext) {
    const { roomId } = c.req.valid<{ roomId: string }>('param');
    const { limit, before } = c.req.valid<{ limit?: string; before?: string }>('query');

    const messages = await this._chatService.getMessages({
      roomId,
      limit: limit ? parseInt(limit) : undefined,
      before,
    });

    return c.json(messages);
  }

  @get({ configs: ChatRoutes.GET_CONVERSATIONS })
  async getConversations(c: TRouteContext) {
    const userId = c.get('userId');
    const conversations = await this._chatService.getConversations({ userId });
    return c.json(conversations);
  }

  @get({ configs: ChatRoutes.GET_DIRECT_MESSAGES })
  async getDirectMessages(c: TRouteContext) {
    const currentUserId = c.get('userId');
    const { userId: otherUserId } = c.req.valid<{ userId: string }>('param');
    const { limit, before } = c.req.valid<{ limit?: string; before?: string }>('query');

    const messages = await this._chatService.getDirectMessages({
      userId1: currentUserId,
      userId2: otherUserId,
      limit: limit ? parseInt(limit) : undefined,
      before,
    });

    return c.json(messages);
  }
}
```

## 10. Client Usage

### JavaScript Client Example

```typescript
// client/chat-client.ts
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  content: string;
  senderId: string;
  sender: { username: string; avatar?: string };
  createdAt: string;
}

class ChatClient {
  private _socket: Socket;

  constructor(opts: { serverUrl: string; token: string }) {
    this._socket = io(opts.serverUrl, {
      auth: { token: opts.token },
    });

    this.setupListeners();
  }

  private setupListeners() {
    this._socket.on('connect', () => {
      console.log('Connected to chat server');
    });

    this._socket.on('message:new', (message: Message) => {
      console.log('New message:', message);
      // Update UI
    });

    this._socket.on('typing:update', (data) => {
      console.log(`User ${data.userId} is ${data.isTyping ? 'typing' : 'stopped typing'}`);
      // Show/hide typing indicator
    });

    this._socket.on('presence:changed', (data) => {
      console.log(`User ${data.userId} is now ${data.status}`);
      // Update online status
    });

    this._socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  joinRoom(opts: { roomId: string }) {
    this._socket.emit('room:join', opts.roomId);
  }

  leaveRoom(opts: { roomId: string }) {
    this._socket.emit('room:leave', opts.roomId);
  }

  sendMessage(opts: { roomId: string; content: string }) {
    this._socket.emit('message:send', { roomId: opts.roomId, content: opts.content });
  }

  sendDirectMessage(opts: { receiverId: string; content: string }) {
    this._socket.emit('dm:send', { receiverId: opts.receiverId, content: opts.content });
  }

  startTyping(opts: { roomId: string }) {
    this._socket.emit('typing:start', opts.roomId);
  }

  stopTyping(opts: { roomId: string }) {
    this._socket.emit('typing:stop', opts.roomId);
  }

  disconnect() {
    this._socket.disconnect();
  }
}

// Usage
const chat = new ChatClient({ serverUrl: 'http://localhost:3000', token: 'your-jwt-token' });

chat.joinRoom({ roomId: 'room-uuid' });
chat.sendMessage({ roomId: 'room-uuid', content: 'Hello everyone!' });
```

## 11. Scaling with Redis

For production, use Redis for Socket.IO adapter:

```typescript
// src/application.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { EnvHelper } from '@venizia/ignis-helpers';

private async setupSocketIO() {
  const pubClient = createClient({ url: EnvHelper.get('APP_ENV_REDIS_URL') });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  this._io.adapter(createAdapter(pubClient, subClient));

  // ... rest of setup
}
```

## Summary

| Feature | Implementation |
|---------|---------------|
| Rooms | Socket.IO rooms + database |
| Direct Messages | Personal rooms + database |
| Typing Indicators | Socket events with auto-timeout |
| Presence | Online status tracking |
| History | REST API with pagination |
| Scaling | Redis adapter for pub/sub |

## Next Steps

- Add file/image sharing with [Storage Helper](../../references/helpers/storage.md)
- Add push notifications
- Implement read receipts
- Add message reactions
- Deploy with [Deployment Guide](../../best-practices/deployment-strategies.md)
