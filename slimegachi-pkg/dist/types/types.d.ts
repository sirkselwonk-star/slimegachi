/**
 * SLIMEgachi — shared types.
 *
 * The first half is the public contract (mount options, storage adapter,
 * event payloads, instance API). The second half is internal game state.
 */
export type PetId = 'Kitten' | 'Monkey' | 'Owl' | 'Dragon';
export type StatName = 'hunger' | 'happy' | 'energy' | 'clean';
export type Stats = Record<StatName, number>;
export type FoodId = 'snack' | 'burger' | 'banana' | 'cake' | 'medicine' | 'toyball';
export type GameId = 'bubblepop' | 'bananacatch';
export type AchievementId = 'firstSteps' | 'pickyEater' | 'squeakyClean' | 'devoted' | 'bubbleMaster' | 'bananaMaster' | 'whisperer';
/** The four care-bar buttons. Feed and Play open a picker / mini-game. */
export type CareAction = 'feed' | 'play' | 'sleep' | 'clean';
export type View = 'shelf' | 'care' | 'minigame';
export type Mood = 'happy' | 'okay' | 'sad' | 'sleepy';
export type TimePhase = 'dawn' | 'day' | 'dusk' | 'night';
/** One NFT the connected account holds, as the game sees it. */
export interface OwnedPet {
    /** The NFT's `Head` trait — selects art, decay rates, favourites. */
    pet: PetId;
    serial: number;
    name: string;
    image: string | null;
    traits: Record<string, string>;
}
/**
 * Persistence plug-in point. Called with two kinds of key:
 * `pet:{tokenId}:{serial}` (per-pet record) and `player:{accountId}`
 * (per-player record). Demo play uses `demo:pet:…` and `player:stub`.
 */
