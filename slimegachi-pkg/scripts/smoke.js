#!/usr/bin/env node
/**
 * SLIMEgachi smoke test.
 *
 * Drives the built standalone demo (dist/slimegachi.standalone.html) in
 * headless Chromium and checks the things that have silently broken before:
 * the shelf, the care screen, vitals rings, eye layers, care actions, both
 * mini-games, every modal, persistence across a reload, and sleep / tap-to-wake.
 *
 * Usage:  node scripts/build.js && node scripts/smoke.js [--full]
 * Exits non-zero if any check fails. Needs the `playwright` package.
 * --full also plays a mini-game through its whole 30-second round.
 *
 * The clock is pinned (Date only; timers run normally) so the day/night
 * schedule and stat decay are deterministic.
 */
const path = require('path');
const { chromium } = require('playwright');

/* SMOKE_PAGE=<path> tests another build of the standalone demo. */
const PAGE = 'file://' + path.resolve(process.env.SMOKE_PAGE || path.join(__dirname, '..', 'dist', 'slimegachi.standalone.html'));
const NOON = new Date(2026, 5, 15, 12, 0, 0);
const NIGHT = new Date(2026, 5, 15, 2, 0, 0);

let failures = 0;
function check(name, ok, detail) {
  if (ok) { console.log('  ok    ' + name); return; }
  failures++;
  console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
}
const sg = (name) => '[data-sg="' + name + '"]';
const wait = (page, ms) => page.waitForTimeout(ms);

async function openPage(browser, when, errors, reset) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.clock.setFixedTime(when);
  await page.goto(PAGE + (reset ? '?reset=1' : ''));
  await page.waitForFunction(() => window.__game && window.__game.getState().ownedPets.length > 0);
  await wait(page, 300);
  return page;
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.getState())));
const hasClass = (page, sel, cls) => page.evaluate(([s, c]) => {
  const el = document.querySelector(s);
  return !!el && el.classList.contains(c);
}, [sel, cls]);
const openEyeParts = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-sg="petimg"] .sg-eye-open')]
    .filter((e) => getComputedStyle(e).display !== 'none').length);
async function click(page, sel) { await page.click(sel, { force: true }); }
async function openPet(page, index) {
  const slots = await page.$$('.slimegachi-slot.slimegachi-owned');
  await slots[index].click({ force: true });
  await wait(page, 600);
}
const activeStats = async (page) => { const s = await state(page); return s.pets[s.activeKey]; };

