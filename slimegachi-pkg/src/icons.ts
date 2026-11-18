/**
 * SLIMEgachi — icons. All inline SVG; there are no OS emoji in the UI.
 *
 * Two families: coloured "content" icons (flat fills + a dark outline, to
 * match the pets) and monochrome line icons for UI chrome.
 */

/* Colored content icons — flat fills + a dark kawaii outline, matching the
   pets' sticker look. Used for foods and achievements, which stay colourful
   (unlike the monochrome line ICONS used for UI chrome). */
function svgC(body: string): string {
  return '<svg class="slimegachi-ico" viewBox="0 0 24 24" fill="none" stroke="#1a1428" ' +
    'stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + body + '</svg>';
}
export const FOOD_ICONS = {
  snack:    svgC('<circle cx="12" cy="12" r="8" fill="#d6a15c"/><circle cx="9.2" cy="9.5" r="1.1" fill="#5a3a22" stroke="none"/><circle cx="14.6" cy="10" r="1" fill="#5a3a22" stroke="none"/><circle cx="10.4" cy="14.4" r="1.1" fill="#5a3a22" stroke="none"/><circle cx="14.9" cy="14.4" r="0.9" fill="#5a3a22" stroke="none"/><circle cx="12.2" cy="12" r="0.7" fill="#5a3a22" stroke="none"/>'),
  burger:   svgC('<path d="M4.5 11a7.5 4 0 0 1 15 0z" fill="#e8a64f"/><circle cx="9" cy="9.2" r="0.5" fill="#fff7e6" stroke="none"/><circle cx="12" cy="8.5" r="0.5" fill="#fff7e6" stroke="none"/><circle cx="15" cy="9.2" r="0.5" fill="#fff7e6" stroke="none"/><path d="M4.3 11h15.4l-.4 1.9H4.7z" fill="#82c34a"/><rect x="4.6" y="12.7" width="14.8" height="2.3" rx="1.1" fill="#8a5a30"/><path d="M5 15h14a2.2 2.2 0 0 1-2.2 2.3H7.2A2.2 2.2 0 0 1 5 15z" fill="#e8a64f"/>'),
  banana:   svgC('<path d="M5.6 7.4c1 6.4 6 9.9 12.4 9.1.9-.1 1.2-1.1.4-1.5C12.6 12.9 9 9.7 8.3 6.7 8 5.6 6.4 5.9 5.6 7.4z" fill="#f2d23e"/><path d="M18 16.2l1.2.4"/>'),
  cake:     svgC('<path d="M6 18.5l6-11 6 11z" fill="#f5e0a6"/><path d="M9.2 12.4 12 7.6l2.8 4.8z" fill="#f49ab8"/><circle cx="12" cy="8" r="1.3" fill="#e0464e"/><path d="M8.7 15h6.6"/>'),
  medicine: svgC('<rect x="3.8" y="9" width="16.4" height="6" rx="3" fill="#f1e7d4"/><path d="M6.8 9.05H12v5.9H6.8a2.95 2.95 0 0 1 0-5.9z" fill="#e8534e"/>'),
  toyball:  svgC('<circle cx="12" cy="12" r="8" fill="#bfe05a"/><path d="M6.2 6.4c3.2 3 3.2 8.2 0 11.2" stroke="#ffffff" stroke-width="1.3"/><path d="M17.8 6.4c-3.2 3-3.2 8.2 0 11.2" stroke="#ffffff" stroke-width="1.3"/>')
};
export const ACH_ICONS = {
  paw:     svgC('<path d="M7.5 15.2c0-2.2 2-3.4 4.5-3.4s4.5 1.2 4.5 3.4-2 3.7-4.5 3.7S7.5 17.4 7.5 15.2z" fill="#f2a6bc"/><ellipse cx="8" cy="10.6" rx="1.3" ry="1.7" fill="#f2a6bc"/><ellipse cx="11" cy="9.1" rx="1.3" ry="1.8" fill="#f2a6bc"/><ellipse cx="13.9" cy="9.1" rx="1.3" ry="1.8" fill="#f2a6bc"/><ellipse cx="16.8" cy="10.6" rx="1.3" ry="1.7" fill="#f2a6bc"/>'),
  star:    svgC('<path d="M12 3.6l2.5 5.1 5.6.8-4.1 4 1 5.6L12 16.4 6.9 19l1-5.6-4-4 5.6-.8z" fill="#ffd23f"/>'),
  sparkle: svgC('<path d="M12 3l1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7z" fill="#8fe0ff"/>'),
  diamond: svgC('<path d="M7.5 6.5h9l2.6 3.3L12 19 4.4 9.8z" fill="#5cd0e8"/><path d="M4.4 9.8h15.2" stroke-width="1.1"/><path d="M9.2 6.5 7.7 9.8 12 19M14.8 6.5l1.5 3.3L12 19" stroke-width="1"/>'),
  bubbles: svgC('<circle cx="10" cy="13.2" r="4.6" fill="#7fc8e8"/><circle cx="16.2" cy="9" r="2.8" fill="#a8dcf0"/><circle cx="15.6" cy="15.6" r="2" fill="#a8dcf0"/><circle cx="8.4" cy="11.4" r="1" fill="#eafaff" stroke="none"/>'),
  glowstar:svgC('<path d="M12 4.2l2.3 4.7 5.2.7-3.8 3.7.9 5.2L12 16l-4.6 2.5.9-5.2-3.8-3.7 5.2-.7z" fill="#ffd23f"/><path d="M19 5l.5 1.4 1.4.5-1.4.5L19 9.3l-.5-1.4-1.4-.5 1.4-.5z" fill="#fff3b0" stroke="none"/>')
};
/* Colored icons for the floating care emotes (keyed by the legacy emoji so the
   spawnEmote call sites don't change) and for the events / stats rows. */
