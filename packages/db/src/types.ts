export type RoomStatus =
  | 'WAITING'
  | 'STARTING'
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'ARCHIVED';

export type ParticipantStatus =
  | 'ACTIVE'
  | 'LEFT'
  | 'KICKED'
  | 'DISCONNECTED'
  | 'FORFEITED';

export type MatchStatus =
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'ARCHIVED';

export type GameType = 'ludo' | 'chess' | 'snake-ladder' | 'checkers' | 'uno' | 'tic-tac-toe';

export interface SeatInfo {
  seat: number;
  playerId: string;
  bot: boolean;
  result: 'win' | 'loss' | 'draw' | 'dnf' | null;
}

export interface MatchConfig {
  maxPlayers: number;
  media: { voice: boolean; video: boolean };
  private: boolean;
}

export interface MatchResult {
  winner: string | null;
  reason: 'checkmate' | 'timeout' | 'forfeit' | 'completed' | 'draw' | string;
  dnf: string[];
}