async function dayChecks(browser, errors) {
  console.log('Day (12:00) — fresh save');
  const page = await openPage(browser, NOON, errors, true);

  check('version is a semver string', /^\d+\.\d+\.\d+$/.test(await page.evaluate(() => window.SLIMEgachi.version)));
  check('shelf shows 4 slots', (await page.$$('.slimegachi-slot')).length === 4);
  check('2 owned, 2 locked', (await page.$$('.slimegachi-slot.slimegachi-owned')).length === 2 &&
    (await page.$$('.slimegachi-slot.slimegachi-locked')).length === 2);
  let s = await state(page);
  check('starts on the shelf in demo mode', s.view === 'shelf' && s.ownedPets.length === 2, s.view);
  const startCoins = s.coins;
  check('quest slate has 3 quests', s.quests.slate.length === 3, s.quests);

  /* ---- Care screen (Kitten) ---- */
  await openPet(page, 0);
  s = await state(page);
  check('opening a pet enters the care view', s.view === 'care' && !!s.activeKey, s.view);
  check('root carries the care class', await hasClass(page, '.slimegachi-root', 'slimegachi-care'));
  check('pet name is shown', (await page.textContent(sg('petname'))).trim().length > 1);
  check('status line is shown', /STATUS/i.test(await page.textContent(sg('petmood'))));
  const rings = await page.$$eval('.slimegachi-gauge-ring', (els) => els.map((e) => getComputedStyle(e).backgroundImage));
  check('4 vitals rings', rings.length === 4);
  check('vitals rings are drawn (conic gradient)', rings.every((b) => b.includes('conic-gradient')), rings.map((b) => b.slice(0, 30)));
  check('pet art is inline SVG', (await page.$$(sg('petimg') + ' svg')).length === 1);
  check('eyes open while awake', (await openEyeParts(page)) > 0);
  check('back button visible on care screen', await hasClass(page, sg('back'), 'slimegachi-show'));
  const fresh = await activeStats(page);
  check('fresh stats are 80/80/80/90', fresh.stats.hunger === 80 && fresh.stats.happy === 80 &&
    fresh.stats.energy === 80 && fresh.stats.clean === 90, fresh.stats);

  /* ---- Care actions ---- */
  await click(page, '[data-action="clean"]');
  await wait(page, 200);
  check('Clean tops clean up to 100', (await activeStats(page)).stats.clean === 100, (await activeStats(page)).stats);
  await click(page, '[data-action="sleep"]');
  await wait(page, 200);
  check('Sleep tops energy up to 100', (await activeStats(page)).stats.energy === 100, (await activeStats(page)).stats);
  await click(page, '[data-action="feed"]');
  await wait(page, 200);
  check('Feed opens the food picker', await hasClass(page, sg('feed-modal'), 'slimegachi-show'));
  check('food picker lists 5 foods (no toy)', (await page.$$(sg('feed-grid') + ' .slimegachi-shop-item')).length === 5);
  await click(page, sg('feed-grid') + ' .slimegachi-shop-item');   // cheapest first = free Snack
  await wait(page, 200);
  check('free Snack tops hunger up to 100', (await activeStats(page)).stats.hunger === 100, (await activeStats(page)).stats);
  check('food picker closes after feeding', !(await hasClass(page, sg('feed-modal'), 'slimegachi-show')));
  s = await state(page);
  check('First Steps achievement unlocked', !!(s.achievements.firstSteps && s.achievements.firstSteps.unlockedAt));
  check('topping up a satisfied pet earns no level progress', !((await activeStats(page)).care_count > 0), (await activeStats(page)).care_count);
  check('collection counted 3 care actions', s.collection.totalActions === 3, s.collection);

  /* ---- Mini-game: Bubble Pop ---- */
  await click(page, '[data-action="play"]');
  await wait(page, 400);
  check('Play enters the minigame view', (await state(page)).view === 'minigame');
  check('Kitten plays Bubble Pop', (await page.textContent(sg('minigame-title'))).trim() === 'Bubble Pop');
  check('back button hidden during the game', !(await hasClass(page, sg('back'), 'slimegachi-show')));
  const canvasSize = await page.$eval(sg('minigame-canvas'), (c) => [c.width, c.height]);
  check('game canvas is sized', canvasSize[0] > 100 && canvasSize[1] > 100, canvasSize);
  await wait(page, 1200);
  const box = await (await page.$(sg('minigame-canvas'))).boundingBox();
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(box.x + box.width * (0.15 + 0.06 * i), box.y + box.height * (0.3 + 0.04 * (i % 5)));
  }
  await click(page, sg('minigame-exit'));
  await wait(page, 300);
  check('Exit shows the results panel', await hasClass(page, sg('miniresult'), 'slimegachi-show'));
  check('results show a numeric score', /^\d+$/.test((await page.textContent(sg('miniresult-score'))).trim()));
  check('back button still hidden on results', !(await hasClass(page, sg('back'), 'slimegachi-show')));
  await click(page, sg('miniresult-close'));
  await wait(page, 300);
  check('Back to Pet returns to care', (await state(page)).view === 'care');
  check('back button restored after the game', await hasClass(page, sg('back'), 'slimegachi-show'));
  check('playing costs energy', (await activeStats(page)).stats.energy < 100, (await activeStats(page)).stats);

  /* ---- Shelf modals ---- */
  await click(page, sg('back'));
  await wait(page, 400);
  check('back returns to the shelf', (await state(page)).view === 'shelf');
  const modals = [
    ['open-quests', 'quests-modal', 'quests-close', '.slimegachi-quest-row', 3],
    ['open-shop', 'shop-modal', 'shop-close', '.slimegachi-shop-item', 6],
    ['open-achievements', 'ach-modal', 'ach-close', '.slimegachi-ach-row', 7],
    ['open-collection', 'collection-modal', 'collection-close', '.slimegachi-collection-row', 8]
  ];
  for (const [open, modal, close, rowSel, rows] of modals) {
    await click(page, sg(open));
    await wait(page, 200);
    const n = (await page.$$(sg(modal) + ' ' + rowSel)).length;
    check(modal + ' opens with ' + rows + ' rows', (await hasClass(page, sg(modal), 'slimegachi-show')) && n === rows, n);
    await click(page, sg(close));
    await wait(page, 150);
    check(modal + ' closes', !(await hasClass(page, sg(modal), 'slimegachi-show')));
  }

  /* ---- Monkey + Banana Catch ---- */
  await openPet(page, 1);
  check('second pet opens', (await state(page)).view === 'care');
  check('Monkey eyes open while awake', (await openEyeParts(page)) > 0);
  await click(page, '[data-action="play"]');
  await wait(page, 600);
  check('Monkey plays Banana Catch', (await page.textContent(sg('minigame-title'))).trim() === 'Banana Catch');
  await click(page, sg('minigame-exit'));
  await wait(page, 300);
  await click(page, sg('miniresult-close'));
  await wait(page, 300);
  check('Banana Catch exits back to care', (await state(page)).view === 'care');

  /* ---- Sound toggles ---- */
  await click(page, sg('sound-toggle'));
  check('sound toggle mutes', await page.evaluate(() => localStorage.getItem('slimegachi:muted')) === '1' ||
    await hasClass(page, sg('sound-toggle'), 'slimegachi-muted'));
  await click(page, sg('sound-toggle'));

  /* ---- Persistence ---- */
  await wait(page, 1200);                       // let the debounced save land
  const before = await state(page);
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__game && window.__game.getState().ownedPets.length > 0);
  await wait(page, 300);
  const after = await state(page);
  check('coins persist across a reload', after.coins === before.coins && after.coins >= startCoins, [before.coins, after.coins]);
  check('achievements persist', !!(after.achievements.firstSteps && after.achievements.firstSteps.unlockedAt));
  const kittenKey = Object.keys(before.pets)[0];
  check('pet stats persist', JSON.stringify(after.pets[kittenKey].stats) === JSON.stringify(before.pets[kittenKey].stats),
    [before.pets[kittenKey].stats, after.pets[kittenKey].stats]);
  check('quest slate persists', JSON.stringify(after.quests) === JSON.stringify(before.quests));

  await page.context().close();
}

