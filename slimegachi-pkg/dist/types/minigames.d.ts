/**
 * SLIMEgachi — mini-games. Each runs for 30 seconds on a shared canvas and
 * reports a score; the instance turns the score into Happy and coins.
 *
 * Both loops are frame-rate independent: movement and spawn timers are
 * scaled by real delta-time (normalised to 60 fps), so the game runs at the
 * same real-world pace on low-fps mobile devices.
 */
import type { GameId, MiniGame } from './types';
/** What a mini-game needs from the widget instance. */
export interface GameHost {
    /** Look up a widget element by its `data-sg` name. */
    $<T extends HTMLElement = HTMLElement>(name: string): T;
    /** Current device pixel ratio. */
    dpr(): number;
    /** Apply rewards and show the results panel. `score` may be negative. */
    complete(game: GameId, score: number, forfeit: boolean): void;
}
export declare function createBubblePop(host: GameHost): MiniGame;
export declare function createBananaCatch(host: GameHost): MiniGame;
