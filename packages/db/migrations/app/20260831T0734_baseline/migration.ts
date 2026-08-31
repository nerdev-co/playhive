#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a4f878e19810bc667ed9ad1148403292e24bb034ac1f87d93901f5ec301c4506/contract';
import endContract from '../../snapshots/a4f878e19810bc667ed9ad1148403292e24bb034ac1f87d93901f5ec301c4506/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'gameEvent',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('event', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('matchId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('playerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('seat', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('version', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'gameParticipant',
        columns: [
          col('gameRoomId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('score', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('seatPosition', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'gameParticipant_status_check_c4e5db98',
            "\"status\" IN ('ACTIVE', 'LEFT', 'KICKED', 'DISCONNECTED', 'FORFEITED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'gameRoom',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('endedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('gameType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('hostId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('maxPlayers', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('settings', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('startedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('WAITING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'gameRoom_status_check_17ad6baf',
            "\"status\" IN ('WAITING', 'STARTING', 'IN_PROGRESS', 'FINISHED', 'ARCHIVED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'match',
        columns: [
          col('config', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('finalState', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('finishedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('game', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('result', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('roomId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('seats', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('startedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('IN_PROGRESS'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'match_status_check_fff06d26',
            "\"status\" IN ('IN_PROGRESS', 'FINISHED', 'ARCHIVED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('avatar', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('displayName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isGuest', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('passwordHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('username', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'gameEvent',
        constraint: 'gameEvent_matchId_version_key',
        columns: ['matchId', 'version'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'gameParticipant',
        constraint: 'gameParticipant_gameRoomId_seatPosition_key',
        columns: ['gameRoomId', 'seatPosition'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'gameParticipant',
        constraint: 'gameParticipant_gameRoomId_userId_key',
        columns: ['gameRoomId', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'match',
        constraint: 'match_roomId_key',
        columns: ['roomId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_username_key',
        columns: ['username'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameEvent',
        index: 'gameEvent_matchId_idx_4caf5ecc',
        columns: ['matchId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameEvent',
        index: 'gameEvent_matchId_version_idx_9a5d4dcd',
        columns: ['matchId', 'version'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameEvent',
        index: 'gameEvent_playerId_idx_710cf1aa',
        columns: ['playerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameParticipant',
        index: 'gameParticipant_gameRoomId_idx_f74bde20',
        columns: ['gameRoomId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameParticipant',
        index: 'gameParticipant_gameRoomId_seatPosition_idx_78e91558',
        columns: ['gameRoomId', 'seatPosition'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameParticipant',
        index: 'gameParticipant_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'gameRoom',
        index: 'gameRoom_hostId_idx_05205577',
        columns: ['hostId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'match',
        index: 'match_game_status_idx_eea293d9',
        columns: ['game', 'status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'gameEvent',
        foreignKey: {
          name: 'gameEvent_matchId_fkey',
          columns: ['matchId'],
          references: { schema: 'public', table: 'match', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'gameEvent',
        foreignKey: {
          name: 'gameEvent_playerId_fkey',
          columns: ['playerId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'gameParticipant',
        foreignKey: {
          name: 'gameParticipant_gameRoomId_fkey',
          columns: ['gameRoomId'],
          references: { schema: 'public', table: 'gameRoom', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'gameParticipant',
        foreignKey: {
          name: 'gameParticipant_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'gameRoom',
        foreignKey: {
          name: 'gameRoom_hostId_fkey',
          columns: ['hostId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'match',
        foreignKey: {
          name: 'match_roomId_fkey',
          columns: ['roomId'],
          references: { schema: 'public', table: 'gameRoom', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