export const EMOTE_ICONS: Record<string, string> = {
  '💖': svgC('<path d="M12 20s-7-4.4-7-9.4a3.8 3.8 0 0 1 7-2.2 3.8 3.8 0 0 1 7 2.2c0 5-7 9.4-7 9.4z" fill="#ff6fa5"/>'),
  '✨': ACH_ICONS.sparkle,
  '⭐': ACH_ICONS.star,
  '🌟': ACH_ICONS.glowstar,
  '🫧': ACH_ICONS.bubbles,
  '🎵': svgC('<path d="M9 17V5l9-2v11.5"/><circle cx="6.5" cy="17" r="2.4" fill="#9b6cf0"/><circle cx="15.5" cy="14.5" r="2.4" fill="#9b6cf0"/>'),
  '💤': svgC('<path d="M6.5 8h5l-5 5.5h5" stroke="#74a9ff"/><path d="M13 13h4.5l-4.5 4h4.5" stroke="#74a9ff"/>'),
  '💧': svgC('<path d="M12 3.6c3.3 4.3 5.4 7.1 5.4 9.9a5.4 5.4 0 0 1-10.8 0c0-2.8 2.1-5.6 5.4-9.9z" fill="#5fb8e8"/>'),
  '🎉': svgC('<path d="M4 20l4.6-12 7.4 7.4z" fill="#f0a83c"/><circle cx="16" cy="6" r="1" fill="#ff6fa5" stroke="none"/><circle cx="19.2" cy="9.4" r="1" fill="#5cd0e8" stroke="none"/><circle cx="18" cy="4.2" r="0.8" fill="#7ec850" stroke="none"/>'),
  '🎁': svgC('<rect x="4.5" y="10" width="15" height="9" rx="1" fill="#e8534e"/><rect x="3.8" y="7.8" width="16.4" height="3.2" rx="1" fill="#ff8174"/><path d="M12 7.8V19" stroke="#ffd23f" stroke-width="1.4"/><path d="M12 7.8C10.5 5 6.5 5.5 8 7.8zM12 7.8C13.5 5 17.5 5.5 16 7.8z" fill="#ffd23f"/>'),
  '⬆️': svgC('<path d="M12 19V6" stroke="#5ad17a" stroke-width="2.2"/><path d="M7 11l5-5 5 5" stroke="#5ad17a" stroke-width="2.2"/>')
};
export const MISC_ICONS = {
  coin:     svgC('<circle cx="12" cy="12" r="8" fill="#ffd23f"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="#c9a528" stroke-width="1.1"/>'),
  sick:     svgC('<circle cx="12" cy="12" r="8" fill="#a3cf63"/><path d="M9 11.5h.01M15 11.5h.01" stroke-width="2.2"/><path d="M9.2 16c1.6-1.4 4-1.4 5.6 0"/><path d="M16.4 8.4c1.2-.6 2.4-.2 2.8 1"/>'),
  bolt:     svgC('<path d="M13 2.5 5 13h6l-1 8.5L19 11h-6l1-8.5z" fill="#ffd23f"/>'),
  trophy:   svgC('<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4z" fill="#ffd23f"/><path d="M7.5 5.5H4.5V7a3 3 0 0 0 3 3.2"/><path d="M16.5 5.5h3V7a3 3 0 0 1-3 3.2"/><path d="M9.5 18.7h5"/><path d="M12 13.4v5.3"/>'),
  plate:    svgC('<circle cx="13" cy="12.5" r="5.6" fill="#e7ddc9"/><circle cx="13" cy="12.5" r="3.1" fill="none" stroke="#c4ba9f" stroke-width="1"/><path d="M5 5.5v13M3.7 5.5v3.4a1.3 1.3 0 0 0 2.6 0V5.5"/>'),
  gamepad:  svgC('<rect x="3" y="9" width="18" height="8" rx="4" fill="#6c7bf0"/><path d="M6.8 11.3v3M5.3 12.8h3" stroke="#fff" stroke-width="1.3"/><circle cx="15.5" cy="12" r="1" fill="#fff" stroke="none"/><circle cx="17.6" cy="14" r="1" fill="#fff" stroke="none"/>'),
  trending: svgC('<path d="M4 16l5-5 3 3 7-7" stroke="#5ad17a" stroke-width="2"/><path d="M15.5 7H19v3.5" stroke="#5ad17a" stroke-width="2"/>'),
  flame:    svgC('<path d="M12 3c3 4 5 6.2 5 9.2a5 5 0 0 1-10 0c0-1.5.5-2.7 1.4-3.9.3 1 .8 1.6 1.6 2C11.2 7.7 11.6 5.6 12 3z" fill="#ff7a3c"/><path d="M12 19a2.4 2.4 0 0 0 2.4-2.4c0-1.3-1-2.1-2.4-3.8-1.4 1.7-2.4 2.5-2.4 3.8A2.4 2.4 0 0 0 12 19z" fill="#ffd23f"/>')
};

