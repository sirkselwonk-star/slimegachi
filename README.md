# SLIME.PETS — Slimegachi

The deployable home of **Slimegachi**, a Tamagotchi-style virtual-pet game for the SLIME NFT collection on Hedera. (Filesystem name is `SLIME.PETS`; the product name is Slimegachi.) Part of the SLIME family of projects.

`index.html` mounts the packaged Slimegachi widget — a zero-dependency, vanilla-JS game. Open it, click once (to unlock audio), and play: Kitten + Monkey are playable in stub mode; Owl + Dragon are locked mint-2 teasers.

---

## Repo layout

```
index.html              ← the deployed page; loads the widget from slimegachi/
slimegachi/             ← DEPLOYED build (what index.html actually serves)
  slimegachi.js         ←   copied from slimegachi-pkg/dist/
  slimegachi.css
slimegachi-pkg/         ← SOURCE-OF-TRUTH package (edit here)
  src/                  ←   slimegachi.js + slimegachi.css  ← edit these
  dist/                 ←   build output (generated)
  assets/pet-art/       ←   pet SVGs inlined into the build (kitten/monkey/owl/dragon)
  docs/                 ←   GAME_DESIGN.md, ADDING_A_PET.md
  examples/             ←   integration patterns (minimal / wallet / backend / react)
  scripts/build.js      ←   the build
  README.md             ←   widget integration contract (mount API, options, events)
  CHANGELOG.md
Pet 1–4.svg / .png      ← canonical hand-drawn 2D pets (originals); _convert.py makes PNGs
```

**Two copies of the widget, on purpose:** `slimegachi-pkg/` is where you edit and version the game; `slimegachi/` is the built bundle the page loads. Don't hand-edit `slimegachi/` or `slimegachi-pkg/dist/` — they're generated.

---

## Local dev

```sh
python -m http.server 8002
```

Then open http://localhost:8002/. (Port 8002 is SLIME.PETS' slot in the SLIME family; 8000 = SLIME.MAZING, 8001 = builder_pass_slab.)

Audio (SFX + music) only starts after the first click — browser autoplay policy.

---

## Make a change → ship it

The source lives in `slimegachi-pkg/src/`. After editing:

```sh
cd slimegachi-pkg
node scripts/build.js          # inlines pet-art SVGs → dist/  (+ standalone demo)
cd ..
cp slimegachi-pkg/dist/slimegachi.js  slimegachi/slimegachi.js
cp slimegachi-pkg/dist/slimegachi.css slimegachi/slimegachi.css
```

Then **bump the cache buster** in `index.html` — increment `?v=N` on the changed `<link>`/`<script>` tag(s). GitHub Pages serves stale modules otherwise. (Bump only what changed: CSS-only edit → bump the CSS tag.)

`node --check slimegachi-pkg/dist/slimegachi.js` is a quick syntax gate before deploying.

---

## The pets

The four canonical pets are **hand-drawn 2D creatures** (`Pet 1–4.svg` at the repo root are the originals; `slimegachi-pkg/assets/pet-art/` holds the build's working copies).

To add or unlock a pet, see [`slimegachi-pkg/docs/ADDING_A_PET.md`](slimegachi-pkg/docs/ADDING_A_PET.md).

---

## Integrating into a site (for the dev wiring this up)

The widget is deliberately **headless about wallet, auth, and storage** — it ships
no wallet UI and no backend, exposing plug-in points instead so it drops into an
existing tech stack. The four tie-in points, all documented in full in
[`slimegachi-pkg/README.md`](slimegachi-pkg/README.md):

- **Wallet / auth** — you own the connect flow; tell the widget the active account
  via `game.setAccountId(accountId)` / `game.disconnect()`. No wallet code lives in
  the game. (See *Wallet integration*.)
- **NFT ownership** — default reads Hedera Mirror Node + IPFS; override with a
  `getOwnedPets(accountId)` callback to use your own endpoint/cache. (See *Wallet
  integration → Custom integration*.)
- **Storage / database** — pet state defaults to `localStorage`; pass a `storage`
  adapter (`load`/`save`/`remove`) to persist to your backend. For production,
  key state by `{tokenId, serial}` (survives NFT trades + cross-device). A starter
  SQL schema is in the contract. (See *Storage* and *Storage architecture*.)
- **Events** — `onAchievement`, `onCareAction`, `onCoinsChanged`, etc. fire for
  backend sync, server-side validation, NFT badge airdrops, and analytics. (See
  *Events*.)

`game.getState()` gives a read-only snapshot for debugging/sync. The *Known
limitations* section lists exactly what's left to the integrator (HashPack/
WalletConnect, backend adapter, badge claim flow, on-chain achievements).

## More docs

- [`slimegachi-pkg/README.md`](slimegachi-pkg/README.md) — widget integration contract: `mount()` API, options, events, wallet/storage/theme plug-in points.
- [`slimegachi-pkg/docs/GAME_DESIGN.md`](slimegachi-pkg/docs/GAME_DESIGN.md) — full mechanics: decay, levels, quests, mini-games, the internal event bus, and the audio layer.
- [`slimegachi-pkg/CHANGELOG.md`](slimegachi-pkg/CHANGELOG.md) — version history.
