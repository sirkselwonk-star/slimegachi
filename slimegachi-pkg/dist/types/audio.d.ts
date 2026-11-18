/**
 * SLIMEgachi — audio. Everything is synthesized live with the Web Audio API;
 * there are no audio asset files.
 */
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}
export type SfxName = 'feed' | 'clean' | 'sleep' | 'coin' | 'achievement' | 'levelup' | 'pop' | 'catch' | 'golden' | 'miss' | 'gameover' | 'click';
export type MusicView = 'shelf' | 'care' | 'minigame';
export declare const AudioCore: {
    ensure: () => AudioContext | null;
    resume: () => void;
    readonly ctx: AudioContext | null;
    readonly sfx: GainNode | null;
    readonly music: GainNode | null;
};
export declare const Sound: {
    play: (name: SfxName) => void;
    toggle: () => boolean;
    isMuted: () => boolean;
    setMuted: (m: boolean) => void;
    ensureCtx: () => AudioContext | null;
    resume: () => void;
};
export declare const Music: {
    setScene: (view: MusicView, variant?: string) => void;
    setMuted: (m: boolean) => void;
    isMuted: () => boolean;
    toggle: () => boolean;
};
