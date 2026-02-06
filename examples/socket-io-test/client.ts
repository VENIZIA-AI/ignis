/**
 * Socket.IO Test Client — Automated Simulation
 *
 * Run with: bun client.ts
 *
 * Simulates all test cases:
 * 1. Connection & authentication flow
 * 2. Echo (send/receive)
 * 3. Join room (via socket event + REST)
 * 4. Leave room (via socket event + REST)
 * 5. Send message to specific client
 * 6. Send message to room
 * 7. Broadcast message
 * 8. Get connected clients (via socket event + REST)
 * 9. Get client rooms (REST)
 * 10. Health check (REST)
 */

import { io, Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const SOCKET_PATH = '/io';
const REST_BASE = `${SERVER_URL}/api/socket`;

const SEPARATOR = '─'.repeat(70);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(tag: string, message: string) {
  console.log(`  [${tag}] ${message}`);
}

function header(title: string) {
  console.log(`\n${SEPARATOR}`);
  console.log(`  ${title}`);
  console.log(SEPARATOR);
}

function passed(name: string) {
  console.log(`  ✓ ${name}`);
}

function failed(name: string, reason: string) {
  console.error(`  ✗ ${name} — ${reason}`);
}

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${REST_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json() as Promise<T>;
}

function waitForEvent<T = unknown>(socket: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for event: "${event}"`));
    }, timeout);

    const handler = (data: T) => {
      clearTimeout(timer);
      resolve(data);
    };

    socket.once(event, handler);
  });
}

function createClient(name: string): Socket {
  log(name, `Connecting to ${SERVER_URL}...`);

  return io(SERVER_URL, {
    path: SOCKET_PATH,
    transports: ['websocket', 'polling'],
    extraHeaders: { Authorization: 'Bearer test-token' },
  });
}

async function connectAndAuth(socket: Socket, name: string): Promise<string> {
  if (!socket.connected) {
    await waitForEvent(socket, 'connect');
  }
  log(name, `Connected | id: ${socket.id}`);

  socket.emit('authenticate');
  const authData = await waitForEvent<{ id: string; time: string }>(socket, 'authenticated');
  log(name, `Authenticated | id: ${authData.id}`);

  return authData.id;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test Cases
// ---------------------------------------------------------------------------

async function testEcho(socket: Socket) {
  header('Test: Echo');

  const payload = { message: 'hello echo', ts: Date.now() };
  socket.emit('echo', payload);

  const response = await waitForEvent<{ original: typeof payload; timestamp: string }>(
    socket,
    'echo:response',
  );

  if (response.original?.message === payload.message) {
    passed('Echo returned correct data');
  } else {
    failed('Echo response mismatch', JSON.stringify(response));
  }
}

async function testGetClientsViaSocket(socket: Socket, expectedMin: number) {
  header('Test: Get Clients (Socket Event)');

  socket.emit('get-clients');

  const response = await waitForEvent<{ count: number; clients: string[] }>(
    socket,
    'clients:list',
  );

  if (response.count >= expectedMin) {
    passed(`Got ${response.count} client(s): ${response.clients.join(', ')}`);
  } else {
    failed('Unexpected client count', `expected >= ${expectedMin}, got ${response.count}`);
  }
}

async function testJoinRoomViaSocket(opts: { socket: Socket; name: string }) {
  header('Test: Join Room (Socket Event)');

  const room = 'test-room-socket';
  opts.socket.emit('join', { rooms: [room] });
  await sleep(500);
  passed(`${opts.name} emitted join for room: ${room}`);
}

async function testLeaveRoomViaSocket(opts: { socket: Socket; name: string }) {
  header('Test: Leave Room (Socket Event)');

  const room = 'test-room-socket';
  opts.socket.emit('leave', { rooms: [room] });
  await sleep(500);
  passed(`${opts.name} emitted leave for room: ${room}`);
}

async function testJoinRoomViaREST(clientId: string) {
  header('Test: Join Room (REST)');

  const rooms = ['rest-room-a', 'rest-room-b'];
  const result = await rest<{ success: boolean; message: string }>(
    'POST',
    `/client/${clientId}/join`,
    { rooms },
  );

  if (result.success) {
    passed(`Joined rooms via REST: ${rooms.join(', ')} — ${result.message}`);
  } else {
    failed('Join room REST failed', result.message);
  }
}

async function testLeaveRoomViaREST(clientId: string) {
  header('Test: Leave Room (REST)');

  const rooms = ['rest-room-b'];
  const result = await rest<{ success: boolean; message: string }>(
    'POST',
    `/client/${clientId}/leave`,
    { rooms },
  );

  if (result.success) {
    passed(`Left rooms via REST: ${rooms.join(', ')} — ${result.message}`);
  } else {
    failed('Leave room REST failed', result.message);
  }
}

async function testGetClientRooms(clientId: string) {
  header('Test: Get Client Rooms (REST)');

  const result = await rest<{ success: boolean; rooms?: string[]; message?: string }>(
    'GET',
    `/client/${clientId}/rooms`,
  );

  if (result.success && result.rooms) {
    passed(`Client rooms: ${result.rooms.join(', ')}`);
  } else {
    failed('Get client rooms failed', result.message ?? 'unknown');
  }
}

async function testSendToClient(opts: {
  receiverSocket: Socket;
  receiverId: string;
}) {
  header('Test: Send Message to Specific Client (REST)');

  const { receiverSocket, receiverId } = opts;
  const topic = 'direct:message';
  const data = { text: 'hello specific client', ts: Date.now() };

  const receivePromise = waitForEvent<typeof data>(receiverSocket, topic);

  await rest('POST', `/client/${receiverId}/send`, { topic, data });
  log('REST', `Sent to client ${receiverId}`);

  const received = await receivePromise;

  if (received.text === data.text) {
    passed('Receiver got the correct message');
  } else {
    failed('Message mismatch', JSON.stringify(received));
  }
}

async function testSendToRoom(
  listenerSocket: Socket,
  listenerName: string,
  room: string,
) {
  header('Test: Send Message to Room (REST)');

  const topic = 'room:update';
  const data = { text: 'hello room members', ts: Date.now() };

  const receivePromise = waitForEvent<typeof data>(listenerSocket, topic);

  await rest('POST', `/room/${room}/send`, { topic, data });
  log('REST', `Sent to room "${room}"`);

  const received = await receivePromise;

  if (received.text === data.text) {
    passed(`${listenerName} in room "${room}" received message`);
  } else {
    failed('Room message mismatch', JSON.stringify(received));
  }
}

async function testBroadcast(socketA: Socket, socketB: Socket) {
  header('Test: Broadcast Message (REST)');

  const topic = 'system:announcement';
  const data = { text: 'broadcast for everyone', ts: Date.now() };

  const receiveA = waitForEvent<typeof data>(socketA, topic);
  const receiveB = waitForEvent<typeof data>(socketB, topic);

  await rest('POST', '/broadcast', { topic, data });
  log('REST', 'Broadcast sent');

  const [dataA, dataB] = await Promise.all([receiveA, receiveB]);

  if (dataA.text === data.text && dataB.text === data.text) {
    passed('Both clients received the broadcast');
  } else {
    failed('Broadcast data mismatch', `A=${JSON.stringify(dataA)} B=${JSON.stringify(dataB)}`);
  }
}

async function testChatBroadcast(senderSocket: Socket, receiverSocket: Socket) {
  header('Test: Chat Broadcast (Socket Event)');

  const receivePromise = waitForEvent<{ from: string; message: string; timestamp: string }>(
    receiverSocket,
    'chat:broadcast',
  );

  senderSocket.emit('chat:message', { message: 'hello everyone via socket' });

  const received = await receivePromise;

  if (received.message === 'hello everyone via socket') {
    passed(`Receiver got chat broadcast from ${received.from}`);
  } else {
    failed('Chat broadcast mismatch', JSON.stringify(received));
  }
}

async function testChatToRoom(senderSocket: Socket, receiverSocket: Socket, room: string) {
  header('Test: Chat to Room (Socket Event)');

  const receivePromise = waitForEvent<{ from: string; message: string; timestamp: string }>(
    receiverSocket,
    'chat:message',
  );

  senderSocket.emit('chat:message', { room, message: 'hello room via socket' });

  const received = await receivePromise;

  if (received.message === 'hello room via socket') {
    passed(`Receiver in room "${room}" got chat message from ${received.from}`);
  } else {
    failed('Chat room message mismatch', JSON.stringify(received));
  }
}

async function testRESTInfo() {
  header('Test: Server Info (REST)');

  const result = await rest<{ status: string; connectedClients: number; clientIds: string[] }>(
    'GET',
    '/info',
  );

  if (result.status === 'running') {
    passed(`Status: ${result.status} | Clients: ${result.connectedClients}`);
  } else {
    failed('Unexpected status', JSON.stringify(result));
  }
}

async function testRESTClients() {
  header('Test: List Clients (REST)');

  const result = await rest<{ count: number; clients: string[] }>('GET', '/clients');

  passed(`Count: ${result.count} | IDs: ${result.clients.join(', ')}`);
}

async function testRESTHealth() {
  header('Test: Health Check (REST)');

  const result = await rest<{ healthy: boolean; timestamp: string }>('GET', '/health');

  if (result.healthy) {
    passed(`Healthy: ${result.healthy} | Time: ${result.timestamp}`);
  } else {
    failed('Health check unhealthy', JSON.stringify(result));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(70));
  console.log('  Socket.IO Test Client — Automated Simulation');
  console.log(`  Server: ${SERVER_URL} | Socket path: ${SOCKET_PATH}`);
  console.log('='.repeat(70));

  // --- Connect two clients ---
  header('Setup: Connecting Client A & Client B');

  const socketA = createClient('ClientA');
  const socketB = createClient('ClientB');

  const idA = await connectAndAuth(socketA, 'ClientA');
  const idB = await connectAndAuth(socketB, 'ClientB');

  // Small delay for server to register both clients
  await sleep(500);

  // --- REST endpoints ---
  await testRESTHealth();
  await testRESTInfo();
  await testRESTClients();

  // --- Echo ---
  await testEcho(socketA);

  // --- Get clients via socket ---
  await testGetClientsViaSocket(socketA, 2);

  // --- Join/Leave room via socket event ---
  await testJoinRoomViaSocket({ socket: socketA, name: 'ClientA' });
  await testJoinRoomViaSocket({ socket: socketB, name: 'ClientB' });

  // --- Chat broadcast via socket ---
  await testChatBroadcast(socketA, socketB);

  // --- Chat to room via socket ---
  await testChatToRoom(socketA, socketB, 'test-room-socket');

  // --- Leave room via socket ---
  await testLeaveRoomViaSocket({ socket: socketB, name: 'ClientB' });

  // --- Join/Leave room via REST ---
  await testJoinRoomViaREST(idA);
  await testGetClientRooms(idA);
  await testLeaveRoomViaREST(idA);
  await testGetClientRooms(idA);

  // --- Send message to specific client via REST ---
  await testSendToClient({ receiverSocket: socketB, receiverId: idB });

  // --- Send message to room via REST ---
  // Join ClientB to a room first, then send to that room
  await rest('POST', `/client/${idB}/join`, { rooms: ['notify-room'] });
  await sleep(300);
  await testSendToRoom(socketB, 'ClientB', 'notify-room');

  // --- Broadcast via REST ---
  await testBroadcast(socketA, socketB);

  // --- Done ---
  header('All Tests Completed');

  socketA.disconnect();
  socketB.disconnect();
  log('CLEANUP', 'Both clients disconnected');

  await sleep(500);
  process.exit(0);
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
