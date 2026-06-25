# SLIMEgachi — Game Design Spec

The full mechanics behind the game. This is the document to read when you're trying to remember why a number is what it is, or you're trying to design a new feature that needs to fit the existing system.

For the integration contract (mount API, options, events), see the **README**.
For adding a new pet, see **ADDING_A_PET.md**.

---

## Core loop

The player owns one or more SLIME NFTs. Each NFT renders as a pet on the shelf. Tapping a pet enters the care screen, where stats decay over real time and the player keeps them up via four actions: **Feed, Play, Sleep, Clean**. Decay never kills the pet — neglect just makes its mood deteriorate. The currency loop runs alongside: actions and play earn coins, coins buy food and toys, premium foods give bigger boosts.

Daily quests give players reasons to come back tomorrow. Achievements and pet leveling give reasons to come back next month. The collection screen shows everything they've done.

---

## Stats

Every pet has four stats on a 0-100 scale.

| Stat   | What it represents | Restored by      |
|--------|--------------------|------------------|
| Hunger | Fullness           | Feed (food)      |
| Happy  | Mood / engagement  | Play (mini-game), favorite food, sleep bonus, achievements |
| Energy | Rest level         | Sleep            |
| Clean  | Hygiene            | Clean            |

Starting values for a fresh pet: Hunger 80, Happy 80, Energy 80, Clean 90.

### Decay

Each pet has per-stat decay rates in points-per-hour. Decay is applied incrementally based on real wall-clock time (`Date.now()`), so pets keep "living" between sessions.

**Per-pet base decay rates:**

| Pet    | Hunger | Happy | Energy | Clean |
|--------|--------|-------|--------|-------|
| Kitten | 14     | 10    | 8      | 12    |
| Monkey | 18     | 16    | 14     | 9     |
| Owl    | 8      | 8     | 6      | 6     |
| Dragon | 22     | 12    | 18     | 16    |

Owl is "chill" — slow decay, low-maintenance. Dragon is "high-energy" — fastest hunger and energy drain. Monkey is intense but easier to keep clean. Kitten is the baseline / tutorial pet.

**Decay multipliers** (all multiply together):

| Multiplier      | Value                            | Notes |
|-----------------|----------------------------------|-------|
| Active pet      | 1.0                              | The pet on the care screen |
| Passive pet     | 0.4 (`PASSIVE_DECAY_MULTIPLIER`) | Pets on the shelf decay slower |
| Sick state      | 1.4                              | Pet is currently Sick |
| Level reduction | `max(0.9, 1 − level × 0.01)`     | Each level grants 1% decay reduction, capped at 10% (Lv 10) |

So a Lv 5 active pet that's sick decays at `1.0 × 1.4 × 0.95 = 1.33×` the base rate.

### Mood

Derived from the four stats, evaluated every render.

```
avg = (hunger + happy + energy + clean) / 4

if energy < 18       → Sleepy
else if avg < 30     → Sad ("Needs Attention")
else if avg > 75     → Thriving ("Happy")
else                 → Content ("Okay")
```

