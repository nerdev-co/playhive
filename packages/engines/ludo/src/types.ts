export type SquareType =
    | "safe"
    | "home"
    | "goal"
    | "safe-end"
    | "safe-way"
    | "left-way"
    | "right-way"
    | "normal";

export interface LudoPiece {
    name: string;
    index: number;
    position?: number;
    homeId?: number;
}

export interface LudoSquare {
    type: SquareType;
    index: number;
    pieces: LudoPiece[];
    homeId: number;
}

export type MoveType = "move" | "capture" | "undo-move" | "undo-capture";

export interface LudoMove {
    isInitial: boolean;
    number: number;
    from: LudoSquare;
    to: LudoSquare;
    capture: LudoPiece[];
    isRepeat: boolean;
    piece: LudoPiece;
}

export interface LudoEvent {
    add?: (piece: LudoPiece) => void;
    init?: () => void;
    over?: (pieces: string[], lastPlayer: string) => void;
    finish?: (piece: LudoPiece) => void;
    move?: (piece: LudoPiece, from: LudoSquare, to: LudoSquare, type: MoveType) => void;
    turn?: (piece: string) => void;
}

export interface LudoOptions {
    openWith?: number[];
    state?: string;
    canRound?: boolean;
    capture?: boolean;
    position?: string;
    historySize?: number;
}

export type LudoPiecePosition = Record<string, [number, number, number, number]>;

export interface BoardSquare {
    type: SquareType;
    pieces: Record<string, number>;
}

export type LudoBoard = BoardSquare[];
export type History = string[];

export interface EngineState {
    position: string;
    history: string;
    turn: string;
    players: string[];
    playersWithEnds: string[];
    captured: Record<string, number>;
    pieces: Record<string, number[]>;
    board: LudoBoard;
    gameInfo: [number, number, number];
    config: LudoOptions;
    gameOver: boolean;
    winner?: string;
    ranks?: string[];
}

export interface EngineAction {
    type: "ROLL_DICE" | "MOVE_TOKEN";
    token?: number;
    from?: number;
    to?: number;
    distance?: number;
}

export interface EngineResult {
    events: LudoEvent[];
    state: EngineState;
    gameOver: boolean;
    result?: {
        winner: string | null;
        reason: string;
        ranks: string[];
    };
}

export const LENGTH = 4;

/**
 * Captures all mutable engine state in a single object.
 * Used by the session API to enable pure, stateless game processing.
 */
export interface LudoSession {
    board: LudoBoard;
    pieces: Record<string, number[]>;
    captured: Record<string, number>;
    players: string[];
    playersWithEnds: string[];
    history: string[];
    gameInfo: [number, number, number];
    config: Required<LudoOptions>;
}