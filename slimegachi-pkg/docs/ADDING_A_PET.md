# Adding a New Pet

A step-by-step runbook for when mint 2 ships (unlock Owl + Dragon) or when adding a new pet type entirely.

For game mechanics context, read `GAME_DESIGN.md` first.

---

## Two scenarios

### Scenario A: Unlocking a currently-locked pet

For Owl and Dragon, the art is already in `assets/pet-art/` and the `PET_DEFS` entries exist with `status: 'locked'`. Unlocking is mostly a flag flip + augmenting the SVG with named layers.

### Scenario B: Adding a brand-new pet type

For a new species that doesn't exist in the codebase yet — a Frog, a Bunny, whatever. Requires art, full `PET_DEFS` entry, all the metadata, and (eventually) NFT minting on Hedera with the new `Head` trait value.

The steps below cover both, with markers for "Scenario B only" where needed.

---

## Prerequisites

- The pet's name must match exactly the `Head` trait value in the NFT metadata. Case-sensitive. If the NFTs say `"Head": "Owl"`, the `PET_DEFS` key must be `Owl`. No translation step in the widget.
- The SVG art must be a viewBox-coordinated single-file SVG. No rasters, no external font deps, no `<image>` tags. The build script base64-encodes it whole and embeds it in the widget.
- For Scenario B, you need the NFTs minted with the new `Head` trait *before* the widget will see them in production. In dev/stub mode you can preview without minting.

---

## Step 1: Draw the SVG

The art lives in `assets/pet-art/{petname}.svg` (lowercase filename).

### Style guide

- **Chibi proportions**: oversized head, small body. Roughly 60% of the viewBox should be the head/face.
- **viewBox**: aim for ~55×55 to ~65×65 units. Existing pets: Kitten 56×54, Monkey 58×54, Owl 54×58, Dragon 62×66. Doesn't have to match — the widget scales it.
- **Color palette**: bold, ~3-4 main colors. Look at the existing pets — strong outlines, flat fills, minimal gradients. The SLIME brand is graphic, not painterly.
- **Eyes**: prominently sized — they're the most-animated feature. Round or almond-shaped, with distinct iris/pupil paths and ideally a small highlight dot.
- **Mouth**: a small but separable shape — a curve, a "y", or a dot. Will be wrapped in `<g class="sg-mouth">` for chew animation.
- **No baked-in lighting**: keep shading flat. The CSS layer applies mood filters (saturate, hue-rotate, brightness) and dynamic lighting via the background gradient. Pre-baked shadows fight with this.

### Required separable elements

For animation to work, certain features need to be *isolated paths* in the SVG. Don't merge them into the body fill.

- **Left pupil** — must be a single `<ellipse>` or `<path>` element
- **Right pupil** — single element
- **Left eye socket / white** — single element (or named group)
- **Right eye socket / white** — single element
- **Mouth** — single path

If your art has these compound-pathed into the body, the augmentation pass below will fail. Best to draw the eyes and mouth as separate layers from the start. Most vector editors (Illustrator, Figma, Inkscape) keep layers separate by default.

### Nice-to-have separable elements

These aren't yet animated but might be in future updates:

- **Tail** — own layer, transform origin at the tail base
- **Ears** — left and right as separate layers, transform origin at ear base
- **Wings** (for flying pets) — left and right
- **Accent details** — horns, antennae, etc.

If you draw these separable now, future-you (or future Claude) can wire them up later.

---

## Step 2: Augment the SVG with named layer classes

Once the raw SVG is saved to `assets/pet-art/{petname}.svg`, we need to wrap the eye/pupil/mouth elements in named groups so the widget can manipulate them.

There's a Python script approach the project has used before — see `/home/claude/aug_kitten.py` and `aug_monkey.py` for the pattern. The TL;DR:

### What classes to add

```html
<!-- Pupils (wrap each pupil in its own group, transform-origin centered) -->
<g class="sg-pupil sg-pupil-left" style="transform-box:fill-box;transform-origin:center">
  <ellipse cx="..." cy="..." rx="..." ry="..."/>
</g>
<g class="sg-pupil sg-pupil-right" style="transform-box:fill-box;transform-origin:center">
  <ellipse cx="..." cy="..." rx="..." ry="..."/>
</g>

<!-- Eye sockets / whites (each gets an "open" wrapper + a hidden "closed" sibling) -->
<g class="sg-eye-open sg-eye-left">
  <path .../>  <!-- original eye white -->
</g>
<g class="sg-eye-closed sg-eye-left" style="display:none">
  <path d="M{x1},{y1} Q{cx},{cy} {x2},{y2}"
        fill="none" stroke="#000" stroke-width="0.9" stroke-linecap="round"/>
</g>
<!-- Same for right -->

<!-- Mouth (wrap the existing mouth path) -->
<g class="sg-mouth" style="transform-box:fill-box;transform-origin:center">
  <path .../>  <!-- original mouth -->
</g>
```