async function nightChecks(browser, errors) {
  console.log('Night (02:00) — fresh save');
  const page = await openPage(browser, NIGHT, errors, true);
  await openPet(page, 0);
  check('Kitten is asleep at 02:00', /SLEEPING/i.test(await page.textContent(sg('petmood'))), await page.textContent(sg('petmood')));
  check('no open-eye parts while asleep', (await openEyeParts(page)) === 0, await openEyeParts(page));
  check('closed-eye parts shown while asleep', await page.evaluate(() =>
    [...document.querySelectorAll('[data-sg="petimg"] .sg-eye-closed')]
      .filter((e) => getComputedStyle(e).display !== 'none').length) > 0);
  await click(page, sg('petimg'));
  await wait(page, 500);
  check('tap-to-wake clears the sleeping status', !/SLEEPING/i.test(await page.textContent(sg('petmood'))), await page.textContent(sg('petmood')));
  check('eyes open right after waking', (await openEyeParts(page)) > 0);
  check('wake override is stored on the pet', ((await activeStats(page)).awakeUntil || 0) > NIGHT.getTime());
  await page.context().close();
}

/* Leveling: only care that meets a genuine need earns progress. Uses the dev
   panel's +1h button to make the pet hungry. */
async function progressionChecks(browser, errors) {
  console.log('Progression — fresh save');
  const page = await openPage(browser, NOON, errors, true);
  await openPet(page, 0);
  for (let i = 0; i < 3; i++) await click(page, sg('dev-skip'));
  await wait(page, 200);
  const hungry = await activeStats(page);
  check('+1h x3 makes the Kitten hungry (decay 14/h)', Math.round(hungry.stats.hunger) === 38, hungry.stats);
  const feedOnce = async () => {
    await click(page, '[data-action="feed"]');
    await wait(page, 150);
    await click(page, sg('feed-grid') + ' .slimegachi-shop-item');
    await wait(page, 150);
  };
  await feedOnce();
  let pet = await activeStats(page);
  check('feeding a hungry pet earns care credit', pet.care_count === 1, pet.care_count);
  check('Snack adds 20 hunger', Math.round(pet.stats.hunger) === 58, pet.stats);
  await feedOnce();
  pet = await activeStats(page);
  check('second feed (hunger 58 < 60) also counts', pet.care_count === 2, pet.care_count);
  await feedOnce();
  pet = await activeStats(page);
  check('third feed (hunger 78) earns no credit', pet.care_count === 2, pet.care_count);
  const s = await state(page);
  check('quests saw every feed', s.collection.totalActions === 3 && s.collection.foodsTried.snack === true, s.collection);
  await page.context().close();
}

/* A whole 30-second Bubble Pop round, ended by the clock. */
async function fullRoundChecks(browser, errors) {
  console.log('Full mini-game round (30s)');
  const page = await openPage(browser, NOON, errors, true);
  await openPet(page, 0);
  const coinsBefore = (await state(page)).coins;
  await click(page, '[data-action="play"]');
  const box = await (await page.$(sg('minigame-canvas'))).boundingBox();
  const end = Date.now() + 31500;
  let i = 0;
  while (Date.now() < end && !(await hasClass(page, sg('miniresult'), 'slimegachi-show'))) {
    await page.mouse.click(box.x + box.width * (0.1 + 0.8 * ((i * 0.37) % 1)), box.y + box.height * (0.15 + 0.7 * ((i * 0.61) % 1)));
    i++;
    await wait(page, 40);
  }
  await wait(page, 300);
  check('round ends on its own after 30s', await hasClass(page, sg('miniresult'), 'slimegachi-show'));
  const score = Number((await page.textContent(sg('miniresult-score'))).trim());
  const s = await state(page);
  check('score is a non-negative number', Number.isFinite(score) && score >= 0, score);
  check('coins paid = floor(score * 0.25)', s.coins - coinsBefore === Math.floor(score * 0.25), [score, s.coins - coinsBefore]);
  check('completed round is counted in the collection', s.collection.gamesPlayed.bubblepop === 1, s.collection.gamesPlayed);
  await page.context().close();
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    await dayChecks(browser, errors);
    await nightChecks(browser, errors);
    await progressionChecks(browser, errors);
    if (process.argv.includes('--full')) await fullRoundChecks(browser, errors);
  } catch (e) {
    failures++;
    console.log('  FAIL  test run threw: ' + (e && e.stack || e));
  }
  check('no console errors or page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? '\n' + failures + ' check(s) failed.' : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
