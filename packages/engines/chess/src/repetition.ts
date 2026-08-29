/**
 * Repetition table for threefold repetition detection.
 *
 * Tracks how many times each position hash has been encountered in the
 * current game. On each move, call `add(hash)` — on each undo, call
 * `remove(hash)`. After adding, call `isThreefold()` to check if the
 * current position has been seen three times.
 *
 * The hash must be a Zobrist hash representing the repetition-relevant
 * position: piece placement, side to move, castling rights, en passant.
 * Halfmove/fullmove counters are deliberately excluded.
 */

export class RepetitionTable {
    private counts = new Map<number, number>();

    /**
     * Records that a position has been reached.
     * @returns The new count for this position.
     */
    add(hash: number): number {
        const count = (this.counts.get(hash) ?? 0) + 1;
        this.counts.set(hash, count);
        return count;
    }

    /**
     * Removes one occurrence of a position (called on undo).
     */
    remove(hash: number): void {
        const count = this.counts.get(hash);
        if (count === undefined) return;
        if (count <= 1) {
            this.counts.delete(hash);
        } else {
            this.counts.set(hash, count - 1);
        }
    }

    /**
     * Returns true if the position with this hash has been seen 3+ times.
     */
    isThreefold(hash: number): boolean {
        return (this.counts.get(hash) ?? 0) >= 3;
    }

    /**
     * Returns the number of times a position has been seen.
     */
    getCount(hash: number): number {
        return this.counts.get(hash) ?? 0;
    }

    /**
     * Clears all recorded positions.
     */
    clear(): void {
        this.counts.clear();
    }
}