### How to write the "closed eye" arc

A simple Quadratic Bezier curve from the left edge of the eye to the right edge, with a control point slightly below the middle. The result is a downward-curving lash.

If the original eye spans `x = 6 to 14` and `y ≈ 22`, the closed-eye path is:

```
d="M6,22 Q10,25 14,22"
```

Translated: move to (6,22), draw a quadratic curve with control point (10,25) ending at (14,22). The control point being *below* the start/end Y is what makes the curve sag like a closed eye.

Adjust the X span and the control point Y offset to suit the pet's eye size and style. Bigger eyes get more sag.

### Augmentation script template

Save as `/home/claude/aug_{petname}.py`:

```python
from pathlib import Path

SRC = Path('/home/claude/slimegachi-pkg/assets/pet-art/{petname}.svg')
svg = SRC.read_text()

# === Pupils ===
# Find each pupil in the source and wrap it. The exact verbatim string match
# is required — copy the SVG line as-is, then paste it into both sides of the replace.

LEFT_PUPIL = '<ellipse cx="..." cy="..." rx="..." ry="..."/>'  # paste actual line
svg = svg.replace(
    LEFT_PUPIL,
    '<g class="sg-pupil sg-pupil-left" style="transform-box:fill-box;transform-origin:center">'
    + LEFT_PUPIL +
    '</g>'
)

RIGHT_PUPIL = '<ellipse cx="..." cy="..." rx="..." ry="..."/>'  # paste actual line
svg = svg.replace(
    RIGHT_PUPIL,
    '<g class="sg-pupil sg-pupil-right" style="transform-box:fill-box;transform-origin:center">'
    + RIGHT_PUPIL +
    '</g>'
)

# === Eyes (open + closed) ===
LEFT_EYE = '<path class="cls-X" d="..."/>'  # paste eye-white path
svg = svg.replace(
    LEFT_EYE,
    '<g class="sg-eye-open sg-eye-left">' + LEFT_EYE + '</g>'
    '<g class="sg-eye-closed sg-eye-left" style="display:none">'
    '<path d="Mx1,y1 Qcx,cy x2,y2" fill="none" stroke="#000" stroke-width="0.9" stroke-linecap="round"/>'
    '</g>'
)
# ... same for RIGHT_EYE

# === Mouth ===
MOUTH = '<path d="..."/>'  # paste mouth path
svg = svg.replace(
    MOUTH,
    '<g class="sg-mouth" style="transform-box:fill-box;transform-origin:center">'
    + MOUTH +
    '</g>'
)

# Verify
assert 'sg-pupil-left' in svg, 'Left pupil wrap failed'
assert 'sg-pupil-right' in svg, 'Right pupil wrap failed'
assert 'sg-eye-open sg-eye-left' in svg, 'Left eye wrap failed'
assert 'sg-eye-closed sg-eye-left' in svg, 'Left closed-eye wrap failed'
assert 'sg-mouth' in svg, 'Mouth wrap failed'

SRC.write_text(svg)
print('Done — wrote', len(svg), 'bytes')
```

The fragile part is that `svg.replace()` requires an **exact verbatim match** of the original line. Open the SVG in a text editor, copy the line as-is including all decimals, paste it into the script. If the build step fails, it's almost always because the line wasn't matched exactly.

---

## Step 3: Verify the SVG visually

Render both the open-eye and closed-eye states to PNGs and look at them. The eye-tracking will work in the browser even if the static render looks slightly off (because the runtime hides the pupils when blinking), but it's worth checking the closed-eye arc is in the right place.

```python
import cairosvg
src = open('/home/claude/slimegachi-pkg/assets/pet-art/{petname}.svg').read()

# Open
cairosvg.svg2png(bytestring=src.encode('utf-8'), output_width=400, write_to='/tmp/{petname}_open.png')

# Closed (swap display props)
closed = src.replace('class="sg-eye-open sg-eye-left"', 'class="sg-eye-open sg-eye-left" style="display:none"')
closed = closed.replace('class="sg-eye-open sg-eye-right"', 'class="sg-eye-open sg-eye-right" style="display:none"')
closed = closed.replace('class="sg-eye-closed sg-eye-left" style="display:none"', 'class="sg-eye-closed sg-eye-left"')
closed = closed.replace('class="sg-eye-closed sg-eye-right" style="display:none"', 'class="sg-eye-closed sg-eye-right"')
cairosvg.svg2png(bytestring=closed.encode('utf-8'), output_width=400, write_to='/tmp/{petname}_closed.png')
```