Sleeping (during pet's sleep window) overrides mood to "Sleeping". Sick overrides everything to "Sick".

Mood affects:
- Pet image filter (sad → desaturated, happy → glow, sleeping → dimmed, sick → green tint)
- Speech bubble line pool
- Idle animation (Thriving for >5s → head sway)
- Achievement triggers (`whisperer` requires 24h Thriving)

---

## Actions

### Feed (opens food picker)

Opens the shop sub-modal with available foods. Each food applies:

| Food     | Cost | Hunger | Happy | Clean | Notes                       |
|----------|------|--------|-------|-------|------------------------------|
| Snack    | 0    | +20    | 0     | 0     | Free, basic                  |
| Banana   | 8    | +25    | +5    | 0     | Sweet & happy                |
| Burger   | 15   | +35    | 0     | −3    | Filling, messy               |
| Cake     | 25   | +40    | +10   | −8    | Treat, very messy            |
| Medicine | 30   | 0      | −2    | 0     | Cures Sick state             |
| Toy Ball | 20   | 0      | +8    | 0     | Buffs next mini-game 1.5× coins |

**Favorite food bonus**: 1.5× multiplier on Hunger, Happy, and Clean changes. Each pet has one favorite food set in `PET_DEFS`.

**Wrong-time penalty**: feeding during a pet's sleep window applies 0.5× multiplier and triggers a "(sleepy)" feedback string.

### Play (launches mini-game)

Launches the pet's `favoriteGame`. Each game runs for 30 seconds, then reports a score → Happy boost and coin payout.

Reward formula (same for all mini-games):

```
happy_gain = min(35, max(forfeit ? 5 : 10, floor(score × 0.4)))
coins      = floor(score × 0.25 × toy_buff_multiplier)
energy_cost = 8  // applied to active pet
```

If the pet's `favoriteGame` matches the played game, the happy gain gets a 1.5× bonus.

If the Toy Ball buff is active (set by purchasing Toy Ball before playing), coins are multiplied by 1.5. One-shot, consumed on next mini-game completion.

**Achievements**: scoring 100+ in a specific game unlocks that game's Master badge (`bubbleMaster`, `bananaMaster`).

### Sleep

Static effect on active pet: +40 Energy.

**Sleep window bonus**: doing Sleep during the pet's sleep window applies 1.5× to the boost (so +60 Energy) and grants +3 coins ("tucked in" bonus).

**Wrong-time penalty**: doing Sleep when it's *not* the sleep window applies 0.5× and small Happy penalty (−3). Pet is annoyed.

### Clean

Static effect on active pet: +40 Clean, −2 Happy (cleaning isn't fun).

Same wrong-time multipliers as Sleep.

---

## Mini-games

### Bubble Pop (Kitten's favorite)

30-second tap-to-pop. Bubbles spawn from the bottom and rise; player taps to pop them.

| Bubble type | Probability | Points | Visual         |
|-------------|-------------|--------|----------------|
| Common      | 80%         | 5      | Blue, medium   |
| Rare        | 15%         | 15     | Pink/yellow/teal, small |
| Huge        | 5%          | 25     | Big yellow, points label inside |

Bubbles missed (drift off top) just disappear, no penalty.

### Banana Catch (Monkey's favorite)

30-second drag-the-basket. Items fall from the top; player drags a basket left-right at the bottom to catch.

| Item    | Probability | Points | Visual              |
|---------|-------------|--------|---------------------|
| Banana  | 80%         | +5     | 🍌                  |
| Rotten  | 15%         | −8     | 🦟 (penalty — avoid) |
| Golden  | 5%          | +15    | ⭐ (bonus star)      |

Items hitting the basket between Y `basketY` and `basketY + 30` and within the basket's X range get caught. Missed items disappear.

### Future games (placeholder slots)

- **Hoot Match** (Owl's favorite): card-flip memory game
- **Flame Pop** (Dragon's favorite): faster-paced Bubble Pop variant with fire hazards

These ship with mint 2.

---

## Day / night cycle

Driven by **real local wall-clock time** (`new Date()`), not in-game time. The day is divided into phases:

| Phase  | Hours       | Default ambient                      |
|--------|-------------|--------------------------------------|
| Dawn   | 06:00–08:00 | Mixed dusk + day palette             |
| Day    | 08:00–18:00 | Pet's `skyDay` palette               |
| Dusk   | 18:00–21:00 | Mixed day + night palette            |
| Night  | 21:00–06:00 | Pet's `skyDusk` palette              |

Each pet has unique `skyDay` and `skyDusk` color pairs (top + bottom of the background gradient). Owl's are *inverted* — `skyDay` is dark blue (night-like), `skyDusk` is bright tan, reflecting nocturnal habits.

### Sleep windows

Per-pet hour ranges. Within the window:
- Sleep action gets a 1.5× bonus and +3 coins
- Other actions get a 0.5× penalty + small Happy hit
- Pet image renders with sleep filter (dimmed)
- Eyes stay closed (overrides blink)
- Speech draws from the `sleepy` line pool

| Pet    | Sleep window | Notes                |
|--------|--------------|----------------------|
| Kitten | 22:00–06:00  | Normal cat schedule  |
| Monkey | 22:00–07:00  | Slightly longer      |
| Owl    | 08:00–16:00  | Inverted — nocturnal |
| Dragon | 03:00–05:00  | Dragons barely sleep |

A pet with energy < 15 will also stay closed-eyed even outside its window — exhausted regardless.

---

## Currency & shop

### Coin sources

| Source              | Amount                                  | Trigger |
|---------------------|-----------------------------------------|---------|
| Daily login         | 10                                      | First open of the day |
| Streak login (2+)   | 10 + min(streak × 2, 30)                | Subsequent days  |
| Mini-game           | floor(score × 0.25 × toy_buff)          | On game end |
| Quest claim         | Per-quest reward (8-20)                 | Player clicks Claim |
| Milestone (Lv up)   | 8 / 12 / 18 / 25 / 35 / 50 / 70 / 100 / 140 / 200 (by level) | On level-up |
| Found Coin event    | 5                                       | Random daytime event |
| Treasure event      | 30                                      | 5-day login streak event |
| Tucked-In bonus     | 3                                       | Sleep during sleep window |

### Coin sinks

The shop has 6 items. Feed Modal shows foods only (not toys); Shop Modal shows everything.

---

## Achievements

Seven badges. Two are flagged `mintable: true` for HIP-904 NFT badge airdrops when wallet integration ships (claim buttons exist but disabled).

| ID               | Name              | Trigger                                       | Mintable |
|------------------|-------------------|-----------------------------------------------|----------|
| `firstSteps`     | First Steps       | Any care action                               | No       |
| `pickyEater`     | Picky Eater       | Feed a pet its favorite food                  | No       |
| `squeakyClean`   | Squeaky Clean     | All four stats above 80 at once               | No       |
| `bubbleMaster`   | Bubble Master     | Score 100+ in Bubble Pop                      | No       |
| `bananaMaster`   | Banana Master     | Score 100+ in Banana Catch                    | No       |
| `devoted`        | Devoted Caretaker | 7-day login streak                            | **Yes**  |
| `whisperer`      | Slime Whisperer   | Pet stayed Thriving for 24 continuous hours   | **Yes**  |

Achievements fire once and can't be re-earned. Player progress is checked passively after each care action.

---

## Pet Leveling

Each pet has a `care_count` that increments on every care action (any of Feed/Play/Sleep/Clean). Crossing a threshold triggers a milestone.

| Level | Threshold (actions) | Coin reward |
|-------|---------------------|-------------|
| 0     | 0                   | —           |
| 1     | 5                   | 8           |
| 2     | 12                  | 12          |
| 3     | 22                  | 18          |
| 4     | 35                  | 25          |
| 5     | 50                  | 35          |
| 6     | 70                  | 50          |
| 7     | 100                 | 70          |
| 8     | 140                 | 100         |
| 9     | 200                 | 140         |
| 10    | 280                 | 200         |

Each level grants a permanent 1% decay reduction (multiplicative with other modifiers), capped at 10% at Lv 10.

A milestone triggers:
- Coin payout
- 🎉⬆️ emote burst
- "Lv X!" floater on the pet
- Internal `milestone` event (collection counter increments)

Level badge displays on the care screen as `Lv X ●●○○○` with a 5-dot progress bar to the next level. Level 10 shows `Lv 10 ★ MAX`.

---

## Quests

A slate of 3 quests refreshes at local midnight (compared against `new Date().toISOString().slice(0,10)`). Each quest tracks progress from internal game events.

**Quest pool** (9 templates, 3 drawn each day):

| ID                | Label                          | Target | Reward | Triggered by                                  |
|-------------------|--------------------------------|--------|--------|-----------------------------------------------|
| `feed_any_3`      | Feed pets 3 times today        | 3      | 10     | Any feed action                               |
| `feed_any_6`      | Feed pets 6 times today        | 6      | 16     | Any feed action                               |
| `feed_favorite`   | Feed a pet its favorite food   | 1      | 12     | Feed marked `isFavoriteFood`                  |
| `play_mini`       | Complete a mini-game           | 1      | 8      | Non-forfeit mini-game complete                |
| `mini_score_30`   | Score 30+ in a mini-game       | 1      | 12     | Mini-game complete with score ≥ 30            |
| `mini_score_60`   | Score 60+ in a mini-game       | 1      | 20     | Mini-game complete with score ≥ 60            |
| `clean_3`         | Clean pets 3 times today       | 3      | 10     | Any clean action                              |
| `sleep_2`         | Put pets to sleep 2 times      | 2      | 10     | Any sleep action                              |
| `play_action_3`   | Take 5 care actions today      | 5      | 8      | Any care action (feed, play, sleep, clean)    |

Quest claims fire `🎁` emote and credit coins. After claim, the row dims and shows "Claimed ✓". A pulsing yellow dot appears on the shelf's Quests button whenever any quest is ready but unclaimed.

---

## Collection

A career-stat screen tracking long-running counters. Accessed from the shelf's 📊 Stats button.

Tracked values:

| Stat                       | Source                                                   |
|----------------------------|----------------------------------------------------------|
| Career care actions        | Every Feed/Play/Sleep/Clean increments                   |
| Pet milestones reached     | Sum of level-ups across all pets                         |
| Achievements unlocked      | Count of unlocked badges / total                         |
| Foods tried                | Distinct food IDs ever consumed                          |
| Mini-games played          | Total non-forfeit games, broken down by kind             |
| Pet types cared for        | Distinct pet types with care_count > 0 / 4               |
| Highest pet level          | Max level reached across all pets                        |
| Login streak (best)        | Current login streak (technically "current" not "best")  |

---

## Speech bubbles

When a pet is on the care screen, every ~22s (with ±6s jitter) it says something. Lines are drawn from a per-pet, per-mood pool — Kitten's "happy" lines are different from Monkey's "happy" lines. While a speech bubble is up, the mouth animates ("talk").

Speech bubble lines per pet/mood are 4-5 each, defined in `SPEECH` in source. New pet → add a new top-level entry.

---

## Random events

Probabilistic events that pop a `!` icon on the pet that the player can tap.

| Event       | Trigger condition                  | Resolution                       |
|-------------|------------------------------------|----------------------------------|
| Found Coin  | Daytime, 25% chance per 60s check  | Auto-resolve in 8s → +5 coins, +2 Happy |
| Pet Sick    | Clean < 25, 50% chance per check   | Manual — needs Medicine purchase |
| Treasure    | 5-day login streak (one-time)      | Auto → +30 coins, +8 Happy       |

Events check every 60 seconds while on the care screen. Only one event active at a time.

---

## Persistence

State is saved to `localStorage` under the key `slimegachi:{accountId}:v1` (or `slimegachi:stub:v1` for demo mode). Writes are debounced (~800ms) after any mutation. Pluggable via the `storage` option for backend storage.

**Persisted state shape:**

```js
{
  pets:              { [petKey]: { stats, lastTick, name, pet, serial, traits, sick, care_count }, ... },
  activeKey:         string | null,
  coins:             number,
  achievements:      { [id]: { unlockedAt, claimed }, ... },
  lastLoginDay:      'YYYY-MM-DD' | null,
  loginStreak:       number,
  thrivingStartTime: timestamp | null,
  quests:            { day: 'YYYY-MM-DD', slate: [{ id, progress, claimed }] },
  collection:        { totalActions, foodsTried, gamesPlayed, milestonesReached }
}
```

When loading a save from an older version, missing keys backfill with safe defaults — existing players don't lose data when new features ship.

---

## Internal event bus

Cross-cutting game systems (quests, leveling, collection) subscribe to an internal event bus instead of patching action handlers. This is `emitInternal(name, payload)` / `onInternal(name, fn)` inside the widget; it is **separate from** the public `safeEmit` used for the host site's analytics hooks.

**Internal event taxonomy:**

| Event                | Payload                                                            | Emitted by                  |
|----------------------|--------------------------------------------------------------------|------------------------------|
| `care_action`        | `{ action, food?, isFavoriteFood?, petSerial, petType, petKey }`   | `applyAction`, `applyFood`   |
| `minigame_complete`  | `{ game, score, forfeit }`                                         | Each mini-game `stop()`      |
| `milestone`          | `{ petKey, level, reward }`                                        | Leveling on threshold cross  |

When adding a new system that needs to react to game events, subscribe to these rather than instrumenting the action handlers directly. New events should be added here (and documented) when needed.

---

## Theme & visual layer

Background colors are driven by the pet's `skyDay` / `skyDusk` palettes plus the current time phase. Other UI uses CSS variables under `.slimegachi-root`:

| Variable             | Purpose                          |
|----------------------|----------------------------------|
| `--slimegachi-accent`    | Primary brand color              |
| `--slimegachi-coin`      | Currency display, achievements   |
| `--slimegachi-text`      | Main text                        |
| `--slimegachi-muted`     | Secondary text                   |
| `--slimegachi-dim`       | Tertiary text                    |
| `--slimegachi-danger`    | Low-stat warnings                |
| `--slimegachi-success`   | Positive feedback                |
| `--slimegachi-favorite`  | Favorite-item highlight          |

All overridable via the `theme` option to `mount()`.

---

## Animation layer (visual life)

Driven by per-frame math in the animation loop. No frame-by-frame sprite work — all transforms applied to inline SVG.

| Effect          | Driver                                              |
|-----------------|-----------------------------------------------------|
| Breathing       | `sin(t × breath_rate)` × bouncyness                 |
| Bounce on play  | `sin(elapsed/dur × π)` × 70 × bouncyness            |
| Mouth chew      | `abs(sin(phase × 6)) × 1.2`, ~900ms duration        |
| Mouth talk      | `abs(sin(phase × 4)) × 0.5`, ~3.5s duration         |
| Wobble on clean | `sin(elapsed × 6) × 5°`                             |
| Happy head sway | After Thriving > 1.5s: `sin(t × 1.6) × 3°` rotation |
| Blink           | 3–7.5s random intervals + 25% double-blink chance   |
| Pupil tracking  | Eased 12%/frame follow toward pointer, clamped to 80% socket |

Sleeping or low-energy pets stay closed-eyed. Sick state shows green-tint filter on top of mood filter.

Emote floaters (📜🎉💖 etc.) are pure DOM elements drifting up from above the pet, animated by CSS `@keyframes slimegachi-emote-rise`. Used for: favorite-food rewards, achievement bursts, level-ups, action confirmations, idle happy moments.

---

## Audio layer

All audio is **synthesized live** via the Web Audio API — no asset files, no recordings. One shared `AudioContext` is created lazily and resumed on the first user gesture (autoplay policy). Two gain buses hang off the master so the two channels level / mute / duck independently:

```
destination ← master ← sfxBus   (one-shot cues)
                     ← musicBus  (looping background tracks)
```

Everything degrades silently to "no audio" if the context is blocked. Both mute prefs are global/device-level — stored directly in `localStorage`, **not** through the per-account storage adapter.

### Sound effects (`sfxBus`)

Short chiptune cues built from enveloped oscillators. Most are wired off the [internal event bus](#internal-event-bus) so action handlers stay sound-agnostic; the rest fire inline at their source.

| Cue | Trigger | Hook |
|-----|---------|------|
| `feed` / `clean` / `sleep` | Care action | `onInternal('care_action')` (by `action`) |
| `coin` | Coins earned | inline in `Currency.earn` |
| `achievement` | Badge unlocked | inline in `fireAchievement` |
| `levelup` | Pet milestone | `onInternal('milestone')` |
| `pop` / `golden` | Bubble Pop hit | inline in `handleTap` (by points) |
| `miss` | Bubble Pop tap on empty water | inline in `handleTap` |
| `catch` / `golden` / `miss` | Banana Catch hit | inline in catch test (by `kind`) |
| `gameover` | Mini-game ends (not forfeit) | `onInternal('minigame_complete')` |
| `click` | Nav / open / close / shelf buttons | delegated capture-phase listener (excludes the care bar + food picker so cues never double) |

Mute: 🔊 topbar button → `localStorage['slimegachi:muted']`.

### Music (`musicBus`)

A lookahead step-sequencer (16 eighth-notes / 2 bars per loop) plays one procedural chiptune **theme per scene**:

| Scene | Theme key(s) |
|-------|--------------|
| Shelf | `shelf` |
| Care screen | `care_Kitten` · `care_Monkey` · `care_Owl` · `care_Dragon` (per active pet) |
| Mini-game | `minigame_bubblepop` · `minigame_bananacatch` (per active game) |

Each theme is a tiny spec — `bpm`, tonic `root` (Hz), a 4-chord `prog` (chord-root semitone + quality), per-voice `waves`, `arpOct`, `density` — from which **bass / arp / lead** lines are generated on the fly (no stored melodies). Scene changes crossfade: duck → swap theme → rise, guarded by a swap token so a rapid second change wins.

Scene selection is centralized in `musicForCurrentView()`, called from `enterCare` / `backToShelf` / `launchMiniGame` / `closeMiniGame` and the first-gesture handler; it maps `State.view` (+ active pet/game) to `Music.setScene(view, variant)`.

Mute: 🎵 topbar button → `localStorage['slimegachi:music-muted']` (independent of SFX; when muted the scheduler stops entirely). Music sits below SFX in the mix (`ACTIVE_GAIN`).

---

## Things that are intentional, not bugs

A grab-bag of things that look like inconsistencies but are deliberate design choices:

- **Pets never die.** Stats bottom out at 0; mood gets "Sad"; no punishment beyond that. SLIMEgachi is gentle.
- **Decay continues offline.** The math runs on wall-clock time, so a pet left for 8 hours will be very hungry. By design — encourages daily care.
- **Owl is nocturnal.** Its day/night palettes and sleep window are inverted. Don't "fix" this — it's the personality.
- **Coins aren't $SLIME.** They're a game-internal currency. A separate task (when wallet integration ships) will optionally bridge to the real $SLIME token, but the game logic stays decoupled from on-chain value.
- **Achievements only fire once per save.** Re-earning isn't possible; we don't want farming for repeated airdrops.
- **Quest slate is random.** Same player on the same day across two devices would get different slates if they connected at different times. The slate is anchored to first-of-day generation, not deterministic per-account. (Backend storage will fix this when it ships.)
- **`stubMode` is for the demo, not for production.** It mocks 2 pets so the game is playable without a wallet. In production with a connected wallet, stub mode is never entered.
- **Mintable badges have disabled Claim buttons.** Intentional — the claim flow needs wallet integration that lives outside the widget. Disabled-with-tooltip is the right UX until that lands.

---

## Numbers I'd be careful about changing

Some of the constants are tuning, but a few have downstream consequences:

- **`PASSIVE_DECAY_MULTIPLIER` (0.4)** — if you raise this, shelf pets neglect themselves much faster. Players will hate it.
- **Mood thresholds (30 / 75)** — if you narrow these, "Thriving" becomes unreachable and the `whisperer` achievement gets locked away.
- **Level thresholds** — the curve is intentionally steep at the end (140 → 200 → 280) so Lv 10 represents real long-term dedication. Flattening the curve cheapens it.
- **Mini-game duration (30s)** — calibrated against the coin payout formula. Shortening means rewards drop proportionally; lengthening means it becomes a chore.
- **Sleep window penalty (0.5×)** — strong enough to matter, gentle enough that a player who fed a pet at the wrong time isn't punished disproportionately.
- **Owl sleep window (08:00–16:00)** — the inversion is the whole personality, not a number to tune.

If you do change one of these, also update this doc.