/* Rasterize an inline icon to an <img> so the canvas mini-games can draw the
   same kawaii sprites the rest of the UI uses (a data-URI SVG needs an explicit
   xmlns, which the inline-HTML icons omit). */
function spriteImg(svgMarkup: string): HTMLImageElement {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(svgMarkup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  return img;
}
export const CATCH_SPRITES = {
  golden: spriteImg(ACH_ICONS.star),
  rotten: spriteImg(MISC_ICONS.sick),
  banana: spriteImg(FOOD_ICONS.banana)
};

/* Custom line icons — rounded stroke linework to match the pets' outlines.
   stroke="currentColor" so each icon inherits its container's text colour,
   which means they flip with the adaptive HUD and tint per button like the
   labels do (something emoji can't do). Sized to 1em via .slimegachi-ico. */
function svgIcon(body: string): string {
  return '<svg class="slimegachi-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}
export const ICONS = {
  // Care actions
  feed:  svgIcon('<path d="M3 12h18"/><path d="M4.5 12a7.5 6 0 0 0 15 0"/><path d="M7.5 12a4.5 3.5 0 0 1 9 0"/>'),
  play:  svgIcon('<circle cx="12" cy="12" r="8.5"/><path d="M5.5 6.5c2.8 3.6 2.8 7.4 0 11"/><path d="M18.5 6.5c-2.8 3.6-2.8 7.4 0 11"/>'),
  sleep: svgIcon('<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5 6.7 6.7 0 0 0 20.5 13.2z"/><path d="M15 4.5h3.5L15 8h3.5"/>'),
  clean: svgIcon('<path d="M12 3.2c3.6 4.6 6 7.7 6 10.6a6 6 0 0 1-12 0c0-2.9 2.4-6 6-10.6z"/><path d="M9.4 13.8a2.6 2.6 0 0 0 2.1 2.4"/>'),
  // Vitals
  hunger: svgIcon('<path d="M12 8c-1-2-3.6-2-4.8-.3-1.3 1.9-.7 6.4 1.1 8.1 1 1 1.8 1.2 2.7 1.2s1.7-.2 2.7-1.2c1.8-1.7 2.4-6.2 1.1-8.1C15.6 6 13 6 12 8z"/><path d="M12 8c.2-1.7 1.3-2.7 2.9-2.9"/>'),
  happy:  svgIcon('<path d="M12 20s-7-4.4-7-9.4a3.8 3.8 0 0 1 7-2.2 3.8 3.8 0 0 1 7 2.2c0 5-7 9.4-7 9.4z"/>'),
  energy: svgIcon('<path d="M13 2.5 5 13h6l-1 8.5L19 11h-6l1-8.5z"/>'),
  // Shelf nav
  quests: svgIcon('<path d="M9.5 6.5h10"/><path d="M9.5 12h10"/><path d="M9.5 17.5h10"/><path d="M4 6l1.2 1.2L7.5 5"/><path d="M4 11.5l1.2 1.2 2.3-2.2"/><path d="M4 17l1.2 1.2 2.3-2.2"/>'),
  shop:   svgIcon('<path d="M5 8h14l-1.2 12.5H6.2L5 8z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/>'),
  badges: svgIcon('<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4z"/><path d="M7.5 5.5H4.5V7a3 3 0 0 0 3 3"/><path d="M16.5 5.5h3V7a3 3 0 0 1-3 3"/><path d="M9.5 18.5h5"/><path d="M12 13.2v5.3"/>'),
  stats:  svgIcon('<path d="M4 20h16"/><path d="M6.5 20v-6.5"/><path d="M12 20V5"/><path d="M17.5 20v-9.5"/>'),
  // Topbar
  coin:     svgIcon('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.3"/>'),
  sound:    svgIcon('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: svgIcon('<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M16.5 9.5l5 5"/><path d="M21.5 9.5l-5 5"/>'),
  music:    svgIcon('<path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>'),
  musicOff: svgIcon('<path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/><path d="M4 4.5l16 16"/>'),
  check:    svgIcon('<path d="M5 12.5l4.5 4.5L19 7"/>')
};