The closed-eye render will still show pupils on top of the lashes (because of how the static CSS works), but the runtime hides them. Don't worry about that mismatch.

---

## Step 4: Add or update the `PET_DEFS` entry

In `src/slimegachi.js`, find the `PET_DEFS` block and add/update the entry.

### Schema

```js
PetName: {
  id:            'PetName',           // must match the key
  label:         'PetName',           // display name
  status:        'available' | 'locked',   // 'locked' shows on shelf as a teaser
  accent:        '#hexcolor',         // accent color used in feedback
  sublabel:      'Mint 2',            // optional, shown on locked tiles
  decay: {
    hunger:  number,  // points per hour
    happy:   number,
    energy:  number,
    clean:   number
  },
  favoriteFood:  'snack' | 'banana' | 'burger' | 'cake',  // 1.5× bonus food
  favoriteGame:  'bubblepop' | 'bananacatch' | ...,        // 1.5× bonus mini-game
  bouncyness:    number,              // 0.3–1.5, multiplies bounce amplitude
  sleepWindow:   [startHour, endHour],  // 24h format. Cross midnight: [22, 6]
  skyDay:        ['#topHex',  '#botHex'],  // gradient palette during day
  skyDusk:       ['#topHex',  '#botHex']   // gradient palette at night
}
```

### Calibration notes

- **Decay rates**: aim for an average of ~12 across the four stats for a baseline pet (Kitten averages 11). High-maintenance pets average ~15 (Monkey, Dragon). Chill pets average ~7 (Owl).
- **`bouncyness`**: governs the play-bounce height. Heavy/slow pets get 0.3 (Owl), normal 0.6-0.9, hyperactive 1.2 (Monkey).
- **`favoriteFood`**: pick one from the existing FOODS list. If your pet should love something new, add it to the FOODS dictionary first (see "Adding a new food" below).
- **`favoriteGame`**: must match a registered mini-game ID. If your pet should have a new game, see "Adding a new mini-game" below.
- **`sleepWindow`**: realistic for the species' personality. Crepuscular (Monkey: 22-7) is gentle for players. Nocturnal (Owl: 8-16) is a personality statement.
- **`skyDay` / `skyDusk`**: each is a `[topHex, botHex]` gradient pair. Day is bright, dusk is dark. For nocturnal pets (Owl), invert these — day palette is dark, dusk palette is bright.

### Don't forget

- Add the pet's display order to `PET_ORDER` at the bottom of the constants block: `const PET_ORDER = ['Kitten', 'Monkey', 'Owl', 'Dragon']`. Append your new pet to this list.

---

## Step 5: Add speech bubble lines

In `src/slimegachi.js`, find the `SPEECH` block and add a new top-level entry keyed by the pet's `id`. Four mood pools each, 4-5 lines per pool.

```js
PetName: {
  happy:  ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
  okay:   ['line 1', 'line 2', 'line 3', 'line 4'],
  sad:    ['line 1', 'line 2', 'line 3', 'line 4'],
  sleepy: ['line 1', 'line 2', 'line 3', 'line 4']
}
```

Voice notes:
- **Happy** is upbeat — affection, requests for play, vocalizations
- **Okay** is neutral — observations, ambient noises
- **Sad** is needy — requests for food/attention, complaints
- **Sleepy** is drowsy — yawns, half-formed thoughts

Each pet should have a distinct voice. Kitten purrs and mrrps. Monkey shrieks and ooks. Owl is wise and laconic. Dragon is hoarsely intense. Pick a vibe.

---

## Step 6: (Scenario A — unlock only) Flip the status flag

For Owl or Dragon, just change `status: 'locked'` to `status: 'available'` in the existing `PET_DEFS` entry. Remove the `sublabel: 'Mint 2'` line (or leave it — it only renders when locked).

---

## Step 7: (Optional) Add a new mini-game

If the pet's `favoriteGame` is a new game ID, you need to actually build the game.

Pattern: each mini-game is a module with `start()`, `stop(forfeit)`, and `loop()` methods. See `BubblePop` and `BananaCatch` in `src/slimegachi.js` as templates.

The skeleton:

