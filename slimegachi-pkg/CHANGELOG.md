# Changelog

## 1.7.0 — storage keyed by {tokenId, serial}

Pet state now follows the NFT, not the wallet — so a pet's care history survives trades and syncs across devices.

- **Per-pet state** is now persisted under `pet:{tokenId}:{serial}` (stats, sick flag, care count, name), replacing the old account-scoped key. Any holder of a given serial loads the same pet record. The in-memory pet key is likewise account-independent (`{tokenId}-{serial}`).
- **Per-player state** (coins, login streak, achievements, daily quests, collection) is split out under `player:{accountId}` — it's inherently per-person and stays with the account.
- **Demo/stub** play is namespaced as `demo:pet:…` so it never collides with a real holder's record for the same serial.
- The `storage` adapter interface is unchanged (`load`/`save`/`remove`) — it's just called with the new keys, and the two key kinds map 1:1 onto the `slimegachi_pets` / `slimegachi_players` tables in the README's production schema.
- **Breaking for existing saves**: state under the old `{accountId}:v1` blob is not migrated (orphaned, not lost). Pre-launch, so no live data is affected.

## 1.6.0 — audio pass

All audio is synthesized live via the Web Audio API — zero asset files, no recordings. Degrades silently to "no audio" if the context is blocked.

- **Shared audio core**: one `AudioContext` created lazily and resumed on the first user gesture (autoplay-safe), with separate `sfxBus` / `musicBus` gain nodes off a master so effects and music level independently.
- **Sound effects**: chiptune cues for care actions (feed/clean/sleep), rewards (achievement/level-up/coin), mini-game hits (pop, catch, golden, rotten miss, game-over), and UI clicks. Hooked mostly off the internal event bus (`care_action` / `minigame_complete` / `milestone`); a Bubble Pop tap on empty water now plays a `miss` whiff. Mute via the 🔊 topbar button → `localStorage['slimegachi:muted']`.
- **Background music**: a lookahead step-sequencer plays a procedural chiptune loop per scene — 7 themes: shelf, one per pet on the care screen (Kitten/Monkey/Owl/Dragon), and one per mini-game (Bubble Pop / Banana Catch). Each theme is a small spec (tempo, tonic, 4-chord progression, per-voice waveforms); bass/arp/lead are generated on the fly. Scene changes crossfade (duck → swap → rise). Mute via the 🎵 topbar button → `localStorage['slimegachi:music-muted']`, independent of the SFX mute. Music sits below SFX in the mix.
- **Achievement toast** now slides in at the top-right of the game screen (was top-center).
- Both mute prefs are global/device-level (stored directly in `localStorage`, independent of the per-account storage adapter). No new `mount()` options or events — the audio layer is entirely internal.

## 1.5.0 — gameplay depth pass

- **Daily quests**: 3-quest slate refreshed at local midnight. Pool of 9 templates (feed counts, mini-game scores, care actions, sleep timing). Coin rewards on claim. Notification dot on shelf when ready.
- **Banana Catch** mini-game: a second mini-game for Monkey's favorite. Basket drags left/right, catch falling bananas, dodge rotten ones, golden bonuses. Same 30s/score format as Bubble Pop. New `bananaMaster` achievement.
- **Pet leveling**: per-pet `care_count` drives 10-level progression (5 / 12 / 22 / 35 / 50 / 70 / 100 / 140 / 200 / 280 actions). Each level grants a coin reward (8 → 200) and a permanent 1% decay reduction per level (cap 10%). Visible Lv badge with 5-dot progress on care screen.
- **Collection screen**: career stats — total actions, milestones, achievements, foods tried, mini-games played, pet types cared for, highest level, login streak.
- **Internal event bus**: cross-cutting `emitInternal`/`onInternal` system so quests/leveling/collection can subscribe to game events without polluting action handlers.

## 1.4.0

- SVG part-swap layers: mouth wrap, eye-open/closed groups, pupils
- Eye blinking (3-7.5s intervals, double-blink sometimes, sleep-aware)
- Pupil tracking with eased follow on pointer move
- Mouth chew animation on feed, gentle talk wiggle on speech
- Emote floaters: 💖⭐ on favorite food, 💤 on sleep, 🫧💧 on clean, ✨🌟✨ on achievement, 🎵 on long-happy idle
- Happy head sway after 1.5s of Thriving mood
- "Stub" → "demo" user-visible labels
- Dev panel lifted above action bar with yellow "DEV" prefix

## 1.2.0

Initial packaged release.

- Vanilla JS widget, zero runtime deps
- Mount API: `SLIMEgachi.mount(container, options)` → instance
- Plug-in points: `getOwnedPets`, `storage`, `mirrorNodes`, `ipfsGateways`, `petArt`, `theme`
- Event hooks: `onCareAction`, `onAchievement`, `onCoinsChanged`, `onMiniGameComplete`, `onPetOpen`, `onShelfReturn`, `onError`
- Instance methods: `setAccountId`, `disconnect`, `openPet`, `getState`, `destroy`
- Scoped CSS under `.slimegachi-root` to prevent host-page collisions
- Stub mode for demos / preview environments without wallet
- Mirror Node rotation + IPFS gateway rotation for resilience
- Day/night cycle, sleep windows, mood states
- Bubble Pop mini-game
- Shop + 6 foods/toys
- 6 achievements, 2 mintable
- Speech bubbles + random events
- Login streaks with coin rewards

## Future

- HashPack-direct integration option
- Additional mini-games per pet (Hoot Match for Owl, Flame Pop for Dragon)
- Achievement claim flow for HIP-904 airdrop
- Backend storage reference adapter (Supabase)
- Per-NFT custom names persisted server-side
- Per-account leaderboards via backend events