export interface StorageAdapter {
    load(key: string): Promise<unknown>;
    save(key: string, data: unknown): Promise<unknown>;
    remove(key: string): Promise<unknown>;
}
export interface CareActionEvent {
    action: CareAction;
    food?: FoodId;
    petSerial: number;
    petType: PetId;
    stats: Stats;
}
export interface AchievementEvent {
    id: AchievementId;
    name: string;
    mintable: boolean;
}
export interface CoinsChangedEvent {
    balance: number;
    delta: number;
    reason: string;
}
export interface MiniGameCompleteEvent {
    game: GameId;
    score: number;
    coins: number;
    happy: number;
    forfeit: boolean;
}
export interface PetOpenEvent {
    petSerial: number;
    petType: PetId;
}
export interface SlimegachiError {
    code: string;
    message: string;
}
/** Payload of each public event hook, keyed by hook name. */
export interface EventPayloads {
    onCareAction: CareActionEvent;
    onAchievement: AchievementEvent;
    onCoinsChanged: CoinsChangedEvent;
    onMiniGameComplete: MiniGameCompleteEvent;
    onPetOpen: PetOpenEvent;
    onShelfReturn: Record<string, never>;
    onError: SlimegachiError;
}
export type EventHooks = {
    [K in keyof EventPayloads]?: (payload: EventPayloads[K]) => void;
};
export type GetOwnedPets = (accountId: string) => Promise<OwnedPet[]>;
export interface MountOptions {
    /** Hedera token ID of the NFT collection. */
    tokenId?: string;
    /** Connected account; omit to start in demo mode. */
    accountId?: string | null;
    /** Mirror Node base URLs, tried in order. */
    mirrorNodes?: string[];
    /** IPFS gateway base URLs, tried in order. */
    ipfsGateways?: string[];
    /** Per-pet art overrides (URL, data URI or raw SVG), merged over the embedded art. */
    petArt?: Partial<Record<PetId, string>>;
    /** CSS variable overrides, keyed without the `--slimegachi-` prefix. */
    theme?: Record<string, string>;
    storage?: StorageAdapter;
    /** Replace the default Mirror Node + IPFS ownership lookup. */
    getOwnedPets?: GetOwnedPets;
    showDevPanel?: boolean;
    events?: EventHooks;
}
export interface AchievementState {
    unlockedAt: number;
    claimed: boolean;
}
export interface QuestProgress {
    id: string;
    progress: number;
    claimed: boolean;
}
export interface QuestState {
    day: string | null;
    slate: QuestProgress[];
}
export interface CollectionState {
    totalActions: number;
    foodsTried: Partial<Record<FoodId, boolean>>;
    gamesPlayed: Partial<Record<GameId, number>>;
    milestonesReached: number;
}
/** In-memory state of one pet. Persisted fields are in {@link PetRecord}. */
export interface PetState {
    stats: Stats;
    lastTick: number;
    name: string;
    pet: PetId;
    serial: number;
    traits: Record<string, string>;
    sick: boolean;
    care_count: number;
    /** Tap-to-wake override: the pet counts as awake until this timestamp. */
    awakeUntil: number;
}
/** Read-only snapshot returned by `instance.getState()`. */
export interface StateSnapshot {
    account: string | null;
    view: View;
    /** `{tokenId}-{serial}` of the pet on the care screen. */
    activeKey: string | null;
    ownedPets: OwnedPet[];
    coins: number;
    loginStreak: number;
    achievements: Partial<Record<AchievementId, AchievementState>>;
    pets: Record<string, PetState>;
    quests: QuestState;
    collection: CollectionState;
}
export interface SlimegachiInstance {
    /** Call when a wallet connects. A falsy id returns to demo mode. */
    setAccountId(accountId: string | null): Promise<void>;
    /** Back to demo mode. */
    disconnect(): Promise<void>;
    /** Deep-link to a specific owned pet. */
    openPet(serial: number): void;
    getState(): StateSnapshot;
    /** Unmount and release timers and listeners. */
    destroy(): void;
}
/** Stored under `pet:{tokenId}:{serial}`. */
export interface PetRecord {
    stats: Stats;
    lastTick: number;
    sick: boolean;
    care_count: number;
    awakeUntil: number;
    name: string;
}
/** Stored under `player:{accountId}`. */
export interface PlayerRecord {
    coins: number;
    achievements: Partial<Record<AchievementId, AchievementState>>;
    lastLoginDay: string | null;
    loginStreak: number;
    thrivingStartTime: number | null;
    quests: QuestState;
    collection: CollectionState;
}
export interface PetDef {
    id: PetId;
    label: string;
    status: 'available' | 'locked';
    accent: string;
    sublabel?: string;
    /** Stat points lost per hour. */
    decay: Stats;
    favoriteFood: FoodId;
    favoriteGame: GameId;
    bouncyness: number;
    /** `[startHour, endHour]`; wraps past midnight when start > end. */
    sleepWindow: [number, number];
    /** `[top, bottom]` background gradient colours. */
    skyDay: [string, string];
    skyDusk: [string, string];
}
export interface FoodDef {
    id: FoodId;
    name: string;
    icon: string;
    cost: number;
    hunger: number;
    happy: number;
    clean: number;
    desc: string;
    healsSick?: boolean;
    isToy?: boolean;
}
export interface AchievementDef {
    id: AchievementId;
    name: string;
    desc: string;
    mintable: boolean;
    icon: string;
}
export interface InternalCareAction {
    action: CareAction;
    food?: FoodId;
    isFavoriteFood?: boolean;
    petSerial: number;
    petType: PetId;
    petKey: string;
    /** False when the action didn't meet a genuine need (no level progress). */
    rewardsCare: boolean;
}
export interface InternalMiniGameComplete {
    game: GameId;
    score: number;
    forfeit: boolean;
}
export interface InternalMilestone {
    petKey: string;
    level: number;
    reward: number;
}
export interface InternalEvents {
    care_action: InternalCareAction;
    minigame_complete: InternalMiniGameComplete;
    milestone: InternalMilestone;
}
/** What a quest's `track` function sees: an internal event tagged with its name. */
export type QuestEvent = ({
    type: 'care_action';
} & InternalCareAction) | ({
    type: 'minigame_complete';
} & InternalMiniGameComplete);
export interface QuestDef {
    id: string;
    label: string;
    target: number;
    reward: number;
    /** Progress this event contributes (0 if it doesn't count). */
    track(ev: QuestEvent): number;
}
/** A running mini-game, as the instance drives it. */
export interface MiniGame {
    readonly id: GameId;
    start(): void;
    stop(forfeit: boolean): void;
}
