# SLIMEgachi

A virtual-pet game widget for the SLIME NFT collection on Hedera. Vanilla JS, zero runtime dependencies, drop-in for any page.

**Other docs:**
- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — full mechanics spec (decay rates, level thresholds, quest pool, reward formulas, internal event taxonomy)
- [`docs/ADDING_A_PET.md`](docs/ADDING_A_PET.md) — step-by-step runbook for unlocking Owl/Dragon at mint 2, or adding a brand-new pet type
- [`CHANGELOG.md`](CHANGELOG.md) — version history

---

## Quick start (60 seconds)

```html
<link rel="stylesheet" href="slimegachi.css">
<div id="slimegachi"></div>
<script src="slimegachi.js"></script>
<script>
  const game = SLIMEgachi.mount(document.getElementById('slimegachi'));
</script>
```

That's it. The widget renders with a stub holder so you can play immediately. Pets are Kitten and Monkey; locked teaser slots are Owl and Dragon (mint 2).

To wire in a real wallet, see [Wallet integration](#wallet-integration) below.

---

## File layout

```
slimegachi/
├── README.md                           ← this file
├── CHANGELOG.md
├── docs/
│   ├── GAME_DESIGN.md                  ← mechanics spec (decay, levels, quests)
│   └── ADDING_A_PET.md                 ← runbook for adding a new pet
├── dist/
│   ├── slimegachi.js                   ← drop-in widget (~165 KB)
│   ├── slimegachi.css                  ← scoped styles (~30 KB)
│   └── slimegachi.standalone.html      ← single-file demo, no deps
├── src/
│   ├── slimegachi.js                   ← source for dist/slimegachi.js
│   └── slimegachi.css                  ← source for dist/slimegachi.css
├── assets/
│   └── pet-art/                        ← original SVG art (with named layers)
├── examples/                           ← integration patterns
└── scripts/build.js                    ← rebuild dist/ from src/
```

Use the **`dist/` files** for integration. Edit the **`src/` files** if you want to customize, then run `node scripts/build.js` to rebuild dist.

The standalone HTML is for demos and the Claude sandbox preview — it inlines everything into a single file.

---

## The mount API

```js
const game = SLIMEgachi.mount(container, options);
```

`container` is a DOM element that will hold the widget. Pick something with a defined size (widget is mobile-first, designed around 540×960 max).

`options` is an object — all keys optional:

```js
SLIMEgachi.mount(container, {
  // Hedera config
  tokenId: '0.0.9474754',           // SLIME NFT token ID
  mirrorNodes: [...],               // override default endpoints
  ipfsGateways: [...],              // override default IPFS gateways

  // Wallet integration (see below)
  accountId: null,                  // pass when wallet is connected
  getOwnedPets: async (id) => [],   // override the default Mirror Node fetch

  // Storage (see below)
  storage: { load, save, remove },  // defaults to localStorage

  // Theming
  theme: {                          // any CSS variable, minus the prefix
    accent: '#00a1d4',
    coin: '#fed600',
    bg_top: '#2a1f3f'
  },

  // Art overrides
  petArt: {                         // any subset; merged with embedded defaults
    Kitten: 'https://...',          //   URL or data URI
    Monkey: 'https://...',
    Owl:    'https://...',
    Dragon: 'https://...'
  },

  // Dev panel — shows time/skip/reset controls
  showDevPanel: false,

  // Event hooks (see below)
  events: {
    onCareAction:       (e) => {},
    onAchievement:      (e) => {},
    onCoinsChanged:     (e) => {},
    onMiniGameComplete: (e) => {},
    onPetOpen:          (e) => {},
    onShelfReturn:      (e) => {},
    onError:            (e) => {}
  }
});
```

### Instance methods

The returned `game` object exposes:

```js
await game.setAccountId(accountId)  // when wallet connects
await game.disconnect()             // back to stub mode
game.openPet(serial)                // deep-link a specific pet
game.getState()                     // read-only snapshot
game.destroy()                      // unmount and clean up
```

The `getState()` snapshot shape:

```js
{
  account:      string | null,
  view:         'shelf' | 'care' | 'minigame',
  activeKey:    string | null,        // e.g. 'stub-Kitten-274'
  ownedPets:    [{ pet, serial, name, image, traits }, ...],
  coins:        number,
  loginStreak:  number,
  achievements: { id: { unlockedAt, claimed }, ... },
  pets:         { key: { stats, sick, care_count, name, ... }, ... },
  quests:       { day: '2026-05-30', slate: [{ id, progress, claimed }, ...] },
  collection:   { totalActions, foodsTried, gamesPlayed, milestonesReached }
}
```

`SLIMEgachi.version` is a string on the namespace, useful for debugging compatibility (`'1.7.0'` at the time of writing).

---

## Wallet integration

The widget intentionally does **not** include any wallet-connection UI. You're expected to handle wallet connection on your side and tell the widget which account is active.

### Minimum integration: just an account ID

```js
const game = SLIMEgachi.mount(container);

// When HashConnect / WalletConnect / etc. signs in:
yourWallet.on('connect', (account) => game.setAccountId(account));
yourWallet.on('disconnect', () => game.disconnect());
```

The widget will use its default `getOwnedPets` implementation, which queries Hedera's public Mirror Node and resolves NFT metadata via IPFS gateways. It looks for the `Head` attribute in each NFT's metadata and includes any pet whose value matches an `available` pet (Kitten or Monkey currently).

### Custom integration: override `getOwnedPets`

If you already query Mirror Node yourself, or want to point at a paid/private endpoint, or want to cache results, supply your own:

```js
const game = SLIMEgachi.mount(container, {
  async getOwnedPets(accountId) {
    // Return [] if nothing held
    return [
      {
        pet: 'Kitten',                       // must match a PET_DEFS key
        serial: 274,                          // NFT serial number
        name: 'SLIME #274',                   // display name
        image: 'ipfs://...',                  // (optional) IPFS image URL
        traits: { Color: 'Purple' /* … */ }   // (optional) full trait map
      }
    ];
  }
});
```

The widget calls this once on mount and again on `setAccountId(newId)`. It does *not* poll — call `setAccountId(currentId)` again to refresh after a known wallet event.

### Mirror Node and IPFS overrides

```js
SLIMEgachi.mount(container, {
  mirrorNodes: [
    'https://your-private-mirror.example/api/v1',
    'https://mainnet-public.mirrornode.hedera.com/api/v1'
  ],
  ipfsGateways: [
    'https://your-pinata.mypinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/'
  ]
});
```

Arrays are tried in order; first success wins.

---

## Storage

State is persisted to `localStorage` (by default) under **two kinds of key**, so a pet's care history follows the NFT rather than the wallet:

- **Per-pet** — `pet:{tokenId}:{serial}` — stats, sick flag, care count, name. Keyed by the NFT, so it survives trades and syncs across devices (any holder of serial #274 loads the same record). Demo/stub play is namespaced separately as `demo:pet:…` and never touches real records.
- **Per-player** — `player:{accountId}` — coins, login streak, achievements, daily quests, collection stats. Inherently per-person, so it stays with the account.

That's the production-shaped split out of the box. See [Storage architecture](#storage-architecture) below for the matching backend schema.

### Custom storage adapter

```js
SLIMEgachi.mount(container, {
  storage: {
    async load(key) {
      const res = await fetch('/api/slimegachi/' + key);
      return res.ok ? res.json() : null;
    },
    async save(key, data) {
      await fetch('/api/slimegachi/' + key, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      return true;
    },
    async remove(key) {
      await fetch('/api/slimegachi/' + key, { method: 'DELETE' });
      return true;
    }
  }
});
```

The widget calls `load()` once on account change, `save()` debounced (~800 ms) after state mutations, and `remove()` only via the dev panel's reset button.

---

## Events

All event handlers receive a single object. Each is fired only once per occurrence; no polling.

| Event                    | Fires when                            | Payload                                                            |
|--------------------------|---------------------------------------|--------------------------------------------------------------------|
| `onCareAction`           | Feed / Play / Sleep / Clean completes | `{ action, food?, petSerial, petType, stats }`                     |
| `onAchievement`          | A badge unlocks                       | `{ id, name, mintable }`                                           |
| `onCoinsChanged`         | Balance changes                       | `{ balance, delta, reason }`                                       |
| `onMiniGameComplete`     | Mini-game round ends                  | `{ game, score, coins, happy, forfeit }`                           |
| `onPetOpen`              | Player enters care screen             | `{ petSerial, petType }`                                           |
| `onShelfReturn`          | Player returns to shelf               | `{}`                                                               |
| `onError`                | Mirror/IPFS/getOwnedPets fails        | `{ code, message }`                                                |

### Common use cases

**Mint an NFT badge when an achievement fires:**
```js
events: {
  onAchievement: (e) => {
    if (e.mintable) yourBackend.queueBadgeAirdrop(currentAccount, e.id);
  }
}
```

**Sync to your backend after every care action:**
```js
events: {
  onCareAction: (e) => yourBackend.recordCare(currentAccount, e)
}
```

**Analytics fire-and-forget:**
```js
events: {
  onPetOpen: (e) => analytics.track('Pet Opened', e),
  onMiniGameComplete: (e) => analytics.track('Game Complete', e)
}
```

**Error logging:**
```js
events: {
  onError: (e) => {
    if (e.code === 'mirror_unreachable') showRetryBanner();
    else console.warn('[SLIMEgachi]', e);
  }
}
```

### Error codes from `onError`

| Code                    | Meaning                                                  |
|-------------------------|----------------------------------------------------------|
| `account_not_found`     | Mirror Node returned 404 for the account ID              |
| `mirror_unreachable`    | All mirror endpoints failed                              |
| `no_nfts`               | Account exists but holds zero SLIME NFTs                 |
| `no_playable_pets`      | Holds SLIME NFTs but none with Kitten or Monkey heads    |
| `getOwnedPets_threw`    | Your custom `getOwnedPets` implementation threw an error |

---

## Theming

CSS variables on `.slimegachi-root` are overridable via the `theme` option (drop the `slimegachi-` prefix):

```js
SLIMEgachi.mount(container, {
  theme: {
    accent: '#ff0080',       // primary brand color
    coin:   '#ffd700',       // currency display
    text:   '#ffffff',
    bg_top: '#1a1428',       // gradient top
    bg_bot: '#000000'        // gradient bottom
  }
});
```

Full list of overridable variables:

| Variable    | Default      | Purpose                       |
|-------------|--------------|-------------------------------|
| `accent`    | `#00a1d4`    | Buttons, highlights, mood    |
| `coin`      | `#fed600`    | Currency, achievements       |
| `text`      | `#f4ecd8`    | Main text                    |
| `muted`     | `#a98ed4`    | Secondary text               |
| `dim`       | `#6a5882`    | Tertiary / disabled text     |
| `danger`    | `#ff5577`    | Low stat warnings, errors    |
| `success`   | `#7fffd4`    | Positive state, free items   |
| `favorite`  | `#ffb3d9`    | Pet's favorite items         |
| `bg_top`    | `#2a1f3f`    | Background gradient top      |
| `bg_bot`    | `#1a1428`    | Background gradient bottom   |

Day/night cycle overrides `bg_top` and `bg_bot` automatically on the care screen. Per-pet sky palettes are baked into `PET_DEFS` inside the widget — if you need to change them, fork the source.

---

## Sizing & layout

The widget's root has `max-width: 540px` and `max-height: 960px`. Its container should give it room — usually a flex/grid cell or a fixed-size div.

```css
/* Full-screen route */
#slimegachi { width: 100vw; height: 100vh; }

/* Embedded panel */
#slimegachi { width: 100%; aspect-ratio: 9 / 16; max-height: 80vh; }

/* Modal-launched */
#slimegachi { width: 100%; height: 100%; } /* inside your modal */
```

The widget is mobile-portrait first. It does work on desktop but centers within its max dimensions; consider wrapping in a scaled frame if you want it bigger on desktop.

---

## Storage architecture

Important context for whoever's wiring this into a production site:

**Default (localStorage)**: the key scheme is already production-shaped — per-pet state keyed by `{tokenId, serial}`, per-player state by `{accountId}` (see [Storage](#storage)). What localStorage *can't* do is persist server-side or sync across devices: it lives per browser, per origin, and clears with cookies.

**For production**, pass a `storage` adapter that hits your backend using those same keys. Because pet state is already keyed by `{tokenId, serial}`, no game logic changes:
- State persists when an NFT trades (new owner inherits care)
- State persists across devices (sign in anywhere, see your pet)
- You can build leaderboards, cross-holder features, etc.

The two key kinds map 1:1 onto the two tables below — `pet:{tokenId}:{serial}` → `slimegachi_pets`, `player:{accountId}` → `slimegachi_players`:

```sql
create table slimegachi_pets (
  token_id      text not null,
  serial        int  not null,
  owner_account text not null,    -- refreshed from Mirror Node
  pet_type      text not null,    -- 'Kitten' | 'Monkey' | etc
  stats         jsonb not null,   -- { hunger, happy, energy, clean }
  last_tick     timestamptz,
  sick          boolean default false,
  custom_name   text,
  primary key (token_id, serial)
);

create table slimegachi_players (
  account_id      text primary key,
  coins           int default 0,
  login_streak    int default 0,
  last_login_day  date,
  achievements    jsonb default '{}'::jsonb,
  thriving_start  timestamptz
);
```

Pass a custom `storage` adapter that hits your backend, and the widget will use it without any logic changes.

**Cheat resistance**: localStorage state is editable in dev tools — fine for v1 since no value is at stake. If/when achievements drive real NFT airdrops, validate `onAchievement` events server-side (don't trust the client to say "I unlocked the Devoted Caretaker badge" — re-derive it from the care log).

---

## Browser support

- Safari 13+ / iOS 13+
- Chrome 75+
- Firefox 70+
- Edge (Chromium-based)

No IE11. No polyfills required. Uses `async/await`, optional chaining, `Object.fromEntries`, `Object.entries`, ES2019 generally.

---

## What's in the game

Two pets playable today (Kitten, Monkey), two locked teasers (Owl, Dragon) for the next mint. Each pet has:

- Independent stats (Hunger, Happy, Energy, Clean) that decay over real time
- A favorite food (1.5× boost) and a favorite mini-game (also 1.5× boost)
- A bedtime / sleep window (Owl is nocturnal — its hours are inverted)
- Personality-tuned decay rates (Monkey is high-maintenance, Owl is chill)
- Per-pet day/night sky palettes that tint the background by time of day
- Independent per-pet leveling — stats, coins, and milestones tracked separately per NFT

Mechanics depth (see `docs/GAME_DESIGN.md` for the full spec):

- **Stats & decay**: four stats per pet, decay rates depend on pet and active/passive status. Sick state accelerates decay; pet level slows it
- **Mood**: derived from average stat — Sad < 30 < Content < 75 < Thriving; or Sleepy when energy < 18
- **Sleep windows**: each pet has hours when actions get bonuses/penalties; Owl is inverted (nocturnal)

Features:

- **Mini-games**: Bubble Pop (Kitten's favorite) and Banana Catch (Monkey's favorite) — Owl/Dragon games come with mint 2. Each rewards Happy + Coins on a curve from score
- **Daily Quests**: 3-quest slate refreshed at local midnight, pool of 9 templates. Coin rewards on claim; visual notification dot on shelf when claimable
- **Pet leveling**: per-pet care_count drives 10 levels with thresholds at 5/12/22/35/50/70/100/140/200/280 actions. Each level grants coins + a permanent 1% decay reduction (cap 10%)
- **Collection**: career stats screen — actions taken, milestones reached, achievements unlocked, foods tried, mini-games played, pet types cared for, highest level, login streak
- **Currency**: Coins earned from login streaks, mini-games, quest claims, level-ups, milestones, found-coin events; spent on food/toys
- **Shop**: Snack (free), Burger, Banana, Cake, Medicine (cures Sick state), Toy Ball
- **Achievements**: 7 badges, 2 flagged as mintable for NFT airdrops
- **Speech bubbles**: pet "talks" based on mood and time of day; mouth animates while talking
- **Random events**: Found a Coin, Pet is Sick, Treasure (5-day streak)
- **Day/night cycle**: real local time drives sky tint and sleep windows
- **Animation depth**: breathing math, mood-based filters, blink (3-7.5s intervals + occasional double-blink), pupil tracking (eyes follow cursor/touch), mouth chew on feed + talk on speech, happy head-sway when Thriving for >5s, emote floaters (favorite food, achievements, care actions)
- **Persistence**: state survives reloads via localStorage by default; pluggable storage adapter for backend use

---

## Versioning

```js
SLIMEgachi.version  // → '1.7.0'
```

The widget follows semver loosely: minor versions add features without breaking the public API; saved player data backfills missing fields with safe defaults across versions. See `CHANGELOG.md` for the full history.

---

## Rebuilding from source

```bash
node scripts/build.js
```

Produces `dist/slimegachi.js`, `dist/slimegachi.css`, and `dist/slimegachi.standalone.html` from sources. No npm dependencies for the build itself.

---

## Known limitations / future work

- **No HashPack/WalletConnect integration** — by design; you wire it up
- **No backend storage adapter shipped** — interface is pluggable, reference Supabase adapter pending
- **Two mini-games (Bubble Pop, Banana Catch)** — Owl and Dragon get their own when mint 2 ships; architecture supports more
- **No multiplayer / cross-account features** — pet visiting, gifting, breeding, leaderboards
- **Mintable badges have no claim flow** — buttons exist, are disabled until you wire your backend
- **No on-chain achievements** — needs your wallet stack to actually airdrop NFT badges
- **No sound** — design call for v1.x; Web Audio synth (no asset files) planned

The architecture is built to extend cleanly into each of these. The internal event bus added in v1.5 (`emitInternal`/`onInternal`) makes adding new cross-cutting systems straightforward — see `docs/GAME_DESIGN.md` for the event taxonomy.

— Kris / BuiltBySlime
