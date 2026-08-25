import { PrismaClient, RoomStatus, MatchStatus, ParticipantStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await hash('password123', 12);

  const user1 = await prisma.user.upsert({
    where: { username: 'alice' },
    update: {},
    create: {
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      passwordHash,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { username: 'bob' },
    update: {},
    create: {
      username: 'bob',
      displayName: 'Bob',
      email: 'bob@example.com',
      passwordHash,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
    },
  });

  const guestUser = await prisma.user.upsert({
    where: { username: 'guest_001' },
    update: {},
    create: {
      username: 'guest_001',
      displayName: 'Guest Player',
      isGuest: true,
    },
  });

  console.log('✅ Users created');

  const room = await prisma.gameRoom.create({
    data: {
      name: 'Ludo Match #1',
      gameType: 'ludo',
      maxPlayers: 4,
      status: RoomStatus.IN_PROGRESS,
      settings: {
        media: { voice: true, video: false },
        maxPlayers: 4,
        private: true,
      },
      hostId: user1.id,
      startedAt: new Date(),
      participants: {
        create: [
          { userId: user1.id, seatPosition: 0, score: 0, status: ParticipantStatus.ACTIVE },
          { userId: user2.id, seatPosition: 1, score: 0, status: ParticipantStatus.ACTIVE },
        ],
      },
    },
    include: { participants: true },
  });

  console.log('✅ Room created:', room.id);

  const match = await prisma.match.create({
    data: {
      roomId: room.id,
      game: 'ludo',
      status: MatchStatus.IN_PROGRESS,
      seats: [
        { seat: 0, playerId: user1.id, bot: false, result: null },
        { seat: 1, playerId: user2.id, bot: false, result: null },
      ],
      config: { maxPlayers: 4, media: { voice: true, video: false } },
      startedAt: new Date(),
    },
  });

  console.log('✅ Match created:', match.id);

  const events = [
    { version: 1, seat: 0, event: { type: 'dice', value: 4 }, playerId: user1.id },
    { version: 2, seat: 0, event: { type: 'move', token: 0, from: 0, to: 4 }, playerId: user1.id },
    { version: 3, seat: 1, event: { type: 'dice', value: 6 }, playerId: user2.id },
    { version: 4, seat: 1, event: { type: 'move', token: 0, from: 0, to: 6 }, playerId: user2.id },
    { version: 5, seat: 1, event: { type: 'dice', value: 3 }, playerId: user2.id },
    { version: 6, seat: 1, event: { type: 'move', token: 0, from: 6, to: 9 }, playerId: user2.id },
  ];

  for (const e of events) {
    await prisma.gameEvent.create({
      data: {
        matchId: match.id,
        version: e.version,
        seat: e.seat,
        event: e.event,
        playerId: e.playerId,
      },
    });
  }

  console.log('✅ Game events created');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });