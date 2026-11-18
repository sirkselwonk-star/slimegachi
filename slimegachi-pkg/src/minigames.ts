/**
 * SLIMEgachi — mini-games. Each runs for 30 seconds on a shared canvas and
 * reports a score; the instance turns the score into Happy and coins.
 *
 * Both loops are frame-rate independent: movement and spawn timers are
 * scaled by real delta-time (normalised to 60 fps), so the game runs at the
 * same real-world pace on low-fps mobile devices.
 */
import type { GameId, MiniGame } from './types';
import { Sound } from './audio';
import { CATCH_SPRITES } from './icons';
import { clamp } from './util';

/** What a mini-game needs from the widget instance. */
export interface GameHost {
  /** Look up a widget element by its `data-sg` name. */
  $<T extends HTMLElement = HTMLElement>(name: string): T;
  /** Current device pixel ratio. */
  dpr(): number;
  /** Apply rewards and show the results panel. `score` may be negative. */
  complete(game: GameId, score: number, forfeit: boolean): void;
}

const DURATION_MS = 30000;
/** Overall pace: 4x the original speed (scales fall speed and spawn cadence together). */
const GAME_SPEED = 4;
/** Longest frame gap honoured, so a backgrounded tab doesn't jump ahead. */
const MAX_FRAME_MS = 100;

type InputEvent = PointerEvent | TouchEvent;
/** Client X/Y of a pointer event or the first touch of a touch event. */
function pointOf(e: InputEvent): { clientX: number; clientY: number } {
  return ('touches' in e && e.touches[0]) || (e as PointerEvent);
}

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}
/** Size the shared canvas to its stage and reset the HUD for a new round. */
function openSurface(host: GameHost, title: string): Surface {
  const canvas = host.$<HTMLCanvasElement>('minigame-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('SLIMEgachi: 2D canvas is not available');
  const r = host.$('minigame-stage').getBoundingClientRect();
  const dpr = host.dpr();
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  try { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
  host.$('minigame-score').textContent = '0';
  host.$('minigame-title').textContent = title;
  return { canvas, ctx, width: r.width, height: r.height };
}

/**
 * Shared round clock. Returns the scaled delta-time for this frame in
 * milliseconds, or null when the round has run out of time.
 */
function createClock(host: GameHost) {
  let startedAt = 0, last = 0;
  return {
    start() { startedAt = performance.now(); last = 0; },
    tick(): number | null {
      const tNow = performance.now();
      const remaining = Math.max(0, DURATION_MS - (tNow - startedAt));
      host.$('minigame-timer').textContent = '0:' + Math.ceil(remaining / 1000).toString().padStart(2, '0');
      if (remaining <= 0) return null;
      let dt = last ? (tNow - last) : 16;
      last = tNow;
      if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;
      return dt * GAME_SPEED;
    }
  };
}

/* =====================================================================
   Bubble Pop (Kitten's favourite) — tap rising bubbles.
   ===================================================================== */

interface Bubble {
  x: number; y: number; r: number;
  vx: number; vy: number;
  points: number;
  color: string;
  /** Pop debris: fades out instead of being tappable. */
  particle?: boolean;
  life?: number;
}

export function createBubblePop(host: GameHost): MiniGame {
  let active = false;
  let bubbles: Bubble[] = [];
  let score = 0;
  let spawnTimer = 0;
  let rafId: number | null = null;
  let surface: Surface | null = null;
  let tapHandler: ((e: InputEvent) => void) | null = null;
  const clock = createClock(host);

  function handleTap(clientX: number, clientY: number) {
    if (!active || !surface) return;
    const rect = surface.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.particle) continue;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy < b.r * b.r) {
        score += b.points;
        Sound.play(b.points >= 15 ? 'golden' : 'pop');
        host.$('minigame-score').textContent = String(score);
        bubbles.splice(i, 1);
        for (let k = 0; k < 6; k++) {
          bubbles.push({ x: b.x, y: b.y, r: 3 + Math.random() * 3, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, points: 0, color: b.color, particle: true, life: 0.5 });
        }
        return;
      }
    }
    Sound.play('miss');   // tapped empty water — whiff
  }

  function loop() {
    if (!active || !surface) return;
    const dt = clock.tick();
    if (dt === null) { game.stop(false); return; }
    const f = dt / 16.667;
    const { ctx, width, height } = surface;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const rare = Math.random() < 0.15;
      const huge = Math.random() < 0.05;
      const r = huge ? 42 : (rare ? 22 : 28 + Math.random() * 8);
      const points = huge ? 25 : (rare ? 15 : 5);
      const colors = rare ? ['#fed600', '#ff7fb8', '#7fffd4'] : ['#00a1d4', '#6ec5e9', '#a7d8ee'];
      bubbles.push({
        x: 30 + Math.random() * (width - 60),
        y: height + r,
        r: r, vx: (Math.random() - 0.5) * 0.8, vy: -1.4 - Math.random() * 1.6,
        points: points, color: colors[Math.floor(Math.random() * colors.length)]
      });
      spawnTimer = 380 + Math.random() * 320;
    }

    ctx.clearRect(0, 0, width, height);
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(0,161,212,0.10)');
    g.addColorStop(1, 'rgba(0,161,212,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.x += b.vx * f; b.y += b.vy * f;
      if (b.particle) {
        b.life = (b.life || 0) - 0.05 * f;
        if (b.life <= 0) { bubbles.splice(i, 1); continue; }
        ctx.globalAlpha = b.life;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (b.y < -b.r - 10) { bubbles.splice(i, 1); continue; }
      ctx.fillStyle = b.color; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      if (b.points > 5) {
        ctx.fillStyle = '#1a1428';
        ctx.font = 'bold ' + Math.round(b.r * 0.5) + 'px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(b.points), b.x, b.y);
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  const game: MiniGame = {
    id: 'bubblepop',
    start() {
      surface = openSurface(host, 'Bubble Pop');
      bubbles = []; score = 0; spawnTimer = 0;
      clock.start();
      active = true;
      tapHandler = (e) => {
        e.preventDefault();
        const t = pointOf(e);
        handleTap(t.clientX, t.clientY);
      };
      surface.canvas.addEventListener('pointerdown', tapHandler, { passive: false });
      surface.canvas.addEventListener('touchstart', tapHandler, { passive: false });
      loop();
    },
    stop(forfeit) {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (tapHandler && surface) {
        surface.canvas.removeEventListener('pointerdown', tapHandler);
        surface.canvas.removeEventListener('touchstart', tapHandler);
        tapHandler = null;
      }
      host.complete('bubblepop', score, forfeit);
    }
  };
  return game;
}

/* =====================================================================
   Banana Catch (Monkey's favourite) — drag a basket under falling items.
   80% banana, 15% rotten (penalty), 5% golden (bonus).
   ===================================================================== */

type CatchKind = 'banana' | 'rotten' | 'golden';
interface FallingItem {
  kind: CatchKind;
  x: number; y: number; vy: number;
  points: number;
  radius: number;
}

export function createBananaCatch(host: GameHost): MiniGame {
  const BASKET_W = 80;
  let active = false;
  let items: FallingItem[] = [];
  let score = 0;
  let spawnTimer = 0;
  let rafId: number | null = null;
  let surface: Surface | null = null;
  let basketX = 0, basketY = 0;
  let dragging = false;
  let downHandler: ((e: InputEvent) => void) | null = null;
  let moveHandler: ((e: InputEvent) => void) | null = null;
  let upHandler: (() => void) | null = null;
  const clock = createClock(host);

  function updateBasket(clientX: number) {
    if (!surface) return;
    const rect = surface.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    basketX = clamp(x - BASKET_W / 2, 0, surface.width - BASKET_W);
  }

  function loop() {
    if (!active || !surface) return;
    const dt = clock.tick();
    if (dt === null) { game.stop(false); return; }
    const f = dt / 16.667;
    const { ctx, width, height } = surface;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const roll = Math.random();
      let item: FallingItem;
      if (roll < 0.05) {
        item = { kind: 'golden', x: 20 + Math.random() * (width - 40), y: -20, vy: 2.5 + Math.random() * 1.0, points: 15, radius: 24 };
      } else if (roll < 0.20) {
        item = { kind: 'rotten', x: 20 + Math.random() * (width - 40), y: -20, vy: 3.0 + Math.random() * 1.5, points: -8, radius: 16 };
      } else {
        item = { kind: 'banana', x: 20 + Math.random() * (width - 40), y: -20, vy: 2.0 + Math.random() * 1.8, points: 5, radius: 48 };
      }
      items.push(item);
      spawnTimer = 460 + Math.random() * 240;
    }

    ctx.clearRect(0, 0, width, height);
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, 'rgba(136, 184, 92, 0.12)');
    g.addColorStop(1, 'rgba(60, 100, 40, 0.04)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * f;
      if (it.y >= basketY && it.y <= basketY + 30 && it.x >= basketX && it.x <= basketX + BASKET_W) {
        score += it.points;
        Sound.play(it.kind === 'golden' ? 'golden' : it.kind === 'rotten' ? 'miss' : 'catch');
        host.$('minigame-score').textContent = String(score);
        items.splice(i, 1);
        continue;
      }
      if (it.y > height + 30) { items.splice(i, 1); continue; }
      const sprite = CATCH_SPRITES[it.kind];
      const sz = it.radius * 2;
      if (sprite && sprite.complete && sprite.naturalWidth) {
        ctx.drawImage(sprite, it.x - it.radius, it.y - it.radius, sz, sz);
      } else {
        ctx.fillStyle = it.kind === 'golden' ? '#ffd23f' : it.kind === 'rotten' ? '#a3cf63' : '#f2d23e';
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Basket */
    ctx.fillStyle = '#8b4513';
    ctx.strokeStyle = '#5a2d0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(basketX, basketY, BASKET_W, 26, 6);
    else ctx.rect(basketX, basketY, BASKET_W, 26);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let x = basketX + 8; x < basketX + BASKET_W; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, basketY + 3);
      ctx.lineTo(x, basketY + 23);
      ctx.stroke();
    }
    ctx.strokeStyle = '#5a2d0a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(basketX + BASKET_W / 2, basketY, BASKET_W / 2 - 4, Math.PI, 0, false);
    ctx.stroke();

    rafId = requestAnimationFrame(loop);
  }

  const game: MiniGame = {
    id: 'bananacatch',
    start() {
      surface = openSurface(host, 'Banana Catch');
      basketX = surface.width / 2 - BASKET_W / 2;
      basketY = surface.height - 60;
      items = []; score = 0; spawnTimer = 0;
      dragging = false;
      clock.start();
      active = true;

      downHandler = (e) => {
        e.preventDefault();
        dragging = true;
        updateBasket(pointOf(e).clientX);
      };
      moveHandler = (e) => {
        if (!dragging) return;
        e.preventDefault();
        updateBasket(pointOf(e).clientX);
      };
      upHandler = () => { dragging = false; };

      const c = surface.canvas;
      c.addEventListener('pointerdown', downHandler, { passive: false });
      c.addEventListener('pointermove', moveHandler, { passive: false });
      c.addEventListener('pointerup', upHandler);
      c.addEventListener('pointercancel', upHandler);
      c.addEventListener('touchstart', downHandler, { passive: false });
      c.addEventListener('touchmove', moveHandler, { passive: false });
      c.addEventListener('touchend', upHandler);

      loop();
    },
    stop(forfeit) {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (surface && downHandler && moveHandler && upHandler) {
        const c = surface.canvas;
        c.removeEventListener('pointerdown', downHandler);
        c.removeEventListener('pointermove', moveHandler);
        c.removeEventListener('pointerup', upHandler);
        c.removeEventListener('pointercancel', upHandler);
        c.removeEventListener('touchstart', downHandler);
        c.removeEventListener('touchmove', moveHandler);
        c.removeEventListener('touchend', upHandler);
        downHandler = moveHandler = upHandler = null;
      }
      host.complete('bananacatch', score, forfeit);
    }
  };
  return game;
}
