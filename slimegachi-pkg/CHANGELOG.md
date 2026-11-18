# Changelog

## 1.9.1 — care-screen visual fixes

- **Vitals rings draw again**: the ring gauge's background referenced `--slimegachi-bg_top` (underscore) instead of `--slimegachi-bg-top`, which invalidated the whole declaration, so only the icon and number showed. The coloured ring and its track now render.
- **No dots over closed eyes**: Kitten's and Monkey's white eye highlights sat outside the `sg-eye-open` groups and stayed visible while asleep or blinking. They now carry the `sg-eye-open` class and hide with the rest of the open eye.
- **Tap-to-wake opens the eyes immediately**: the wake handler now reschedules the blink, instead of leaving the eyes shut for up to 4 s until the next sleep re-check.

## 1.9.0 — demo polish

Gameplay fairness fixes, a custom icon system and a long UI polish pass. No changes to the mount API, options, or public events.

### Gameplay

- **Anti-spam care gate**: a care action only earns level progress (`care_count`) when it meets a genuine need — Clean when clean < 60, Sleep when energy < 60, Feed when hunger < 60 (or when Medicine cures a pet that was actually sick). Topping up an already-satisfied pet still applies the stat boost but earns no care credit, so the free Clean / Sleep / Snack buttons can't be spammed for levels. Thresholds are `CLEAN_CARE_THRESHOLD` / `SLEEP_CARE_THRESHOLD` / `FEED_CARE_THRESHOLD`. The internal `care_action` event carries a new `rewardsCare` boolean; only the leveling listener honours it (quests, achievements and collection still see every action).
- **Tap-to-wake**: tapping a sleeping pet wakes it until its next scheduled bedtime, so a night-time visitor isn't stuck with an un-interactable pet. Stored per pet as `awakeUntil` (persisted, survives a refresh). All sleep checks go through `petSleeping(p)`, which layers the override on top of the time-of-day schedule.
- **Mini-games are frame-rate independent**: Bubble Pop and Banana Catch now scale movement and spawn timers by real delta-time (normalised to 60 fps, clamped at 100 ms per frame) instead of a fixed per-frame step, fixing slow motion on low-fps mobile devices.
- **Mini-game speed is 4×** the original pace (delta-time multiplier in both game loops). Duration (30 s) and the reward formulas are unchanged.
- **Banana Catch sprites enlarged** (banana doubled; star and rotten item larger).
- **Back button hidden during a mini-game and its results screen**, so the only exits are the in-game Exit and "Back to Pet" buttons.

### Icons & typography

- **No more OS emoji**: every emoji in the UI is replaced by a custom inline-SVG icon system. Chrome icons (topbar, vitals, nav, care actions) are monochrome line icons using `currentColor`; content icons (foods, achievements, events, floating emotes, mini-game sprites) are flat-colour with a dark outline to match the pets. The sound / music toggles swap to muted variants.
- **White Rabbit everywhere**: `--slimegachi-font-ui` now points at White Rabbit as well as `--slimegachi-font-display`; JetBrains Mono remains the fallback. Non-button text is 2 px larger overall.
- **SLIME-green accents**: remaining aqua text (mini-game result stats, level number, pet-card `#serial`, DEMO badge, back arrow) recoloured to the accent green.

### Care screen layout (supersedes parts of 1.8.0)

- **Vitals** are a centred row of ring gauges in the band between the floor divider and the action buttons — no longer the upper-left column described under 1.8.0. Gauges are larger.
- **Coins** sit in the info column under the level on the care screen (back in the topbar on the shelf); the pill background is gone, leaving icon + number with a drop shadow.
- **Info column**: name line, level (accent-green number, progress dots) and a status line now prefixed `STATUS:`, with drop shadows for legibility.
- **Back button** lives in the topbar as the right-most control, next to the sound and music toggles.
- **DEMO badge** reads just `DEMO` (was `STUB (DEMO)`) and sits under the wordmark.
- **Dark scrims** behind the top controls and the bottom action bar (care screen and shelf) keep light text readable over bright daytime skies. Action buttons are accent green over bright skies.
- Pet expressions and floating emotes are slightly larger.

### Shelf

- Larger "Your Pets" title and subtitle; subtitle copy and colour updated.

### Demo page / packaging

- **Deployed page is self-contained for fonts**: `slimegachi/slimegachi.css` is now the `dist` build with White Rabbit + JetBrains Mono embedded, and `index.html` no longer loads them from Google Fonts / cdnfonts.
- **`?reset=1`**: loading `index.html` or `dist/slimegachi.standalone.html` with `?reset=1` wipes the `slimegachi*` localStorage keys before mount and then strips the parameter from the URL, giving any device a clean Level-0 start.

## 1.8.0 — care-screen layout pass

Compact, restyled vitals and a tidier upper-left info column.

- **Stat indicators → ring gauges**: the four stats render as small circular ring meters (conic-gradient fill, emoji icon in the centre, value beside each ring), replacing the stacked label + bar + value rows. Low stats (<25) still turn red. Driven from `renderStats()` via `--pct` / `--col` CSS variables.
- **Vitals stacked upper-left**: the gauges sit as a vertical column on the left rather than a centred block.
- **Pet name moved upper-left**: name + mood + level are left-aligned at the top of the stage (below the title, above the vitals), instead of centred mid-stage.
- **Pet centred**: the pet image is vertically centred in the stage rather than anchored to the floor.
- **Topbar tightened**: reduced top padding so the title sits higher.

CSS-and-markup only — no changes to the mount API, options, events, or storage.

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