```js
const NewGame = {
  active: false, items: [], score: 0, startedAt: 0, duration: 30000,
  rafId: null, ctx: null, canvas: null, width: 0, height: 0, _handler: null,

  start() {
    // Set up canvas, register input handlers, $('minigame-title').textContent = 'Game Name'
    // Initial state, then this.loop()
  },
  stop(forfeit) {
    // Clean up handlers, compute rewards via the standard formula:
    //   happy = min(35, max(forfeit ? 5 : 10, floor(score * 0.4)))
    //   coins = floor(score * 0.25 * (State.toyBuff ? 1.5 : 1.0))
    // Apply favBonus 1.5× to happy if pet's favoriteGame matches your ID
    // Emit: safeEmit('onMiniGameComplete', {...}); emitInternal('minigame_complete', {...});
    // Show the result screen
  },
  loop() {
    // Per-frame: update items, draw, requestAnimationFrame(this.loop)
    // Check `remaining <= 0` and call this.stop(false) when time runs out
  }
};
```

Register it in `pickGameForPet()`:

```js
function pickGameForPet(pet) {
  const def = PET_DEFS[pet];
  if (def && def.favoriteGame === 'bananacatch') return BananaCatch;
  if (def && def.favoriteGame === 'hootmatch')  return HootMatch;   // <- new
  return BubblePop;
}
```

If the game has its own achievement (like "score 100+ in X"), add it to the `ACHIEVEMENTS` catalog and fire it from `stop()`.

---

## Step 8: (Optional) Add a new food

If the pet should have a unique favorite food, add it to the `FOODS` block:

```js
foodId: {
  id: 'foodId', name: 'Food Name', icon: '🍌',
  cost: number,        // 0 for free, otherwise coin cost
  hunger: number,      // points restored (or negative)
  happy: number,
  clean: number,       // usually 0 or negative
  desc: 'Short label',
  healsSick: boolean,  // true for medicine-style items
  isToy: boolean       // true for toy-style items (consumed differently)
}
```

The shop and feed modals pick this up automatically (they iterate FOODS).

---

## Step 9: Rebuild and test

```bash
node scripts/build.js
```

This regenerates `dist/slimegachi.js` (with the new SVG base64-embedded), `dist/slimegachi.css`, and the standalone HTML.

Open the standalone HTML and verify:

- The pet appears on the shelf (correct art, correct label)
- Tapping it enters care screen (correct art renders, fills the frame properly)
- Eyes blink at natural intervals
- Pupils track your mouse
- Mouth chews when you feed the pet
- Speech bubbles cycle through the new lines
- Day/night cycle uses the new sky palettes (use the ⏰ time-jump dev button to verify)
- Sleep window correctly puts the pet to sleep (use ⏰ to fast-forward to its sleep time)

If anything breaks, the most common causes:

1. **SVG path replace didn't match verbatim** — the augmented file has wrong-named or missing layers
2. **PET_DEFS key doesn't match `Head` trait** — pet doesn't appear in stub mode
3. **PET_ORDER missing the new pet** — appears on shelf out of order or not at all
4. **Speech block missing** — pet talks "—" or empty bubbles
5. **`favoriteGame` references a game that doesn't exist** — Play button does nothing

---

## Step 10: (Scenario B only) Mint the NFTs

Out of scope for this widget — handled on the BuiltBySlime side via Hedera Token Service.

When minting, the metadata must include:

```json
{
  "name": "SLIME #...",
  "attributes": [
    { "trait_type": "Head", "value": "PetName" },
    ...other traits...
  ]
}
```

The `Head` trait value must match the `PET_DEFS` key exactly. Mismatch = pet doesn't render for holders.

---

## Checklist summary

For a brand-new pet (Scenario B), in order:

- [ ] Draw the SVG with separable eyes, pupils, mouth
- [ ] Save to `assets/pet-art/{petname}.svg`
- [ ] Write an augmentation script, run it
- [ ] Render before/after PNGs to verify visuals
- [ ] Add `PET_DEFS` entry with decay, favorites, sleep window, sky palettes
- [ ] Append to `PET_ORDER`
- [ ] Add `SPEECH` block with 4 mood-pool entries
- [ ] (Optional) Add new mini-game with `start`/`stop`/`loop`
- [ ] (Optional) Register the new game in `pickGameForPet`
- [ ] (Optional) Add a new achievement for the new game
- [ ] (Optional) Add a new food to `FOODS`
- [ ] `node scripts/build.js`
- [ ] Open standalone HTML and verify everything works
- [ ] Mint NFTs with `Head` trait matching the pet key

For unlocking an existing locked pet (Scenario A):

- [ ] Write augmentation script for the existing SVG (eyes + mouth)
- [ ] Verify visually
- [ ] Flip `status: 'locked'` → `'available'` in `PET_DEFS`
- [ ] Add speech bubbles (the existing PET_DEFS entries don't include them)
- [ ] (Optional) Build the pet's favorite mini-game if it's a new one
- [ ] Rebuild and test

That's it.
