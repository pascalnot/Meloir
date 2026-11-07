/*
 * Meloir UI. Drawn over the hidden Web Player, in a shadow root so the page's styles stay out.
 * Pure black and greys: the only colour on screen comes from the covers.
 * Ctrl+Shift+U shows the real page underneath, for anything Meloir does not cover.
 */
(() => {
  if (location.hostname !== 'xpui.app.spotify.com' || window.top !== window) return;

  const LOGO_M = 'M26 27h11l13 22 13-22h11v46H63V46L50 68 37 46v27H26z';
  const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#fff"/><path fill="#000" d="${LOGO_M}"/></svg>`;
  const SPLASH_LIMIT_MS = 15000;
  const RECENT_ON_HOME = 6, MAX_HISTORY = 30, MAX_SEARCHES = 8, KEEP_SEARCH_MS = 1500;
  const GLOW_TIGHT_GROW = 2, GLOW_WIDE_GROW = 14, GLOW_TIGHT_SOFT_PX = 12, GLOW_WIDE_SOFT_PX = 90;
  const BACKDROP_MAX_OPACITY = 0.6, MUTE_FADE_MS = 140, UNMUTE_FADE_MS = 350, HIDDEN_BUTTONS_HEIGHT = 1, FULLSCREEN_SETTLE_MS = 350, NAV_MARK_PX = 16, TOAST_MS = 2600, DRAG_START_PX = 5, DRAG_EDGE_PX = 36, DRAG_SCROLL_PX = 8, DRAG_CLICK_MS = 100, QUEUE_SETTLE_MS = 900, GENRE_FOCUS_MS = 60;
  const PLAY_COUNTS_MS = 30000, SAVE_LISTENING_MS = 60000, MAX_STATS_SONGS = 400, STATS_TOP = 10, STATS_COUNT_MS = 900;
  const SHORTCUTS = [['Space', 'Play or pause'], ['F', 'Focus mode'], ['L', 'Lyrics in focus mode'], ['Q', 'Queue'], ['Ctrl+K', 'Search'],
    ['Ctrl+F', 'Filter songs'], ['Esc', 'Close'], ['?', 'This list'], ['Ctrl+Shift+U', 'Spotify\'s own interface']];
  const FILTERED_LIST_URI = 'spotify:internal:meloir', MELOIR_LINK = 'https://github.com/pascalnot/Meloir', DISCORD_MAX_TEXT = 128, DISCORD_SEEK_MS = 3000, SETTINGS_JUMP_MS = 900, SETTINGS_TOP_PX = 12, SETTINGS_ROW_PX = 26, SETTINGS_GLIDE_MS = 70, SETTINGS_REACHED_PX = 2;
  const BEAT_FADE_MS = 180, DROP_FADE_MS = 800, BEAT_JUMP_MS = 1000;
  const MIN_IDLE_SECONDS = 15, MAX_IDLE_SECONDS = 300, MAX_TILT_DEGREES = 5, QUEUE_LENGTH = 40, QUEUE_REFRESH_MS = 2500, SCROLLBAR_NEAR_PX = 72;
  const COVER_FADE_MS = 700, MELOIR_BAR_HEIGHT = 36, SPOTIFY_BAR_HEIGHT = 64, MAX_REVEAL_STAGGER = 10, ROW_SHOWN_AT = 0.5, CARD_SHOWN_AT = 0.2, LYRICS_RETRY_MS = 8000;
  const COVER_MOVE_MS = 520, COVER_WAIT_MS = 170, LYRICS_FADE_OUT_MS = 170, LYRICS_WAIT_MS = 230, LYRICS_FADE_IN_MS = 380;
  const LYRICS_LEAVE_MS = 180, LYRICS_ARRIVE_MS = 420;
  const EASE = 'cubic-bezier(.2,.8,.2,1)';

  const host = message => { if (window.meloirHost) window.meloirHost(message); };

  // Black from the first frame: the real page never flashes before the UI is up.
  const splash = document.createElement('div');
  splash.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:#000;display:grid;place-items:center' + ((window.meloirSavedPrefs || {}).theme === 'light' ? ';filter:invert(1)' : '');
  splash.innerHTML = `<div style="width:84px;height:84px">${LOGO_SVG}</div>`;
  const showSplash = () => {
    if (!document.documentElement) { setTimeout(showSplash, 5); return; }
    document.documentElement.append(splash);
    splash.firstChild.animate(
      [{ transform: 'scale(.94)', opacity: .55 }, { transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.94)', opacity: .55 }],
      { duration: 1500, iterations: Infinity, easing: 'ease-in-out' });
  };
  showSplash();
  const hideSplash = () => {
    if (!splash.isConnected) return;
    splash.firstChild.getAnimations().forEach(a => a.cancel());
    splash.firstChild.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.7)' }], { duration: 520, easing: EASE, fill: 'forwards' });
    splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, easing: 'ease-in', fill: 'forwards' }).onfinish = () => splash.remove();
  };
  setTimeout(hideSplash, SPLASH_LIMIT_MS);

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* Focus mode stays dark in white mode: it is meant to be a black screen. */
    #app, #app.light #focus, #app.light.focusing .wins {
      --bg: #000; --fg: #fff; --mute: #8c8c8c; --faint: #4d4d4d; --line: #1a1a1a; --hover: #0f0f0f; --art: #111; --track: #2b2b2b; --knob: #9a9a9a;
      --menu: #0f0f0f; --menu-line: #222; --menu-text: #d0d0d0; --menu-hover: #1a1a1a; --press: #161616; --play-hover: #d6d6d6; --alt-line: #3a3a3a;
      --curve: #333; --thumb: #4d4d4d; --glow: 255, 255, 255;
    }
    #app.light {
      --bg: #fff; --fg: #000; --mute: #6b6b6b; --faint: #a3a3a3; --line: #ececec; --hover: #f4f4f4; --art: #eee; --track: #dcdcdc; --knob: #fff;
      --menu: #fff; --menu-line: #e2e2e2; --menu-text: #333; --menu-hover: #f0f0f0; --press: #ededed; --play-hover: #2e2e2e; --alt-line: #c8c8c8;
      --curve: #ccc; --thumb: #b0b0b0; --glow: 0, 0, 0;
    }
    #app.light #focus { color: #fff; }
    #app {
      --ease: ${EASE};
      position: fixed; inset: 0; z-index: 2147483000; display: grid;
      grid-template: 36px minmax(0, 1fr) 64px / 248px minmax(0, 1fr);
      background: var(--bg); color: var(--fg); user-select: none;
      font: 14px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      animation: app-in .5s var(--ease);
    }
    #app::after { content: ""; position: absolute; inset: 0; border: 1px solid var(--line); pointer-events: none; z-index: 5; }
    #app.max::after { display: none; }
    #app.off { display: none; }
    @keyframes app-in { from { opacity: 0; } }
    button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: color .15s, background-color .15s, transform .15s var(--ease), opacity .15s; }
    button:active { transform: scale(.94); }
    button:focus-visible, a:focus-visible { outline: 1px solid var(--fg); outline-offset: 2px; }
    /* A scrollbar thumb cannot fade by itself, so it is drawn from a border colour it inherits. */
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-thumb { border: 2px solid; border-color: inherit; border-radius: 2px; }
    main, .lists, .qlist, .lyrics { border-color: transparent; }
    main, .lists, .qlist { transition: border-color .3s; }
    main.bar-near, .lists.bar-near, .qlist.bar-near, .lyrics.bar-near { border-color: var(--thumb); }

    .titlebar { position: relative; grid-column: 1 / -1; display: flex; align-items: center; }
    .brand { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: .3em; pointer-events: none; }
    .brand svg { width: 16px; height: 16px; display: block; }
    .wins { position: absolute; right: 8px; top: 6px; z-index: 12; display: flex; gap: 2px; height: 24px; -webkit-app-region: no-drag; }
    #app.fullscreen .wins { display: none; }
    .win { width: 30px; height: 100%; border-radius: 6px; color: var(--mute); }
    .win:active { transform: none; }
    .win svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1; transition: transform .25s var(--ease); }
    .win:hover { color: var(--fg); background: var(--press); }
    .win.min:hover svg { transform: scaleX(1.35); }
    .win.max:hover svg { transform: scale(1.14); }
    .win.close:hover svg { transform: rotate(90deg); }
    .menudots { position: absolute; left: 8px; top: 6px; display: flex; gap: 2px; height: 24px; }
    .menudots .win, .titlemenu.on { -webkit-app-region: no-drag; }
    .titlemenu { display: flex; gap: 2px; visibility: hidden; transition: visibility .3s; }
    .titlemenu.on { visibility: visible; }
    .titlemenu button { height: 100%; padding: 0 10px; border-radius: 6px; font-size: 12px; color: var(--mute); opacity: 0; transform: translateX(-10px);
      transition: opacity .2s, transform .3s var(--ease), color .15s, background-color .15s; }
    .titlemenu.on button { opacity: 1; transform: none; transition-delay: calc(var(--n) * 40ms), calc(var(--n) * 40ms), 0s, 0s; }
    .titlemenu button:hover, .titlemenu button.on { color: var(--fg); background: var(--press); }
    .titlemenu button:active { transform: none; }
    .win.dots svg { width: 14px; height: 14px; fill: currentColor; stroke: none; }
    .win.dots:hover svg { transform: scale(1.14); }
    .win.dots.on { color: var(--fg); }
    .win.dots.on svg { transform: rotate(90deg); }
    /* The cursor glow sits behind everything, on the black. */
    nav, main { position: relative; z-index: 1; }
    /* A soft, blurred copy of the cover behind everything. Two layers let one cover fade into the next. */
    .backdrop { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; opacity: 0; transition: opacity .8s; }
    #app.backdrop-on .backdrop { opacity: var(--backdrop, .3); }
    .backdrop i { position: absolute; inset: -15%; background: center / cover no-repeat; filter: blur(80px) saturate(1.4); opacity: 0; transition: opacity 1.2s; }
    #app.light .backdrop i { filter: blur(80px) saturate(1.3) brightness(1.25); }
    .backdrop i.on { opacity: 1; }
    #app.backdrop-on footer::before { display: none; }
    .cursor { position: absolute; left: 0; top: 0; width: 460px; height: 460px; margin: -230px 0 0 -230px; border-radius: 50%; z-index: 0; pointer-events: none;
      background: radial-gradient(circle, rgba(var(--glow), .075), rgba(var(--glow), .02) 40%, transparent 68%); opacity: 0; transition: opacity .4s; will-change: transform; }
    .cursor.on { opacity: 1; }

    /* Idle: the full cover view opens, and the mouse and the queue step aside. */
    #app.idle #queue, #app.idle .cursor { opacity: 0; }
    #app.idle, #app.idle * { cursor: none; }

    #queue { position: absolute; top: 36px; right: 0; bottom: 66px; width: 320px; z-index: 4; display: flex; flex-direction: column; background: var(--bg);
      transform: translateX(100%); visibility: hidden; transition: transform .42s var(--ease), visibility .42s, opacity .5s; }
    #queue.on { transform: none; visibility: visible; }
    .qtitle { padding: 16px 20px 10px; color: var(--mute); font-size: 13px; font-weight: 500; }
    .qlist { position: relative; flex: 1; overflow: hidden auto; margin-right: 5px; padding-bottom: 28px;
      -webkit-mask-image: linear-gradient(#000 calc(100% - 28px), transparent); }
    .qrow { position: relative; display: flex; width: 100%; gap: 12px; align-items: center; justify-content: flex-start; padding: 6px 20px; text-align: left; }
    .qrow:active { transform: none; }
    .qrow:hover { background: var(--hover); }
    .qrow img { width: 36px; height: 36px; object-fit: cover; flex: none; background: var(--art); }
    .qrow span { display: block; min-width: 0; }
    .qrow b, .qrow small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .qrow b { font-size: 13px; font-weight: 500; }
    .qrow small { color: var(--mute); font-size: 12px; }

    .qrow.held { z-index: 2; background: var(--hover); cursor: grabbing; transition: none; }
    .qlist.sorting .qrow:not(.held) { transition: transform .2s var(--ease); }
    .qlist.settled .qrow { transition: none; }

    #toast { position: absolute; left: 50%; bottom: 80px; z-index: 31; display: flex; gap: 14px; align-items: center; padding: 9px 16px; font-size: 13px;
      background: var(--menu); border: 1px solid var(--menu-line); border-radius: 8px; opacity: 0; pointer-events: none;
      transform: translate(-50%, 10px); transition: opacity .25s, transform .3s var(--ease); }
    #toast.on { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
    #toast button { font-weight: 600; }

    #keys { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: color-mix(in srgb, var(--bg) 88%, transparent);
      opacity: 0; visibility: hidden; transition: opacity .25s, visibility .25s; }
    #keys.on { opacity: 1; visibility: visible; }
    .keylist { width: min(420px, 80vw); }
    .keylist h2 { margin: 0 0 12px; }
    .keyrow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line); }
    #keys.on .keyrow { animation: set-in .4s var(--ease) backwards; animation-delay: calc(var(--n) * 30ms + 60ms); }
    kbd { color: var(--mute); font: 12px "Segoe UI", system-ui, sans-serif; padding: 2px 8px; border: 1px solid var(--track); border-radius: 4px; }

    .genrewrap { position: relative; margin-top: 18px; }
    .genrebutton { display: inline-flex; gap: 8px; align-items: center; padding: 3px 2px; color: var(--mute); border-bottom: 1px solid var(--faint); }
    .genrebutton:hover, .genrebutton.on { color: var(--fg); }
    .genrebutton:active { transform: none; }
    .genrebutton svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.5; transition: transform .25s var(--ease); }
    .genrewrap:has(.genres.on) svg { transform: rotate(180deg); }
    .genres { position: absolute; left: 0; top: calc(100% + 8px); z-index: 6; width: 240px; padding: 10px; background: var(--menu); border: 1px solid var(--menu-line); border-radius: 8px;
      opacity: 0; visibility: hidden; transform: translateY(-6px); transition: opacity .2s, transform .25s var(--ease), visibility .2s; }
    .genres.on { opacity: 1; visibility: visible; transform: none; }
    .genres .filter { width: 100%; margin: 0 0 8px; padding: 4px 6px; }
    .genrelist { max-height: 240px; overflow: hidden auto; }
    .genrelist button { display: flex; width: 100%; justify-content: space-between; gap: 12px; padding: 7px 8px; border-radius: 4px; color: var(--menu-text); font-size: 13px; }
    .genrelist button:active { transform: none; }
    .genrelist button:hover { background: var(--menu-hover); color: var(--fg); }
    .genrelist button.on { color: var(--fg); font-weight: 600; }
    .genrelist small { color: var(--mute); font-size: 12px; }
    .genrenote { color: var(--mute); font-size: 12px; margin-top: 6px; }
    .genrenote:empty { display: none; }
    .acts { align-items: center; gap: 14px; margin-top: 18px; }
    .acts .play, .acts .filter, .acts .genrewrap { margin-top: 0; }
    .acts > .filter, .genrebutton { box-sizing: border-box; height: 28px; padding: 0 2px; font: 14px/26px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; color: var(--fg); border-bottom: 1px solid var(--faint); }
    .acts > .filter::placeholder, .genrebutton { color: var(--mute); }

    .filter { width: 180px; margin-top: 18px; padding: 0 2px; background: none; border: 0; border-bottom: 1px solid var(--faint); color: var(--fg); font: inherit; outline: none; user-select: text; transition: border-color .2s; }
    .filter:focus { border-color: var(--fg); }
    .filter::placeholder { color: var(--faint); }
    .newlist { width: 220px; padding: 7px 12px; background: none; border: 0; color: var(--fg); font: 13px "Segoe UI", system-ui, sans-serif; outline: none; user-select: text; }
    .newlist::placeholder { color: var(--faint); }

    .nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; max-width: 760px; margin-top: 26px; }
    .num b { display: block; font: 600 38px/1.1 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .num span { color: var(--mute); font-size: 13px; }
    .bar { display: grid; width: 100%; max-width: 760px; grid-template-columns: minmax(0, 220px) minmax(0, 1fr) 40px; gap: 14px; align-items: center; padding: 7px 0; }
    .bar span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .bar i { display: block; height: 3px; background: var(--fg); transform-origin: left; animation: grow .7s var(--ease) backwards; animation-delay: calc(var(--n) * 45ms + 150ms); }
    .bar small { color: var(--mute); text-align: right; font-size: 13px; }
    @keyframes grow { from { transform: scaleX(0); } }

    #menu { position: absolute; z-index: 30; display: none; min-width: 170px; max-height: min(340px, 70vh); overflow: hidden auto; padding: 4px; background: var(--menu); border: 1px solid var(--menu-line); border-radius: 6px; }
    #menu.on { display: block; animation: menu-in .12s var(--ease); }
    @keyframes menu-in { from { opacity: 0; transform: scale(.97); } }
    #menu button { display: block; width: 100%; max-width: 280px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; padding: 7px 12px; border-radius: 4px; color: var(--menu-text); font-size: 13px; }
    #menu button:active { transform: none; }
    #menu button:hover { background: var(--menu-hover); color: var(--fg); }

    #app.compact .row { grid-template-columns: 40px minmax(0, 1fr) 28px 52px; }
    #app.compact .row .n, #app.compact .row .al, #app.compact .row > span:empty { display: none; }
    #app.still *, #app.still *::before, #app.still *::after { animation: none !important; transition: none !important; }
    #app.still .below { opacity: 1; transform: none; }
    #app.native .titlebar { -webkit-app-region: drag; }
    .grip { position: absolute; z-index: 6; }
    #app.max .grip { display: none; }
    .g1 { left: 0; top: 8px; bottom: 8px; width: 5px; cursor: ew-resize; } .g2 { right: 0; top: 8px; bottom: 8px; width: 5px; cursor: ew-resize; }
    .g3 { top: 0; left: 8px; right: 8px; height: 4px; cursor: ns-resize; } .g6 { bottom: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
    .g4 { left: 0; top: 0; width: 8px; height: 8px; cursor: nwse-resize; } .g8 { right: 0; bottom: 0; width: 8px; height: 8px; cursor: nwse-resize; }
    .g5 { right: 0; top: 0; width: 8px; height: 8px; cursor: nesw-resize; } .g7 { left: 0; bottom: 0; width: 8px; height: 8px; cursor: nesw-resize; }

    nav { grid-row: 2; display: flex; flex-direction: column; min-height: 0; padding-top: 8px; }
    /* The left menu moves like the list in Settings. */
    .link { position: relative; display: flex; width: 100%; justify-content: flex-start; padding: 8px 24px; color: var(--mute);
      transition: color .25s, transform .25s var(--ease); animation: set-in .45s var(--ease) backwards; animation-delay: calc(var(--n) * 45ms + 120ms); }
    .link:hover { color: var(--fg); transform: translateX(3px); }
    .link:active { transform: translateX(3px) scale(.97); }
    .link.on { color: var(--fg); font-weight: 500; }
    .navmark { position: absolute; left: 10px; top: 0; width: 2px; height: 16px; border-radius: 1px; background: var(--fg); opacity: 0;
      transform: translateY(var(--y, 0)); transition: transform .4s var(--ease), opacity .25s; }
    .navmark.on { opacity: 1; }
    .label { padding: 24px 24px 8px; color: var(--faint); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
    .lists { flex: 1; overflow: hidden auto; padding-bottom: 12px; }
    .lists .link { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-top: 6px; padding-bottom: 6px; }

    main { grid-row: 2; overflow-y: auto; margin-right: 5px; padding: 16px 40px 48px; min-width: 0; }
    .rise { animation: rise .35s var(--ease) backwards; animation-delay: calc(var(--i, 0) * 16ms); }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
    .row, .card, .bar { transition: background-color .15s, opacity .35s var(--ease) var(--d, 0ms), transform .35s var(--ease) var(--d, 0ms); }
    .row.below, .card.below, .bar.below { opacity: 0; transform: translateY(10px); }
    h1 { font: 600 32px/1.1 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; letter-spacing: -.02em; }
    h2 { color: var(--mute); font-size: 13px; font-weight: 500; margin: 36px 0 14px; }
    .search { width: 100%; max-width: 520px; background: none; border: 0; border-bottom: 1px solid var(--faint); color: var(--fg);
      font: 600 32px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; padding: 4px 0 10px; outline: none; user-select: text; transition: border-color .2s; }
    .search:focus { border-color: var(--fg); }
    .search::placeholder { color: var(--faint); }
    .note { color: var(--mute); margin-top: 16px; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(164px, 1fr)); gap: 24px 20px; }
    /* One row, however many fit the window. */
    .grid.shelf { grid-template-rows: auto; grid-auto-rows: 0; row-gap: 0; overflow: hidden; }
    .card { display: block; min-width: 0; text-align: left; }
    .card:active { transform: scale(.98); }
    .art { display: block; overflow: hidden; aspect-ratio: 1; background: var(--art); }
    .card.round .art { border-radius: 50%; }
    .art img, .art .blank { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .5s var(--ease); }
    .card:hover .art img { transform: scale(1.02); }
    .card b, .card span.sub { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .card b { margin-top: 10px; font-weight: 500; }
    .card span.sub { color: var(--mute); font-size: 13px; }

    .head { display: flex; gap: 28px; align-items: flex-end; margin-bottom: 28px; }
    .head > img, .head > .blank { width: 208px; height: 208px; object-fit: cover; flex: none; background: var(--art); }
    .head p { color: var(--mute); margin-top: 10px; }
    .play { margin-top: 18px; padding: 9px 26px; background: var(--fg); color: var(--bg); font-weight: 600; border-radius: 999px; }
    .play:hover { background: var(--play-hover); transform: scale(1.04); }
    .acts { display: flex; gap: 10px; }
    .play.alt { background: transparent; color: var(--fg); box-shadow: inset 0 0 0 1px var(--alt-line); }
    .play.alt:hover { background: var(--press); }
    .play.alt:disabled { color: var(--mute); transform: none; }

    .row { display: grid; grid-template-columns: 32px 40px minmax(0, 1fr) minmax(0, .7fr) 28px 52px; gap: 12px; align-items: center;
      width: 100%; padding: 6px 10px; }
    .row:hover { background: var(--hover); }
    .recent .row { grid-template-columns: 40px minmax(0, 1fr) minmax(0, .7fr) 28px 52px; width: calc(100% + 20px); margin: 0 -10px; }
    .recent .row .n { display: none; }
    .foldbutton { display: inline-flex; align-items: center; gap: 8px; color: inherit; font: inherit; }
    .foldbutton:hover { color: var(--fg); }
    .foldbutton:active { transform: none; }
    .foldbutton svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.5; transition: transform .3s var(--ease); }
    .foldbutton.on svg { transform: rotate(180deg); }
    .fold { display: grid; grid-template-rows: 0fr; visibility: hidden; transition: grid-template-rows .4s var(--ease), visibility .4s; }
    .fold.on { grid-template-rows: 1fr; visibility: visible; }
    /* Room either side for the rows, which reach 10px past the column. */
    .fold > div { min-height: 0; overflow: hidden; margin: 0 -10px; padding: 0 10px; }
    .fold > div > :first-child { margin-top: 14px; }
    .foldhead { margin-bottom: 0; }
    .fold + h2 { margin-top: 26px; }
    .row .n { color: var(--faint); justify-content: flex-end; font-variant-numeric: tabular-nums; height: 20px; }
    .row:hover .n { color: var(--fg); }
    .row img, .row .blank { width: 40px; height: 40px; object-fit: cover; background: var(--art); }
    .row .t, .row .al { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .row .al, .row .d { color: var(--mute); font-size: 13px; }
    .artist { cursor: pointer; transition: color .15s; }
    .artist:hover { color: var(--fg); text-decoration: underline; }
    .row .t small { display: block; color: var(--mute); font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
    .row .d { text-align: right; font-variant-numeric: tabular-nums; }
    .row.now .t { font-weight: 700; }
    .row .eq { display: none; gap: 2px; align-items: flex-end; height: 14px; }
    .row .eq i { width: 3px; height: 100%; background: var(--fg); transform-origin: bottom; animation: bars .9s ease-in-out infinite alternate; }
    .row .eq i:nth-child(2) { animation-delay: -.45s; } .row .eq i:nth-child(3) { animation-delay: -.2s; }
    .row.now .eq { display: flex; }
    .row.now .num { display: none; }
    #app.paused .row .eq i { animation-play-state: paused; }
    @keyframes bars { from { transform: scaleY(.25); } to { transform: scaleY(1); } }
    .row .q { color: var(--mute); opacity: 0; }
    .row:hover .q { opacity: 1; }
    .row .q:hover { color: var(--fg); }

    .set { max-width: 760px; padding: 10px 0; }
    .line { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .line b { font-weight: 500; font-size: 15px; }
    .sub + .sub { margin-top: 20px; }
    /* The middle column stays centred, with the same space either side of it. */
    .setpage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 788px) minmax(178px, 1fr); }
    .setmain { grid-column: 2; min-width: 0; }
    .setmain h1 { padding-left: 28px; }
    .setbody { position: relative; padding-left: 28px; }
    /* In real screen pixels, so the 7 wide dots always centre on the 1 wide line at any zoom. */
    .setbody { --dot-px: calc(1px / var(--zoom, 1)); }
    .setbody::before { content: ""; position: absolute; left: calc(var(--dot-px) * 3); top: 30px; bottom: 0; width: var(--dot-px); background: var(--line); }
    .setbody h2 { position: relative; margin: 40px 0 10px; transition: color .25s; }
    .setbody h2:first-child { margin-top: 24px; }
    .setbody h2::before { content: ""; position: absolute; left: -28px; top: 50%; width: calc(var(--dot-px) * 7); height: calc(var(--dot-px) * 7); margin-top: calc(var(--dot-px) * -3.5); box-sizing: border-box; border-radius: 50%;
      background: var(--bg); border: var(--dot-px) solid var(--faint); transition: background-color .25s, border-color .25s, transform .3s var(--ease); }
    .setbody h2.on { color: var(--fg); }
    .setbody h2.on::before { background: var(--fg); border-color: var(--fg); transform: scale(1.3); }
    /* Holds no height of its own: each name is placed level with its section from the top of the view. */
    .setnav { position: sticky; top: 0; grid-column: 3; align-self: start; justify-self: center; width: 130px; height: 0; }
    .setnav button { position: absolute; left: 14px; right: 0; top: -13px; display: flex; align-items: center; justify-content: flex-start; height: 26px; color: var(--mute); font-size: 13px; transform-origin: left center;
      transition: color .25s, opacity .3s, scale .35s var(--ease), transform .25s var(--ease); animation: set-in .45s var(--ease) backwards; animation-delay: calc(var(--n) * 45ms + 120ms); }
    .setnav button.stacked { opacity: .55; scale: .93; }
    .setnav button:hover { color: var(--fg); transform: translateX(3px); }
    .setnav button:active { transform: translateX(3px) scale(.97); }
    .setnav button.on { color: var(--fg); font-weight: 500; opacity: 1; scale: 1; }
    @keyframes set-in { from { opacity: 0; transform: translateX(14px); } }
    .setmark { position: absolute; left: 0; top: -8px; width: 2px; height: 16px; border-radius: 1px; background: var(--fg); }
    @media (max-width: 960px) { .setpage { grid-template-columns: minmax(0, 1fr); } .setmain { grid-column: 1; } .setnav { display: none; } }
    .set p { color: var(--mute); font-size: 13px; margin-top: 4px; max-width: 560px; }
    .value { color: var(--mute); font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
    .wide { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
    .switch { width: 42px; height: 24px; border-radius: 999px; background: var(--track); position: relative; flex: none; transition: background-color .25s; }
    .switch::after { content: ""; position: absolute; left: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--knob); transition: transform .3s var(--ease), background-color .25s; }
    .switch.on { background: var(--fg); }
    .switch.on::after { transform: translateX(18px); background: var(--bg); }
    .switch:active { transform: none; }
    .switch[disabled] { opacity: .35; cursor: default; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    .chips.theme, .chips.recent { margin-top: 0; }
    .chip.searched { display: inline-flex; align-items: center; gap: 6px; padding: 0 7px 0 14px; color: var(--mute); }
    .chip.searched > button:first-child { padding: 5px 0; }
    .chip.searched > button:first-child:hover { color: var(--fg); }
    .chip.searched .ico { width: 15px; height: 15px; transition: color .15s, transform .25s var(--ease); }
    .chip.searched .ico:hover { transform: rotate(90deg); }
    .chip { padding: 5px 14px; border: 1px solid var(--track); border-radius: 999px; color: var(--mute); font-size: 13px; }
    .chip:hover { color: var(--fg); border-color: var(--faint); }
    .chip.on { background: var(--fg); border-color: var(--fg); color: var(--bg); }
    .eqbox { position: relative; margin-top: 22px; transition: opacity .3s; }
    .eqbox.off { opacity: .3; pointer-events: none; }
    .curve { position: absolute; inset: 0 0 26px; width: 100%; height: calc(100% - 26px); pointer-events: none; }
    .curve path { fill: none; stroke: var(--curve); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .bands { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; position: relative; }
    .band { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--mute); font-size: 11px; }
    input[type=range] { -webkit-appearance: none; appearance: none; flex: 1; min-width: 0; height: 14px; background: none; cursor: pointer; outline: none; --p: 0%; }
    input[type=range]::-webkit-slider-runnable-track { height: 3px; background: linear-gradient(to right, var(--fg) var(--p), var(--track) var(--p)); transition: height .15s; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; margin-top: -4px; border-radius: 50%; background: var(--fg); transform: scale(0); transition: transform .18s var(--ease); }
    input[type=range]:hover::-webkit-slider-thumb, input[type=range]:active::-webkit-slider-thumb, .wide input[type=range]::-webkit-slider-thumb { transform: scale(1); }
    input.vertical { flex: none; writing-mode: vertical-lr; direction: rtl; width: 14px; height: 150px; }
    input.vertical::-webkit-slider-runnable-track { width: 3px; height: 100%; background: linear-gradient(to top, var(--fg) var(--p), var(--track) var(--p)); }
    input.vertical::-webkit-slider-thumb { margin-top: 0; margin-left: -4px; transform: scale(1); }

    footer { position: relative; grid-column: 1 / -1; display: grid; align-items: center; gap: 24px; z-index: 5;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); padding: 0 16px; }
    /* What scrolls towards the bar melts into the background instead of ending at a hard edge. */
    footer::before { content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 28px; pointer-events: none;
      background: linear-gradient(to top, color-mix(in srgb, var(--bg) 80%, transparent), color-mix(in srgb, var(--bg) 35%, transparent) 45%, transparent); }
    .seek { position: absolute; left: 0; right: 0; top: -7px; width: 100%; }
    .seek::-webkit-slider-runnable-track { height: 2px; }
    .seek::-webkit-slider-thumb { margin-top: -4.5px; }
    .np { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .np img { width: 40px; height: 40px; object-fit: cover; cursor: pointer; background: var(--art); transition: transform .25s var(--ease); }
    .np img:hover { transform: scale(1.06); }
    .np img:not([src]), .np img[src=""] { visibility: hidden; }
    .np div { min-width: 0; }
    .np b, .np span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .np b { font-size: 13px; font-weight: 500; }
    .np span { color: var(--mute); font-size: 12px; }
    .btns { display: flex; gap: 20px; align-items: center; }
    .ico { color: var(--mute); width: 18px; height: 18px; flex: none; }
    .np .ico { width: 15px; height: 15px; }
    .ico:hover, .ico.on { color: var(--fg); }
    .ico:hover { transform: scale(1.12); }
    .ico.dim { color: var(--faint); }
    .ico svg { width: 100%; height: 100%; fill: currentColor; }
    .big { width: 28px; height: 28px; color: var(--fg); }
    .time { color: var(--mute); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; margin-right: 8px; }
    .right { display: flex; justify-content: flex-end; align-items: center; gap: 10px; }
    .right input { flex: 0 1 88px; }

    #full { position: absolute; inset: 36px 0 64px 0; z-index: 2; background: var(--bg); display: grid; place-items: center; overflow: hidden;
      opacity: 0; visibility: hidden; transition: opacity .3s, visibility .3s; }
    #full.on { opacity: 1; visibility: visible; }
    #full figure { display: flex; flex-direction: column; align-items: center; gap: 24px; transform: scale(.82) translateY(40px); transition: transform .55s var(--ease); }
    #full.on figure { transform: none; }
    #full img { width: min(62vh, 62vw); height: min(62vh, 62vw); object-fit: cover; background: var(--art); }
    #full figcaption { text-align: center; max-width: 70vw; }
    #full b { display: block; font: 600 30px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; }
    #full span { color: var(--mute); font-size: 16px; }
    #full .close { position: absolute; top: 12px; right: 24px; color: var(--mute); }
    #full .close:hover { color: var(--fg); }

    #focus { position: absolute; inset: 0; z-index: 10; overflow: hidden; background: var(--bg); display: grid; align-items: center; gap: 6vw;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); padding: 0 7vw; opacity: 0; visibility: hidden; transition: opacity .5s, visibility .5s; }
    #focus.on { opacity: 1; visibility: visible; }
    #focus.plain, #focus.nolyrics { grid-template-columns: minmax(0, 1fr); justify-items: center; }
    #focus.plain .lyrics, #focus.nolyrics .lyrics { display: none; }
    #focus.nolyrics .stage { justify-self: center; }
    .stage { position: relative; justify-self: end; transform: scale(.9); opacity: 0; transition: transform .8s var(--ease), opacity .6s; }
    #focus.plain .stage { justify-self: center; }
    #focus.on .stage { transform: none; opacity: 1; }
    .stage .glow { position: absolute; left: calc(var(--glow-grow, 14) * -1%); top: calc(var(--glow-grow, 14) * -1%); width: calc(100% + var(--glow-grow, 14) * 2%); aspect-ratio: 1; object-fit: cover; filter: blur(var(--glow-soft, 90px)); opacity: 0; pointer-events: none; transition: opacity .7s ease-in-out; will-change: opacity; }
    .stage .glow.lit { opacity: var(--focus-blur, .22); }
    .stage .cover { position: relative; display: block; width: min(58vh, 36vw); aspect-ratio: 1; object-fit: cover; background: var(--art);
      transform: perspective(1100px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)); transition: transform .3s ease-out; }
    .stage .cover.layer { position: absolute; left: 0; top: 0; }
    .stage img:not([src]), .stage img[src=""] { visibility: hidden; }
    .meta { position: relative; margin-top: 22px; max-width: min(58vh, 36vw); }
    .meta b, .meta span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .meta b { font: 600 24px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; }
    .meta span { color: var(--mute); font-size: 15px; margin-top: 2px; }
    .lyrics { position: relative; height: 100vh; overflow: hidden; -webkit-mask-image: linear-gradient(transparent, #000 22%, #000 78%, transparent); }
    .lyrics.unsynced { overflow-y: auto; }
    .lyr { transition: transform 1.1s cubic-bezier(.22, .9, .24, 1); will-change: transform; }
    .lyrics.unsynced .lyr { padding: 22vh 0; transform: none !important; }
    .fl { padding: 11px 0; cursor: pointer; font: 600 32px/1.25 "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; color: #333;
      transform-origin: left center; transition: color .9s, transform 1s var(--ease); user-select: text; }
    .fl:hover { color: #6a6a6a; }
    .fl.past { color: #2a2a2a; }
    .fl.on { color: #4a4a4a; transform: scale(1.03); }
    .lyrics.unsynced .fl { color: #d0d0d0; cursor: default; font-size: 26px; }
    .fl .w { display: inline-block; white-space: pre; transition: text-shadow .8s; }
    /* The light runs through each word with a soft edge, and a sung word glows a little. */
    .fl.on .w { color: transparent; -webkit-background-clip: text; background-clip: text;
      background-image: linear-gradient(90deg, #fff calc(var(--w, 0%) * 1.22 - 22%), #4a4a4a calc(var(--w, 0%) * 1.22)); }
    .fl.on .w.lit { text-shadow: 0 0 14px rgba(255, 255, 255, .3); }
    .fctl { position: absolute; left: 50%; bottom: 26px; display: flex; gap: 22px; align-items: center; transform: translate(-50%, 10px);
      opacity: 0; transition: opacity .3s, transform .3s var(--ease); }
    #focus.awake .fctl { opacity: 1; transform: translate(-50%, 0); }
    #focus.asleep { cursor: none; }
    .fline { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--fg); opacity: calc(.7 + .3 * var(--beat, 0)); }
    .fline::after { content: ''; position: absolute; inset: 0; box-shadow: 0 0 16px 2px #fff; opacity: var(--beat, 0); }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  `;

  const ICON = {
    play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
    prev: 'M6 5h2v14H6zM20 5v14L9 12z', next: 'M16 5h2v14h-2zM4 5v14l11-7z',
    shuffle: 'M16 4l4 4-4 4V9h-2.6l-7 8H3v-2h2.5l7-8H16zM3 7h3.4l2.5 2.9-1.3 1.5L5.5 9H3zm13 8h-1.5l-1.6-1.8 1.3-1.5 1.2 1.3H16v-2l4 4-4 4z',
    repeat: 'M7 7h10V4l4 4-4 4V9H7v3H5V9a2 2 0 012-2zm10 10H7v3l-4-4 4-4v3h10v-3h2v3a2 2 0 01-2 2z',
    heart: 'M12 20.3l-1.4-1.3C5.4 14.4 2 11.3 2 7.6 2 4.6 4.4 2.3 7.4 2.3c1.7 0 3.3.8 4.6 2.1 1.3-1.3 2.9-2.1 4.6-2.1 3 0 5.4 2.3 5.4 5.3 0 3.7-3.4 6.8-8.6 11.4z',
    volume: 'M4 9v6h4l5 5V4L8 9zm12 3a4 4 0 00-2-3.5v7A4 4 0 0016 12z',
    muted: 'M4 9v6h4l5 5V4L8 9zm17.6.8l-1.4-1.4-2.2 2.2-2.2-2.2-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4-2.2-2.2z',
    focus: 'M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 0h2v5h-5v-2h3z',
    queue: 'M4 6h13v2H4zM4 11h13v2H4zM4 16h8v2H4zM15 14.500V20l5-2.750z',
    lyrics: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h10v2H4z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z', close: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.600 10.600 12 5 6.400z',
  };
  const WIN = {
    dots: 'M1.5 4a1 1 0 100 2 1 1 0 000-2zM5 4a1 1 0 100 2 1 1 0 000-2zM8.500 4a1 1 0 100 2 1 1 0 000-2z',
    min: 'M0 5.5h10', max: 'M.5.5h9v9h-9z', restore: 'M2.5 2.5V.5h7v7h-2M.5 2.500h7v7h-7z', close: 'M.5.5l9 9M9.500.5l-9 9',
  };

  const NS = 'http://www.w3.org/2000/svg';
  const h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value);
    }
    el.append(...kids.flat().filter(k => k !== null && k !== undefined));
    return el;
  };
  const svg = (d, box) => {
    const root = document.createElementNS(NS, 'svg');
    root.setAttribute('viewBox', box);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    root.append(path);
    return root;
  };
  const svgIcon = name => svg(ICON[name], '0 0 24 24');
  const iconButton = (name, label, onclick, cls = 'ico') => {
    const el = h('button', { className: cls, title: label, ariaLabel: label, onclick }, svgIcon(name));
    el.dataset.icon = name;
    return el;
  };
  const setIcon = (button, name) => {
    if (button.dataset.icon === name) return;
    button.dataset.icon = name;
    button.replaceChildren(svgIcon(name));
    button.firstChild.animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: EASE });
  };
  const logo = () => {
    const root = document.createElementNS(NS, 'svg');
    root.setAttribute('viewBox', '0 0 100 100');
    const disc = document.createElementNS(NS, 'circle');
    for (const [k, v] of [['cx', 50], ['cy', 50], ['r', 50]]) disc.setAttribute(k, v);
    disc.style.fill = 'var(--fg)';
    const mark = document.createElementNS(NS, 'path');
    mark.setAttribute('d', LOGO_M);
    mark.style.fill = 'var(--bg)';
    root.append(disc, mark);
    return root;
  };

  // An album cover's address starts with its size, so any size can be asked for. The desktop app's
  // data has no widths to choose by. Other pictures, such as playlist mosaics, stay as they are.
  const COVER_SIZES = { small: 'ab67616d00004851', medium: 'ab67616d00001e02', large: 'ab67616d0000b273', full: 'ab67616d000082c1' };
  const sized = (url, size) => {
    const address = String(url || '').replace('spotify:image:', 'https://i.scdn.co/image/');
    const id = address.split('/').pop();
    return id.length === 40 && id.startsWith('ab67616d') ? 'https://i.scdn.co/image/' + COVER_SIZES[size] + id.slice(16) : address;
  };
  const plain = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!(window.__meloir && window.__meloir.prefs.still);

  const firstThatLoads = async urls => {
    for (const url of urls) {
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
        return image;
      } catch (e) { /* the next size */ }
    }
    return null;
  };

  // The new picture loads first, then fades in on a layer over the old one, which it replaces at
  // the end. A newer song takes over from a fade still running. Not every cover has every size.
  const startFade = (img, layer, visible) => {
    const url = layer.src;
    if (img.__meloirLayer) img.__meloirLayer.remove();
    img.__meloirLayer = null;
    if (!visible || !img.getAttribute('src') || !img.offsetWidth || calm()) {
      img.src = url;
      return;
    }
    // The loaded image itself becomes the layer, so it shows on the first frame.
    layer.className = img.className;
    layer.alt = '';
    if (img.classList.contains('cover')) layer.classList.add('layer');
    else layer.style.cssText = `position: absolute; margin: 0; left: ${img.offsetLeft}px; top: ${img.offsetTop}px; width: ${img.offsetWidth}px; height: ${img.offsetHeight}px;`;
    img.after(layer);
    img.__meloirLayer = layer;
    layer.animate([{ opacity: 0 }, { opacity: getComputedStyle(img).opacity }], { duration: COVER_FADE_MS, easing: 'ease-in-out' }).onfinish = async () => {
      if (img.__meloirLayer !== layer) return;
      img.src = url;
      await img.decode().catch(() => {});
      if (img.__meloirLayer !== layer) return;
      layer.remove();
      img.__meloirLayer = null;
    };
  };

  const fadeTo = async (img, urls, visible) => {
    const request = img.__meloirRequest = {};
    const image = await firstThatLoads(urls);
    if (image && img.__meloirRequest === request) startFade(img, image, visible);
  };

  const cover = (images, small) => {
    const list = images || [];
    const image = small ? list[list.length - 1] : list[0];
    if (!image || !image.url) return h('div', { className: 'blank' });
    const size = !small ? 'large' : devicePixelRatio > 1.5 ? 'medium' : 'small';
    return h('img', { src: sized(image.url, size), alt: '', loading: 'lazy', decoding: 'async' });
  };
  const time = ms => {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const names = artists => (artists || []).map(a => a.name).join(', ');
  const fill = (range, value, max, min = 0) => {
    if (+range.min !== min) range.min = min;
    if (+range.max !== max) range.max = max;
    if (+range.value !== value) range.value = value;
    range.style.setProperty('--p', (max > min ? (value - min) / (max - min) * 100 : 0) + '%');
  };
  const mount = (meloir, me) => {
    const main = h('main');
    const lists = h('div', { className: 'lists' });
    const links = {};
    let viewId = 0;
    let currentUri = null;

    // Rows and cards rise in as they cross the bottom edge going down, and sink back out crossing
    // it going up. The stylesheet times the move, so it plays in full and reverses smoothly.
    // Anything leaving at the top stays as it is.
    const nearby = new IntersectionObserver(entries => {
      let order = 0;
      for (const entry of entries) {
        const el = entry.target;
        const inView = entry.intersectionRatio >= (el.classList.contains('card') ? CARD_SHOWN_AT : ROW_SHOWN_AT);
        const belowEdge = !inView && entry.boundingClientRect.top > entry.rootBounds.top + entry.rootBounds.height / 2;
        el.style.setProperty('--d', (belowEdge ? 0 : Math.min(order++, MAX_REVEAL_STAGGER) * 16) + 'ms');
        el.classList.toggle('below', belowEdge);
      }
    }, { root: main, threshold: [CARD_SHOWN_AT, ROW_SHOWN_AT] });
    const followScroll = root => root.querySelectorAll('.row, .card, .bar').forEach(el => nearby.observe(el));

    // The rise when a page opens.
    const stagger = root => {
      followScroll(root);
      root.querySelectorAll('h1, h2, .head, .set, .search, .note, .nums > .num').forEach((el, i) => {
        el.style.setProperty('--i', Math.min(i, MAX_REVEAL_STAGGER));
        el.classList.add('rise');
      });
      riseIn(root.querySelectorAll('.row, .card, .bar'), main.getBoundingClientRect().bottom);
    };
    const riseIn = (els, bottom) => {
      if (calm()) return;
      let order = 0;
      for (const el of els) {
        if (el.getBoundingClientRect().top >= bottom) continue;
        el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 350, delay: Math.min(order++, MAX_REVEAL_STAGGER) * 16, easing: EASE, fill: 'backwards' });
      }
    };

    const show = async (key, build) => {
      const id = ++viewId;
      for (const [name, link] of Object.entries(links)) link.classList.toggle('on', name === key);
      placeNavMark();
      full.classList.remove('on');
      nearby.disconnect();
      main.onscroll = null;
      main.replaceChildren();
      main.scrollTop = 0;
      try {
        const content = await build();
        if (id !== viewId) return;
        main.replaceChildren(...[content].flat());
      } catch (e) {
        if (id !== viewId) return;
        main.replaceChildren(h('h1', {}, 'Could not load this'), h('p', { className: 'note' }, e.message));
      }
      stagger(main);
    };

    // The right-click menu.
    const menu = h('div', { id: 'menu' });
    const closeMenu = () => menu.classList.remove('on');
    const toast = h('div', { id: 'toast' });
    let toastTimer = 0;
    const showToast = (text, action) => {
      clearTimeout(toastTimer);
      toast.replaceChildren(h('span', {}, text));
      if (action) toast.append(h('button', { onclick: () => { toast.classList.remove('on'); action[1](); } }, action[0]));
      toast.classList.add('on');
      if (!action) toastTimer = setTimeout(() => toast.classList.remove('on'), TOAST_MS);
    };

    const showMenu = (event, items) => {
      menu.replaceChildren(...items.filter(Boolean).map(item => (item instanceof Node ? item
        : h('button', { onclick: () => { closeMenu(); item[1](); } }, item[0]))));
      menu.classList.remove('on');
      void menu.offsetWidth;
      menu.classList.add('on');
      const bounds = menu.getBoundingClientRect();
      menu.style.left = Math.max(4, Math.min(event.clientX, innerWidth - bounds.width - 8)) + 'px';
      menu.style.top = Math.max(4, Math.min(event.clientY, innerHeight - bounds.height - 8)) + 'px';
    };
    const idFrom = uri => String(uri).split(':').pop();

    const addToPlaylist = async (uri, name, track) => {
      try {
        await meloir.services.playlists.add(uri, [track.uri], { after: 'end' });
        showToast('Added to ' + name);
      } catch (e) {
        showToast('Could not add to ' + name);
      }
    };
    const newPlaylist = (event, track) => {
      const input = h('input', { className: 'newlist', placeholder: 'Playlist name', spellcheck: false, ariaLabel: 'Playlist name', onkeydown: async e => {
        if (e.key !== 'Enter' || !input.value.trim()) return;
        const name = input.value.trim();
        closeMenu();
        const uri = await meloir.services.rootlist.createPlaylist(name, { after: 'end' }).catch(() => null);
        if (!uri) return showToast('Could not create ' + name);
        if (track) await addToPlaylist(uri, name, track);
        library = null;
        lists.prepend(link('pl' + idFrom(uri), name, () => openPlaylist(idFrom(uri))));
        if (!track) openPlaylist(idFrom(uri));
      } });
      showMenu(event, [input]);
      input.focus();
    };
    const pickPlaylist = async (event, track) => {
      const lists = await meloir.data.ownPlaylists().catch(() => []);
      showMenu(event, [['New playlist', () => newPlaylist(event, track)], ...lists.map(list => [list.name, () => addToPlaylist(list.uri, list.name, track)])]);
    };

    const trackMenu = async (event, track, extra = []) => {
      event.preventDefault();
      event.stopPropagation();
      const { library, player } = meloir.services;
      const liked = await Promise.resolve(library.contains(track.uri)).then(([yes]) => !!yes).catch(() => false);
      const artist = (track.artists || []).find(a => a.uri);
      showMenu(event, [
        ...extra,
        ['Add to queue', () => player.addToQueue([{ uri: track.uri }])],
        ['Add to playlist', () => pickPlaylist(event, track)],
        ['Song radio', () => meloir.data.songRadio(track).then(radio => meloir.playList(radio.uri, radio.tracks.map(t => t.uri))).catch(() => {})],
        track.album && track.album.uri ? ['Go to album', () => openAlbum(idFrom(track.album.uri))] : null,
        artist ? ['Go to artist', () => openArtist(idFrom(artist.uri))] : null,
        [liked ? 'Remove from Liked Songs' : 'Add to Liked Songs', () => (liked ? library.remove({ uris: [track.uri] }) : library.add({ uris: [track.uri] }))],
      ]);
    };

    const card = (item, onclick, sub, round) => h('button', { className: 'card' + (round ? ' round' : ''), onclick,
      oncontextmenu: event => {
        event.preventDefault();
        event.stopPropagation();
        showMenu(event, [item.uri ? ['Play', () => meloir.play(item.uri)] : null, ['Open', onclick]]);
      } },
      h('span', { className: 'art' }, cover(item.images)), h('b', {}, item.name), h('span', { className: 'sub' }, sub || ''));
    const open = item => {
      if (item.type === 'album') return openAlbum(item.id);
      if (item.type === 'artist') return openArtist(item.id);
      return openPlaylist(item.id);
    };
    const itemCard = item => card(item, () => open(item),
      item.type === 'album' ? names(item.artists) : item.type === 'artist' ? 'Artist' : item.owner && item.owner.display_name, item.type === 'artist');
    const grid = items => h('div', { className: 'grid' }, items.filter(Boolean).map(itemCard));

    // Leaving focus mode this way shouldn't scroll the artist page back to the old place.
    const goToArtist = artist => {
      focusScroll = null;
      setFocus(false);
      openArtist(idFrom(artist.uri));
    };
    const artistLink = artist => (artist.uri ? h('a', { className: 'artist', ondblclick: event => event.stopPropagation(), onclick: event => {
      event.stopPropagation();
      goToArtist(artist);
    } }, artist.name) : artist.name);
    const artistLinks = artists => (artists || []).flatMap((artist, n) => (n ? [', ', artistLink(artist)] : [artistLink(artist)]));

    const row = (track, index, contextUri, withCover = true, playRow = null) => {
      const play = () => (playRow ? playRow(track) : meloir.play(contextUri || (track.album && track.album.uri), track.uri));
      const el = h('div', { className: 'row' + (track.uri === currentUri ? ' now' : ''), ondblclick: play, oncontextmenu: event => trackMenu(event, track) },
        h('button', { className: 'n', title: 'Play', onclick: play },
          h('span', { className: 'num' }, String(index + 1)), h('span', { className: 'eq' }, h('i'), h('i'), h('i'))),
        withCover ? cover(track.album && track.album.images, true) : h('span'),
        h('div', { className: 't' }, track.name, h('small', {}, artistLinks(track.artists))),
        h('div', { className: 'al' }, (track.album && track.album.name) || ''),
        iconButton('plus', 'Add to queue', () => meloir.services.player.addToQueue([{ uri: track.uri }]), 'ico q'),
        h('div', { className: 'd' }, time(track.duration_ms)));
      el.dataset.uri = track.uri;
      el.dataset.find = plain([track.name, names(track.artists), track.album && track.album.name].join(' '));
      el.track = track;
      return el;
    };

    // Long lists arrive in pages as the view nears the bottom, so they stay light. A filter asks for
    // the rest at once, since it has to look through every song.
    const pagedRows = (first, size, total, getPage, contextUri) => {
      const view = viewId;
      const list = h('div', {}, first.map((t, n) => row(t, n, contextUri, true, t => playRow(t))));
      const none = h('p', { className: 'note', style: 'display: none' }, 'No songs match');
      let offset = size, loading = null, finished = first.length === 0 || offset >= total, query = '', genre = '';
      const leadOf = el => (el.track.artists || [])[0] || {};
      const apply = () => {
        let shown = 0;
        for (const el of list.children) {
          const name = meloir.data.genreOf(leadOf(el).uri);
          const match = (!query || el.dataset.find.includes(query) || plain(name).includes(query)) && (!genre || name === genre);
          el.style.display = match ? '' : 'none';
          if (match) shown++;
        }
        none.style.display = (query || genre) && !shown && finished ? '' : 'none';
      };
      const nextPage = () => loading || (loading = (async () => {
        try {
          const page = await getPage(offset);
          if (view !== viewId) return;
          const rows = page.map((t, n) => row(t, list.children.length + n, contextUri, true, t => playRow(t)));
          list.append(...rows);
          rows.forEach(el => nearby.observe(el));
          offset += size;
          finished = page.length === 0 || offset >= total;
          if (query || genre) apply();
        } finally {
          loading = null;
        }
      })());
      const more = async () => {
        if (finished || view !== viewId || main.scrollTop + main.clientHeight < main.scrollHeight - 1200) return;
        await nextPage();
        more();
      };
      const loadAll = async () => { while (!finished && view === viewId) await nextPage(); };
      // With a filter on, Play means the songs on screen, not the whole list. Spotify replaces a list
      // sent under a real playlist's address with that playlist, so this one goes under an address of its own.
      const playShown = async from => {
        await loadAll();
        apply();
        const uris = [...list.children].filter(el => el.style.display !== 'none').map(el => el.dataset.uri);
        if (uris.length) await meloir.playList(FILTERED_LIST_URI, uris, from, meloir.services.player.getState().shuffle);
      };
      const playAll = () => (query || genre ? playShown() : meloir.play(contextUri));
      const playRow = track => (query || genre ? playShown(track.uri) : meloir.play(contextUri, track.uri));
      const box = h('input', { className: 'filter', placeholder: 'Search songs', spellcheck: false, ariaLabel: 'Search songs', oninput: async () => {
        query = plain(box.value.trim());
        apply();
        if (query) await loadAll();
        apply();
      } });

      // The genre menu lists what this list actually holds, with its own search.
      const genreLabel = h('span', {}, 'Genre');
      const genreList = h('div', { className: 'genrelist' });
      const genreNote = h('p', { className: 'genrenote' });
      const genreSearch = h('input', { className: 'filter', placeholder: 'Search genres', spellcheck: false, ariaLabel: 'Search genres', oninput: () => fillGenres() });
      const genrePanel = h('div', { className: 'genres' }, genreSearch, genreList, genreNote);
      const pick = name => {
        genre = name;
        genreLabel.textContent = name || 'Genre';
        genreButton.classList.toggle('on', !!name);
        closeGenres();
        apply();
        riseIn([...list.children].filter(el => el.style.display !== 'none'), main.getBoundingClientRect().bottom);
      };
      const fillGenres = () => {
        const counts = new Map();
        for (const el of list.children) {
          const name = meloir.data.genreOf(leadOf(el).uri);
          if (name) counts.set(name, (counts.get(name) || 0) + 1);
        }
        const wanted = plain(genreSearch.value.trim());
        const found = [...counts].filter(([name]) => plain(name).includes(wanted)).sort((a, b) => b[1] - a[1]);
        genreList.replaceChildren(...(wanted ? [] : [h('button', { className: genre ? '' : 'on', onclick: () => pick('') }, h('span', {}, 'All genres'))]),
          ...found.map(([name, count]) => h('button', { className: name === genre ? 'on' : '', onclick: () => pick(name) }, h('span', {}, name), h('small', {}, String(count)))));
      };
      const closeGenres = () => {
        genrePanel.classList.remove('on');
        window.removeEventListener('mousedown', outside, true);
      };
      const outside = event => { if (!event.composedPath().includes(genreWrap)) closeGenres(); };
      const openGenres = async () => {
        genrePanel.classList.add('on');
        window.addEventListener('mousedown', outside, true);
        genreSearch.value = '';
        setTimeout(() => genreSearch.focus(), GENRE_FOCUS_MS);
        fillGenres();
        await loadAll();
        const artists = [...list.children].map(leadOf);
        meloir.data.lookUpGenres(artists, left => {
          genreNote.textContent = left ? 'Finding genres, ' + left + ' artists left' : '';
          if (genrePanel.classList.contains('on')) fillGenres();
          if (genre) apply();
        });
      };
      const genreButton = h('button', { className: 'genrebutton', ariaLabel: 'Filter by genre',
        onclick: () => (genrePanel.classList.contains('on') ? closeGenres() : openGenres()) }, genreLabel, svg('M2 4l4 4 4-4', '0 0 12 12'));
      const genreWrap = h('div', { className: 'genrewrap' }, genreButton, genrePanel);

      main.onscroll = more;
      setTimeout(more);
      return { list, none, tools: [box, genreWrap], play: playAll };
    };

    const header = (images, title, sub, contextUri, extra, play = () => meloir.play(contextUri)) => h('div', { className: 'head' }, cover(images),
      h('div', {}, h('h1', {}, title), h('p', {}, sub),
        h('div', { className: 'acts' }, contextUri ? h('button', { className: 'play', onclick: play }, 'Play') : null, extra)));

    const mixButton = id => {
      const button = h('button', { className: 'play alt', title: 'Their songs, mixed with similar artists', onclick: async () => {
        button.disabled = true;
        button.textContent = 'Mixing';
        try {
          const { artist, tracks } = await meloir.data.artistMix(id);
          await meloir.playList(artist.uri, tracks.map(track => track.uri));
          button.textContent = 'Mix';
        } catch (e) {
          button.textContent = 'Try again';
        }
        button.disabled = false;
      } }, 'Mix');
      return button;
    };

    // One library read serves the sidebar, Home and Albums.
    let library = null;
    const getLibrary = () => library || (library = meloir.data.library().catch(e => { library = null; throw e; }));

    const saveButton = uri => {
      const saved = () => button.textContent === 'Saved';
      const button = h('button', { className: 'play alt', onclick: async () => {
        const removing = saved();
        button.disabled = true;
        try {
          await meloir.services.library[removing ? 'remove' : 'add']({ uris: [uri] });
          button.textContent = removing ? 'Save' : 'Saved';
          library = null;
        } catch (e) {
          // Stays as it was.
        }
        button.disabled = false;
      } }, 'Save');
      Promise.resolve(meloir.services.library.contains(uri)).then(([yes]) => { if (yes) button.textContent = 'Saved'; }).catch(() => {});
      return button;
    };

    // Stays as you left it, closed until you first open it.
    const recentFold = tracks => {
      const rows = h('div', { className: 'recent' }, tracks.map((t, n) => row(t, n)));
      const fold = h('div', { className: 'fold' }, rows);
      const setOpen = on => {
        fold.classList.toggle('on', on);
        button.classList.toggle('on', on);
        button.setAttribute('aria-expanded', String(on));
      };
      const button = h('button', { className: 'foldbutton', onclick: () => {
        const on = !meloir.prefs.recentOpen;
        meloir.setPref('recentOpen', on);
        setOpen(on);
        if (on) riseIn(rows.children, main.getBoundingClientRect().bottom);
      } }, 'Recently played', svg('M2 4l4 4 4-4', '0 0 12 12'));
      setOpen(!!meloir.prefs.recentOpen);
      return [h('h2', { className: 'foldhead' }, button), fold];
    };

    const recommended = () => {
      const box = h('div');
      const view = viewId;
      meloir.data.home().then(shelves => {
        if (view !== viewId) return;
        box.append(...shelves.flatMap(shelf => [h('h2', {}, shelf.title), h('div', { className: 'grid shelf' }, shelf.items.map(itemCard))]));
        stagger(box);
      }).catch(() => {});
      return box;
    };

    const openHome = () => show('home', async () => {
      const items = await getLibrary();
      const of = type => items.filter(i => i.type === type);
      const out = [h('h1', {}, 'Hello, ' + (me.display_name || 'you'))];
      const recent = meloir.prefs.history.slice(0, RECENT_ON_HOME);
      if (recent.length) out.push(...recentFold(recent));
      if (of('playlist').length) out.push(h('h2', {}, 'Your playlists'), grid(of('playlist')));
      if (of('album').length) out.push(h('h2', {}, 'Your albums'), grid(of('album')));
      if (of('artist').length) out.push(h('h2', {}, 'Your artists'), grid(of('artist')));
      if (out.length === 1) out.push(h('p', { className: 'note' }, 'Nothing here yet. Try Search.'));
      out.push(recommended());
      return out;
    });

    const openSearch = () => show('search', () => {
      const results = h('div');
      let timer = 0, keepTimer = 0;

      // A search counts once it has stayed in the box for a moment, so half-typed words are not kept.
      const keepSearch = q => {
        const others = meloir.prefs.searches.filter(old => !q.toLowerCase().startsWith(old.toLowerCase()));
        meloir.setPref('searches', [q, ...others].slice(0, MAX_SEARCHES));
      };
      const forget = q => {
        meloir.setPref('searches', meloir.prefs.searches.filter(old => old !== q));
        showRecent();
      };
      const showRecent = () => {
        const { searches } = meloir.prefs;
        const chips = searches.map(q => {
          const chip = h('div', { className: 'chip searched', oncontextmenu: event => {
            event.preventDefault();
            event.stopPropagation();
            showMenu(event, [['Remove', () => forget(q)]]);
          } }, h('button', { onclick: () => { input.value = q; find(); } }, q), iconButton('close', 'Remove ' + q, () => {
            if (calm()) return forget(q);
            chip.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).onfinish = () => forget(q);
          }));
          return chip;
        });
        results.replaceChildren(...(searches.length ? [h('h2', {}, 'Recent searches'), h('div', { className: 'chips recent' }, chips)] : []));
        riseIn(chips, innerHeight);
      };
      const find = async () => {
        const q = input.value.trim();
        clearTimeout(keepTimer);
        if (!q) return showRecent();
        try {
          const r = await meloir.data.search(q);
          if (input.value.trim() !== q) return;
          keepTimer = setTimeout(() => { if (input.isConnected && input.value.trim() === q) keepSearch(q); }, KEEP_SEARCH_MS);
          results.replaceChildren(
            h('h2', {}, 'Songs'), ...r.tracks.map((t, i) => row(t, i)),
            h('h2', {}, 'Artists'), grid(r.artists),
            h('h2', {}, 'Albums'), grid(r.albums),
            h('h2', {}, 'Playlists'), grid(r.playlists));
          stagger(results);
        } catch (e) {
          results.replaceChildren(h('p', { className: 'note' }, e.message));
        }
      };
      const input = h('input', { className: 'search', placeholder: 'Search', spellcheck: false, ariaLabel: 'Search',
        oninput: () => {
          clearTimeout(timer);
          timer = setTimeout(find, 250);
        } });
      setTimeout(() => { input.focus(); showRecent(); });
      return [input, results];
    });

    const openLiked = () => show('liked', async () => {
      const uri = 'spotify:user:' + me.id + ':collection';
      const [items, first] = await Promise.all([getLibrary(), meloir.data.liked(0)]);
      const info = items.find(i => i.type === 'liked') || {};
      const pages = pagedRows(first, meloir.data.likedPageSize, info.count === undefined ? Infinity : info.count, offset => meloir.data.liked(offset), uri);
      return [header(info.images, 'Liked Songs', (info.count === undefined ? first.length : info.count) + ' songs', uri, pages.tools, pages.play), pages.list, pages.none];
    });

    const openAlbums = () => show('albums', async () => {
      const [items, liked] = await Promise.all([getLibrary(), meloir.data.likedAlbums()]);
      const saved = items.filter(i => i.type === 'album');
      const uris = new Set(saved.map(album => album.uri));
      const others = liked.filter(album => !uris.has(album.uri));
      const out = [h('h1', {}, 'Albums')];
      if (saved.length) out.push(h('h2', {}, 'Saved'), grid(saved));
      if (others.length) out.push(h('h2', {}, 'From your Liked Songs'), h('div', { className: 'grid' }, others.map(album =>
        card(album, () => open(album), names(album.artists) + ' · ' + album.liked + ' liked'))));
      if (out.length === 1) out.push(h('p', { className: 'note' }, 'Nothing here yet. Save an album or like some songs.'));
      return out;
    });

    const openPlaylist = id => show('pl' + id, async () => {
      const p = await meloir.data.playlist(id);
      const pages = pagedRows(p.tracks, meloir.data.playlistPageSize, p.total, async offset => (await meloir.data.playlist(id, offset)).tracks, p.uri);
      return [header(p.images, p.name, [p.owner.display_name, p.total + ' songs'].filter(Boolean).join(' · '), p.uri, pages.tools, pages.play), pages.list, pages.none];
    });

    // Stats count a song once it has played for a while, and keep the most played ones.
    const openStats = () => show('stats', () => {
      const { stats } = meloir.prefs;
      if (!stats.plays) return [h('h1', {}, 'Stats'), h('p', { className: 'note' }, 'Nothing yet. Songs count here after 30 seconds of listening.')];
      const minutes = Math.round(stats.ms / 60000);
      // Up to a day it reads in hours and minutes, beyond that in days and hours.
      const listened = value => {
        const days = Math.floor(value / 1440), hours = Math.floor(value % 1440 / 60);
        if (days) return days + (days === 1 ? ' day ' : ' days ') + hours + ' h';
        return (hours ? hours + ' h ' : '') + (value % 60) + ' min';
      };
      const tracks = Object.values(stats.tracks).sort((a, b) => b.n - a.n).slice(0, STATS_TOP);
      const artists = Object.entries(stats.artists).map(([name, artist]) => ({ name, ...artist })).sort((a, b) => b.n - a.n);
      const number = (value, label, format = String) => {
        const shown = h('b', {}, format(calm() ? value : 0));
        if (!calm()) {
          const started = performance.now();
          const step = now => {
            const done = Math.min(1, (now - started) / STATS_COUNT_MS);
            shown.textContent = format(Math.round(value * (1 - Math.pow(1 - done, 3))));
            if (done < 1 && shown.isConnected) requestAnimationFrame(step);
          };
          setTimeout(() => requestAnimationFrame(step), 200);
        }
        return h('div', { className: 'num' }, shown, h('span', {}, label));
      };
      return [h('h1', {}, 'Stats'),
        h('p', { className: 'note' }, 'Since ' + new Date(stats.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })),
        h('div', { className: 'nums' }, number(minutes, 'Listened', listened), number(stats.plays, 'Plays'), number(artists.length, 'Artists')),
        h('h2', {}, 'Top songs'), ...tracks.map((t, n) => {
          const el = row(t, n);
          el.querySelector('.al').textContent = t.n + (t.n === 1 ? ' play' : ' plays');
          return el;
        }),
        h('h2', {}, 'Top artists'), ...artists.slice(0, STATS_TOP).map((artist, n) => h('button', { className: 'bar', style: '--n: ' + n,
          onclick: () => { if (artist.uri) openArtist(idFrom(artist.uri)); } },
          h('span', {}, artist.name), h('i', { style: 'width: ' + artist.n / artists[0].n * 100 + '%' }), h('small', {}, String(artist.n))))];
    });

    const openAlbum = id => show('album', async () => {
      const a = await meloir.data.album(id);
      return [header(a.images, a.name, [...artistLinks(a.artists), a.year ? ' · ' + a.year : ''], a.uri, saveButton(a.uri)),
        ...a.tracks.map((t, n) => row(t, n, a.uri, false))];
    });

    const openArtist = id => show('artist', async () => {
      const a = await meloir.data.artist(id);
      return [header(a.images, a.name, 'Artist', a.uri, mixButton(id)),
        h('h2', {}, 'Popular'), ...a.tracks.map((t, n) => row(t, n, a.uri)),
        h('h2', {}, 'Releases'), grid(a.releases)];
    });

    // Meloir.exe asks GitHub and reports back here. Nothing installs without a click.
    let update = { state: 'idle' }, paintUpdate = () => {};
    const askHost = message => { if (window.meloirHost) window.meloirHost(message); };
    const installUpdate = () => askHost('update:install');
    const UPDATE_TEXT = { idle: '', checking: 'Checking', none: 'You have the latest version.', failed: 'Could not check for updates.', installing: 'Installing. Meloir will reopen.', refused: 'The download did not match, so it was not installed.' };
    window.__meloirUpdate = info => {
      const fresh = info.state === 'available' && update.state !== 'available';
      update = info;
      paintUpdate();
      if (fresh) showToast('Meloir ' + info.tag + ' is available', ['Update', installUpdate]);
    };
    const updateRow = () => {
      const note = h('p');
      const button = h('button', { className: 'chip', onclick: () => {
        if (update.state === 'available') return installUpdate();
        window.__meloirUpdate({ state: 'checking' });
        askHost('update:check');
      } });
      paintUpdate = () => {
        const available = update.state === 'available';
        note.textContent = available ? update.tag + ' is ready to install.' : UPDATE_TEXT[update.state];
        button.textContent = available ? 'Update' : 'Check';
        button.disabled = update.state === 'checking' || update.state === 'installing';
      };
      paintUpdate();
      return h('div', { className: 'set' }, h('div', { className: 'line' }, h('b', {}, 'Meloir ' + (window.meloirVersion || '')), button), note);
    };

    const openSettings = () => show('settings', () => {
      const audio = meloir.audio;
      const s = audio.settings;

      const fadeValue = h('span', { className: 'value' });
      const fadeLabel = v => { fadeValue.textContent = v ? v + ' s' : 'Off'; };
      const fade = h('input', { type: 'range', step: 1, ariaLabel: 'Crossfade length',
        oninput: () => { fill(fade, +fade.value, 12); fadeLabel(+fade.value); audio.setCrossfade(+fade.value); } });
      fill(fade, s.crossfade, 12);
      fadeLabel(s.crossfade);

      const curvePath = document.createElementNS(NS, 'path');
      const curve = document.createElementNS(NS, 'svg');
      curve.setAttribute('class', 'curve');
      curve.setAttribute('viewBox', '0 0 100 100');
      curve.setAttribute('preserveAspectRatio', 'none');
      curve.append(curvePath);
      const drawCurve = () => {
        const points = s.gains.map((g, i) => [(i + .5) * 100 / s.gains.length, 50 - g / 12 * 44]);
        let d = 'M' + points[0].join(' ');
        for (let i = 1; i < points.length; i++) {
          const [x0, y0] = points[i - 1], [x1, y1] = points[i], mid = (x0 + x1) / 2;
          d += ` C${mid} ${y0} ${mid} ${y1} ${x1} ${y1}`;
        }
        curvePath.setAttribute('d', d);
      };

      const sliders = audio.BANDS.map((frequency, i) => {
        const slider = h('input', { type: 'range', className: 'vertical', step: 1, ariaLabel: frequency + ' hertz',
          oninput: () => { fill(slider, +slider.value, 12, -12); audio.setBand(i, +slider.value); drawCurve(); markPreset(); } });
        fill(slider, s.gains[i], 12, -12);
        return slider;
      });
      const bands = h('div', { className: 'bands' }, audio.BANDS.map((frequency, i) => h('div', { className: 'band' }, sliders[i],
        frequency >= 1000 ? frequency / 1000 + 'k' : String(frequency))));

      const chips = Object.keys(audio.PRESETS).map(name => h('button', { className: 'chip', onclick: () => {
        audio.setPreset(name);
        sliders.forEach((slider, i) => fill(slider, s.gains[i], 12, -12));
        drawCurve();
        markPreset();
      } }, name));
      const markPreset = () => chips.forEach(chip => chip.classList.toggle('on', chip.textContent === s.preset));
      markPreset();
      drawCurve();

      const autoMix = h('button', { className: 'switch' + (s.autoMix ? ' on' : ''), role: 'switch', ariaLabel: 'AutoMix',
        onclick: () => {
          audio.setAutoMix(!s.autoMix);
          autoMix.classList.toggle('on', s.autoMix);
        } });

      const prefSwitch = (name, label, onChange) => {
        const button = h('button', { className: 'switch' + (meloir.prefs[name] ? ' on' : ''), role: 'switch', ariaLabel: label,
          onclick: () => {
            meloir.setPref(name, !meloir.prefs[name]);
            button.classList.toggle('on', meloir.prefs[name]);
            if (onChange) onChange();
          } });
        return button;
      };
      const setting = (label, about, control, extra) => h('div', { className: 'set' },
        h('div', { className: 'line' }, h('b', {}, label), control), about ? h('p', {}, about) : null, extra);

      const smoothValue = h('span', { className: 'value' });
      const smoothLength = h('input', { type: 'range', step: 1, ariaLabel: 'Smooth transition length',
        oninput: () => {
          fill(smoothLength, +smoothLength.value, 8, 2);
          smoothValue.textContent = smoothLength.value + ' s';
          meloir.setPref('smoothSeconds', +smoothLength.value);
        } });
      fill(smoothLength, meloir.prefs.smoothSeconds, 8, 2);
      smoothValue.textContent = meloir.prefs.smoothSeconds + ' s';

      const idleText = seconds => {
        const minutes = Math.floor(seconds / 60), rest = seconds % 60;
        return [minutes ? minutes + ' min' : '', rest ? rest + ' s' : ''].filter(Boolean).join(' ');
      };
      const idleValue = h('span', { className: 'value' });
      const idleLength = h('input', { type: 'range', step: 15, ariaLabel: 'Idle fade delay',
        oninput: () => {
          fill(idleLength, +idleLength.value, MAX_IDLE_SECONDS, MIN_IDLE_SECONDS);
          idleValue.textContent = idleText(+idleLength.value);
          meloir.setPref('idleSeconds', +idleLength.value);
        } });
      fill(idleLength, meloir.prefs.idleSeconds, MAX_IDLE_SECONDS, MIN_IDLE_SECONDS);
      idleValue.textContent = idleText(meloir.prefs.idleSeconds);

      const box = h('div', { className: 'eqbox' + (s.eq ? '' : ' off') }, curve, bands);
      const toggle = h('button', { className: 'switch' + (s.eq ? ' on' : ''), role: 'switch', ariaLabel: 'Equalizer', disabled: s.eqBlocked,
        onclick: () => {
          audio.setEq(!s.eq);
          toggle.classList.toggle('on', s.eq);
          box.classList.toggle('off', !s.eq);
        } });

      const themeButtons = [['dark', 'Dark'], ['light', 'White']].map(([theme, label]) => h('button', { className: 'chip' + (meloir.prefs.theme === theme ? ' on' : ''),
        onclick: () => {
          const change = () => {
            meloir.setPref('theme', theme);
            applyLook();
            themeButtons.forEach(button => button.classList.toggle('on', button.textContent === label));
          };
          if (calm() || !document.startViewTransition) change();
          else document.startViewTransition(change);
        } }, label));
      const themeChips = h('div', { className: 'chips theme' }, themeButtons);

      const blurValue = h('span', { className: 'value' });
      const blurText = () => { blurValue.textContent = meloir.prefs.focusBlur ? meloir.prefs.focusBlur + '%' : 'Off'; };
      const blurLevel = h('input', { type: 'range', step: 1, ariaLabel: 'Blur behind the cover',
        oninput: () => {
          fill(blurLevel, +blurLevel.value, 100);
          meloir.setPref('focusBlur', +blurLevel.value);
          blurText();
          applyLook();
        } });
      fill(blurLevel, meloir.prefs.focusBlur, 100);
      blurText();

      const sizeValue = h('span', { className: 'value' });
      const sizeText = () => { sizeValue.textContent = meloir.prefs.focusBlurSize + '%'; };
      const blurSize = h('input', { type: 'range', step: 1, ariaLabel: 'Blur size',
        oninput: () => {
          fill(blurSize, +blurSize.value, 100);
          meloir.setPref('focusBlurSize', +blurSize.value);
          sizeText();
          applyLook();
        } });
      fill(blurSize, meloir.prefs.focusBlurSize, 100);
      sizeText();

      const glowSwitch = (label, about, name, onChange) => h('div', { className: 'line sub' },
        h('div', {}, h('b', {}, label), h('p', {}, about)), prefSwitch(name, name === 'cursorGlow' ? 'Cursor glow' : 'Glow on ' + label.toLowerCase(), onChange));

      const backdropValue = h('span', { className: 'value' });
      const backdropLevel = h('input', { type: 'range', step: 1, ariaLabel: 'Cover backdrop strength',
        oninput: () => {
          fill(backdropLevel, +backdropLevel.value, 100);
          meloir.setPref('coverBackdropLevel', +backdropLevel.value);
          backdropValue.textContent = backdropLevel.value + '%';
          applyLook();
        } });
      fill(backdropLevel, meloir.prefs.coverBackdropLevel, 100);
      backdropValue.textContent = meloir.prefs.coverBackdropLevel + '%';

      const page = [
        h('h2', {}, 'Playback'),
        setting('Smooth transitions', 'Fades each song out, skips its last moments, and fades the next one in.', prefSwitch('smooth', 'Smooth transitions'),
          h('div', { className: 'wide' }, smoothLength, smoothValue)),
        h('div', { className: 'set' },
          h('div', { className: 'line' }, h('b', {}, 'Crossfade'), fadeValue),
          h('p', {}, 'Spotify\'s own blend between songs. It may need Premium.'),
          h('div', { className: 'wide' }, fade)),
        h('div', { className: 'set' },
          h('div', { className: 'line' }, h('b', {}, 'AutoMix'), autoMix),
          h('p', {}, 'Spotify\'s own mixing between songs. It may need Premium.')),
        setting('Play when Meloir opens', null, prefSwitch('playOnOpen', 'Play when Meloir opens')),

        h('h2', {}, 'Sound'),
        h('div', { className: 'set' },
          h('div', { className: 'line' }, h('b', {}, 'Equalizer'), toggle),
          h('p', {}, 'Spotify\'s own equalizer, with six bands.'),
          h('div', { className: 'chips' }, chips), box),

        h('h2', {}, 'Appearance'),
        setting('Theme', 'Focus mode stays black.', themeChips),
        setting('Compact lists', 'Hides track numbers and albums in song lists.', prefSwitch('compact', 'Compact lists', applyLook)),
        setting('Animations', null, (() => {
          const button = h('button', { className: 'switch' + (meloir.prefs.still ? '' : ' on'), role: 'switch', ariaLabel: 'Animations',
            onclick: () => {
              meloir.setPref('still', !meloir.prefs.still);
              button.classList.toggle('on', !meloir.prefs.still);
              applyLook();
            } });
          return button;
        })()),
        setting('Cover backdrop', 'A soft, blurred copy of the cover behind everything.', prefSwitch('coverBackdrop', 'Cover backdrop', applyLook),
          h('div', { className: 'wide' }, backdropLevel, backdropValue)),
        setting('Idle screen', 'After this long without input, the cover fills the screen until you move the mouse.', prefSwitch('idleFade', 'Idle screen', applyLook),
          h('div', { className: 'wide' }, idleLength, idleValue)),

        h('h2', {}, 'Glow'),
        h('div', { className: 'set' },
          glowSwitch('Cursor', 'A soft light that follows the mouse.', 'cursorGlow', applyLook),
          glowSwitch('Beats', 'The line in focus mode pulses on strong beats.', 'beatGlow'),
          glowSwitch('Drops', 'The line in focus mode flashes where the song gets clearly louder.', 'dropGlow')),

        h('h2', {}, 'Focus mode'),
        setting('Open in focus mode', null, prefSwitch('focusOnOpen', 'Open in focus mode')),
        setting('Cover tilt', 'The cover leans toward the mouse in focus mode.', prefSwitch('coverTilt', 'Cover tilt', applyLook)),
        h('div', { className: 'set' },
          h('div', { className: 'line' }, h('b', {}, 'Blur behind the cover'), blurValue),
          h('div', { className: 'wide' }, blurLevel)),
        h('div', { className: 'set' },
          h('div', { className: 'line' }, h('b', {}, 'Blur size'), sizeValue),
          h('p', {}, 'From a tight glow around the cover to a wide one.'),
          h('div', { className: 'wide' }, blurSize)),

        h('h2', {}, 'Discord'),
        setting('Discord status', 'Shows the song you are playing on your Discord profile, with a link to Meloir.', prefSwitch('discord', 'Discord status')),
        setting('GitHub button', 'Adds a button to the status that opens Meloir on GitHub.', prefSwitch('discordButton', 'GitHub button', () => { discordSong = null; })),

        h('h2', {}, 'History'),
        setting('Recent songs, searches and stats', 'Kept on this PC only.', h('button', { className: 'chip', onclick: event => {
          meloir.setPref('history', []);
          meloir.setPref('searches', []);
          meloir.setPref('stats', { since: 0, ms: 0, plays: 0, tracks: {}, artists: {} });
          meloir.setPref('genres', {});
          event.currentTarget.textContent = 'Cleared';
        } }, 'Clear')),

        h('h2', {}, 'Ads'),
        h('div', { className: 'set' },
          h('div', { className: 'line' }, h('b', {}, 'Ads muted this session'), h('span', { className: 'value' }, String(meloir.stats.adsMuted)))),

        h('h2', {}, 'About'),
        setting('Keyboard shortcuts', null, h('button', { className: 'chip', onclick: () => toggleKeys() }, 'Show')),
        updateRow(),
      ];

      // Each name on the right sits level with its section. One that is off screen waits in a stack
      // at that edge, in order, and comes out again as its section scrolls in. A click holds its choice
      // until the scroll lands, so the marker goes straight there.
      const sections = page.filter(el => el.tagName === 'H2');
      const mark = h('i', { className: 'setmark' });
      const body = h('div', { className: 'setbody' }, page);
      let held = 0, chosen = 0, frame = 0, lastFrame = 0, markAt = null;
      const places = sections.map(() => null);
      const centre = el => {
        const box = el.getBoundingClientRect();
        return box.top + box.height / 2;
      };
      const topSlot = (area, index) => area.top + SETTINGS_TOP_PX + SETTINGS_ROW_PX * (index + .5);
      const bottomSlot = (area, index) => area.bottom - SETTINGS_TOP_PX - SETTINGS_ROW_PX * (sections.length - index - .5);
      const glide = now => {
        frame = 0;
        if (!list.isConnected || !list.offsetParent) return;
        const area = main.getBoundingClientRect();
        const origin = list.getBoundingClientRect().top;
        const step = calm() ? 1 : 1 - Math.exp(-Math.min(now - lastFrame, 50) / SETTINGS_GLIDE_MS);
        let moving = false;
        const towards = (from, to) => {
          const next = from === null ? to : from + (to - from) * step;
          if (Math.abs(to - next) < .2) return to;
          moving = true;
          return next;
        };
        items.forEach((item, i) => {
          const level = centre(sections[i]);
          const wanted = Math.min(Math.max(level, topSlot(area, i)), bottomSlot(area, i));
          item.classList.toggle('stacked', Math.abs(wanted - level) > 1);
          places[i] = towards(places[i], wanted - origin);
          item.style.translate = '0 ' + places[i] + 'px';
        });
        markAt = towards(markAt, places[chosen]);
        mark.style.translate = '0 ' + markAt + 'px';
        lastFrame = now;
        if (moving) frame = requestAnimationFrame(glide);
      };
      const place = () => {
        if (frame) return;
        lastFrame = performance.now() - 16;
        frame = requestAnimationFrame(glide);
      };
      const select = index => {
        chosen = index;
        items.forEach((item, i) => item.classList.toggle('on', i === index));
        sections.forEach((section, i) => section.classList.toggle('on', i === index));
        place();
      };
      const jump = index => {
        clearTimeout(held);
        held = setTimeout(() => { held = 0; }, SETTINGS_JUMP_MS);
        select(index);
        // Lands the section right beside its name, under the stack of those before it.
        main.scrollTo({ top: main.scrollTop + centre(sections[index]) - topSlot(main.getBoundingClientRect(), index), behavior: calm() ? 'auto' : 'smooth' });
        if (!calm()) sections[index].animate([{ color: 'var(--fg)' }, { color: 'var(--fg)', offset: .4 }, { color: 'var(--mute)' }], { duration: 1400, easing: 'ease-out' });
      };
      const items = sections.map((section, i) => h('button', { style: '--n: ' + i, onclick: () => jump(i) }, section.textContent));
      const list = h('div', { className: 'setnav' }, mark, items);
      const resized = new ResizeObserver(() => follow());
      const follow = () => {
        if (!list.isConnected) {
          main.removeEventListener('scroll', follow);
          main.removeEventListener('animationend', place);
          return resized.disconnect();
        }
        place();
        if (held) return;
        // The last sections can't reach the top, so the line runs down the page as the end nears.
        const scrollable = main.scrollHeight - main.clientHeight;
        const nearEnd = Math.min(main.clientHeight, scrollable);
        const left = scrollable - main.scrollTop;
        const toEnd = nearEnd > 0 ? Math.max(0, 1 - left / nearEnd) : 0;
        const area = main.getBoundingClientRect();
        const reached = sections.filter((section, i) => {
          const slot = topSlot(area, i);
          return centre(section) <= slot + SETTINGS_REACHED_PX + (area.bottom - slot) * toEnd;
        });
        select(Math.max(0, reached.length - 1));
      };
      main.addEventListener('scroll', follow, { passive: true });
      main.addEventListener('animationend', place);
      resized.observe(main);
      resized.observe(body);
      select(0);
      return [h('div', { className: 'setpage' }, h('div', { className: 'setmain' }, h('h1', {}, 'Settings'), body), list)];
    });

    const fillLists = () => getLibrary().then(items => {
      lists.replaceChildren(...items.filter(i => i.type === 'playlist').map(p => link('pl' + p.id, p.name, () => openPlaylist(p.id))));
      placeNavMark();
    }).catch(() => {});
    let linkCount = 0;
    const link = (key, label, onclick) => (links[key] = h('button', { className: 'link', style: '--n: ' + Math.min(linkCount++, MAX_REVEAL_STAGGER), onclick }, label));

    // One marker for the whole menu, as in Settings. It hides when the page has no link of its own,
    // or when the link has scrolled out of the playlist list.
    const navMark = h('i', { className: 'navmark' });
    const placeNavMark = () => {
      const active = Object.values(links).find(item => item.classList.contains('on'));
      if (!active) return navMark.classList.remove('on');
      const box = active.getBoundingClientRect(), area = lists.getBoundingClientRect();
      navMark.classList.toggle('on', !lists.contains(active) || (box.top >= area.top && box.bottom <= area.bottom));
      navMark.style.setProperty('--y', box.top - nav.getBoundingClientRect().top + (box.height - NAV_MARK_PX) / 2 + 'px');
    };
    lists.addEventListener('scroll', placeNavMark, { passive: true });
    window.addEventListener('resize', placeNavMark);

    const nav = h('nav', {}, navMark,
      link('home', 'Home', openHome), link('search', 'Search', openSearch),
      link('liked', 'Liked Songs', openLiked), link('albums', 'Albums', openAlbums), link('stats', 'Stats', openStats), link('settings', 'Settings', openSettings),
      h('div', { className: 'label' }, 'Playlists'), lists);

    if (!meloir.session().isAnonymous) {
      fillLists();
    }

    // Title bar: the window is frameless, so the page moves and sizes it through the host.
    const winButton = (cls, label, d, command) => h('button', { className: 'win ' + cls, title: label, ariaLabel: label, onclick: () => host(command) }, svg(d, '0 0 10 10'));
    const maxButton = winButton('max', 'Maximize', WIN.max, 'max');
    // The dots unfold Meloir's menus along the title bar. Spotify's own menu stays at the end of Help.
    const titleMenus = () => ({
      File: [['New playlist', () => newPlaylist(titleAnchor)], ['Settings', () => openSettings()], ['Close', () => host('close')]],
      View: [['Focus mode', () => setFocus(true)], ['Queue', () => toggleQueue()], ['Spotify\'s interface', () => toggleSpotify()]],
      Playback: [['Play or pause', () => toggle()], ['Next', () => meloir.next()], ['Previous', () => meloir.services.player.skipToPrevious()],
        ['Shuffle', () => shuffle.click()], ['Repeat', () => repeat.click()], [+volume.value ? 'Mute' : 'Unmute', () => toggleMute()]],
      Help: [['Keyboard shortcuts', () => toggleKeys()], ['Spotify\'s menu', () => host('menu')]],
    });
    let titleAnchor = null;
    const showTitleMenu = (button, name) => {
      const box = button.getBoundingClientRect();
      titleAnchor = { clientX: box.left, clientY: box.bottom + 6 };
      titleButtons.forEach(other => other.classList.toggle('on', other === button));
      showMenu(titleAnchor, titleMenus()[name].map(([label, action]) => [label, () => { setTitleMenu(false); action(); }]));
    };
    const titleButtons = ['File', 'View', 'Playback', 'Help'].map((name, n) => {
      const button = h('button', { style: '--n: ' + n,
        onclick: () => {
          if (!button.classList.contains('on')) return showTitleMenu(button, name);
          button.classList.remove('on');
          closeMenu();
        },
        onmouseenter: () => { if (titleButtons.some(other => other.classList.contains('on')) && !button.classList.contains('on')) showTitleMenu(button, name); } }, name);
      return button;
    });
    const titleMenu = h('div', { className: 'titlemenu' }, titleButtons);
    const setTitleMenu = on => {
      titleMenu.classList.toggle('on', on);
      dots.classList.toggle('on', on);
      if (on) return;
      titleButtons.forEach(button => button.classList.remove('on'));
      closeMenu();
    };
    const dots = h('button', { className: 'win dots', title: 'Menu', ariaLabel: 'Menu', onclick: () => setTitleMenu(!titleMenu.classList.contains('on')) }, svg(WIN.dots, '0 0 10 10'));
    const menuBar = h('div', { className: 'menudots' }, dots, titleMenu);
    window.addEventListener('mousedown', event => {
      if (!titleMenu.classList.contains('on')) return;
      const path = event.composedPath();
      if (!path.includes(menuBar) && !path.includes(menu)) setTitleMenu(false);
    }, true);
    // Scrolling closes the dropdown, so the name above it shouldn't stay marked.
    window.addEventListener('wheel', event => { if (!event.composedPath().includes(menu)) titleButtons.forEach(button => button.classList.remove('on')); }, { capture: true, passive: true });
    let lastDown = 0;
    const titlebar = h('div', { className: 'titlebar',
      onmousedown: e => {
        if (window.meloirNative || e.button !== 0 || e.target.closest('button')) return;
        const now = Date.now();
        if (now - lastDown < 350) { host('max'); lastDown = 0; return; }
        lastDown = now;
        host('drag');
      } },
      menuBar,
      h('div', { className: 'brand' }, logo(), 'MELOIR'),
      h('div', { className: 'wins' }, winButton('min', 'Minimize', WIN.min, 'min'), maxButton, winButton('close', 'Close', WIN.close, 'close')));
    const grips = window.meloirNative ? [] : [1, 2, 3, 4, 5, 6, 7, 8].map(n => h('div', { className: 'grip g' + n, onmousedown: e => { if (e.button === 0) host('size:' + n); } }));

    // Player bar
    const npCover = h('img', { alt: '', title: 'Now playing', onclick: () => full.classList.toggle('on') });
    const npTitle = h('b');
    const npArtist = h('span');
    const heart = iconButton('heart', 'Like', async () => {
      const uri = currentUri;
      if (!uri) return;
      const [liked] = await meloir.services.library.contains(uri);
      await (liked ? meloir.services.library.remove({ uris: [uri] }) : meloir.services.library.add({ uris: [uri] }));
      heart.classList.toggle('on', !liked);
      heart.classList.toggle('dim', liked);
      heart.firstChild.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 300, easing: EASE });
    }, 'ico dim');

    const shuffle = iconButton('shuffle', 'Shuffle', () => {
      const s = meloir.state();
      if (s) meloir.services.player.setShuffle(!s.shuffle);
    });
    const repeat = iconButton('repeat', 'Repeat', () => {
      const s = meloir.state();
      if (s) meloir.services.player.setRepeat(((s.repeat || 0) + 1) % 3);
    });
    const toggle = () => {
      meloir.audio.toggle();
      render();
    };
    const playBtn = iconButton('play', 'Play or pause', toggle, 'ico big');

    const elapsed = h('span', {}, '0:00');
    const total = h('span', {}, '0:00');
    let seeking = false;
    const seek = h('input', { type: 'range', className: 'seek', min: 0, max: 1, value: 0, ariaLabel: 'Position',
      oninput: () => { seeking = true; fill(seek, +seek.value, +seek.max); elapsed.textContent = time(+seek.value); },
      onchange: () => { seeking = false; meloir.services.player.seekTo(+seek.value); } });
    // The slider moves at once. Spotify gets the latest level, one command at a time, so a fast
    // drag cannot queue up behind its audio engine.
    let wantedVolume = null, sendingVolume = false;
    const sendVolume = async () => {
      if (sendingVolume || wantedVolume === null) return;
      sendingVolume = true;
      const level = wantedVolume;
      wantedVolume = null;
      try { await meloir.services.playback.setVolume(level); } catch (e) { /* the next change tries again */ }
      sendingVolume = false;
      if (wantedVolume !== null) requestAnimationFrame(sendVolume);
    };
    let volumeFade = 0, fadingTo = null;
    const changeVolume = percent => {
      fill(volume, percent, 100);
      showMuted(fadingTo === null ? percent : fadingTo);
      meloir.audio.rebase(percent / 100);
      wantedVolume = percent / 100;
      sendVolume();
    };
    const volume = h('input', { type: 'range', min: 0, max: 100, value: 100, ariaLabel: 'Volume',
      oninput: () => {
        stopVolumeFade();
        changeVolume(+volume.value);
      },
      onwheel: e => {
        e.preventDefault();
        stopVolumeFade();
        changeVolume(Math.min(100, Math.max(0, +volume.value + (e.deltaY < 0 ? 3 : -3))));
      } });
    // The icon mutes and brings back the level from before, even after a restart.
    const stopVolumeFade = () => {
      cancelAnimationFrame(volumeFade);
      fadingTo = null;
    };
    const fadeVolume = to => {
      stopVolumeFade();
      if (calm()) return changeVolume(to);
      const from = +volume.value;
      const started = performance.now();
      fadingTo = to;
      const step = now => {
        const done = Math.min(1, (now - started) / (to ? UNMUTE_FADE_MS : MUTE_FADE_MS));
        if (done === 1) fadingTo = null;
        changeVolume(from + (to - from) * done * (2 - done));
        if (done < 1) volumeFade = requestAnimationFrame(step);
      };
      volumeFade = requestAnimationFrame(step);
    };
    const toggleMute = () => {
      const level = fadingTo === null ? +volume.value : fadingTo;
      if (level) meloir.setPref('unmuteVolume', level);
      fadeVolume(level ? 0 : meloir.prefs.unmuteVolume);
    };
    const volumeIcon = iconButton('volume', 'Mute', toggleMute);
    const showMuted = percent => {
      setIcon(volumeIcon, percent ? 'volume' : 'muted');
      volumeIcon.title = volumeIcon.ariaLabel = percent ? 'Mute' : 'Unmute';
    };
    fill(volume, 100, 100);
    if (meloir.services.playback.getVolume) {
      Promise.resolve(meloir.services.playback.getVolume()).then(v => {
        fill(volume, Math.round(v * 100), 100);
        showMuted(Math.round(v * 100));
      }).catch(() => {});
    }

    const footer = h('footer', {}, seek,
      h('div', { className: 'np' }, npCover, h('div', {}, npTitle, npArtist), heart),
      h('div', { className: 'btns' }, shuffle, iconButton('prev', 'Previous', () => meloir.services.player.skipToPrevious()),
        playBtn, iconButton('next', 'Next', () => meloir.next()), repeat),
      h('div', { className: 'right' }, h('span', { className: 'time' }, elapsed, ' / ', total),
        iconButton('queue', 'Queue (Q)', () => toggleQueue()),
        iconButton('focus', 'Focus mode (F)', () => setFocus(true)),
        volumeIcon, volume));

    const fullCover = h('img', { alt: '' });
    const fullTitle = h('b');
    const fullArtist = h('span');
    const fullGlow = h('div', { className: 'cursor' });
    const full = h('div', { id: 'full' }, fullGlow,
      iconButton('close', 'Close', () => full.classList.remove('on'), 'ico close'),
      h('figure', {}, fullCover, h('figcaption', {}, fullTitle, fullArtist)));

    // Focus mode: the cover with its glow, and the lyrics. Each word sweeps over its sung length.
    // With only a line's real length, the sweep spans that line. With only its start, as Spotify
    // gives it, the whole line lights at once: a guessed sweep runs ahead of the singing or behind.
    // Two glows that trade places: one fades out as the other fades in, so a see-through blur never
    // doubles up and nothing is swapped at the end.
    const glows = [h('img', { className: 'glow', alt: '' }), h('img', { className: 'glow', alt: '' })];
    let litGlow = 0, focusRequest = null;
    const focusCover = h('img', { className: 'cover', alt: '' });

    // The cover and its glow wait for each other, then fade in together.
    const fadeFocus = async picture => {
      const request = focusRequest = {};
      const [cover, glow] = await Promise.all([
        firstThatLoads([sized(picture, 'full'), sized(picture, 'large')]),
        firstThatLoads([sized(picture, 'medium')]),
      ]);
      if (focusRequest !== request) return;
      const incoming = glows[1 - litGlow];
      if (glow) {
        incoming.src = glow.src;
        await incoming.decode().catch(() => {});
        if (focusRequest !== request) return;
      }
      if (cover) startFade(focusCover, cover, focusOn);
      if (!glow) return;
      glows[litGlow].classList.remove('lit');
      incoming.classList.add('lit');
      litGlow = 1 - litGlow;
    };
    const focusTitle = h('b');
    const focusArtist = h('span');
    const focusLyrics = h('div', { className: 'lyr' });
    const lyricsBox = h('div', { className: 'lyrics' }, focusLyrics);
    const focusProgress = h('div', { className: 'fline' });
    const focusPlay = iconButton('play', 'Play or pause', toggle);

    let lyricsShown = meloir.prefs.showLyrics;
    const applyLyricsShown = () => {
      focus.classList.toggle('nolyrics', !lyricsShown);
      lyricsButton.classList.toggle('on', lyricsShown);
      lyricsButton.classList.toggle('dim', !lyricsShown);
      lyricsButton.title = (lyricsShown ? 'Hide' : 'Show') + ' lyrics (L)';
    };
    // The grid cannot animate between one and two columns, so the cover jumps to its new place
    // and is animated back from where it was. The lyrics leave from a pinned copy of their box.
    const toggleLyrics = () => {
      lyricsShown = !lyricsShown;
      meloir.setPref('showLyrics', lyricsShown);
      const stage = focus.querySelector('.stage');
      const from = stage.getBoundingClientRect();
      const box = lyricsBox.getBoundingClientRect();
      const fadedFrom = lyricsBox.getAnimations().length ? +getComputedStyle(lyricsBox).opacity : null;
      stage.getAnimations().filter(a => a.id === 'meloir-toggle').forEach(a => a.cancel());
      lyricsBox.getAnimations().forEach(a => a.cancel());
      lyricsBox.removeAttribute('style');
      applyLyricsShown();
      activeLine = -2;
      lyricsButton.firstChild.animate([{ transform: 'scale(.7)' }, { transform: 'scale(1)' }], { duration: 240, easing: EASE });
      if (focus.classList.contains('plain') || calm()) return;

      // The cover and the lyrics share the middle of the screen, so they take turns: going out,
      // the lyrics clear first. Coming back, the cover moves away before the lyrics appear.
      const moved = from.left - stage.getBoundingClientRect().left;
      const cover = { duration: COVER_MOVE_MS, easing: EASE, fill: 'backwards', id: 'meloir-toggle' };
      const slide = [{ transform: `translateX(${moved}px)` }, { transform: 'none' }];
      if (lyricsShown) {
        stage.animate(slide, cover);
        lyricsBox.animate([{ opacity: fadedFrom === null ? 0 : fadedFrom, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }],
          { duration: LYRICS_FADE_IN_MS, delay: LYRICS_WAIT_MS, easing: EASE, fill: 'backwards' });
        return;
      }
      stage.animate(slide, { ...cover, delay: COVER_WAIT_MS });
      lyricsBox.style.cssText = `display: block; position: absolute; left: ${box.left}px; top: ${box.top}px; width: ${box.width}px; height: ${box.height}px;`;
      lyricsBox.animate([{ opacity: fadedFrom === null ? 1 : fadedFrom, transform: 'none' }, { opacity: 0, transform: 'translateX(40px)' }],
        { duration: LYRICS_FADE_OUT_MS, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => { if (!lyricsShown) lyricsBox.removeAttribute('style'); };
    };
    const lyricsButton = iconButton('lyrics', 'Show or hide lyrics (L)', toggleLyrics);

    const focus = h('div', { id: 'focus', className: 'plain', onmousemove: () => wake() },
      h('div', { className: 'stage' }, glows, focusCover, h('div', { className: 'meta' }, focusTitle, focusArtist)),
      lyricsBox,
      h('div', { className: 'fctl' }, iconButton('prev', 'Previous', () => meloir.services.player.skipToPrevious()), focusPlay,
        iconButton('next', 'Next', () => meloir.next()), lyricsButton, iconButton('close', 'Exit focus mode', () => setFocus(false))),
      focusProgress);
    applyLyricsShown();

    let focusOn = false, coverUrl = '', lyricsFor = null, lines = [], activeLine = -1, sleepTimer = 0;

    const wake = () => {
      focus.classList.add('awake');
      focus.classList.remove('asleep');
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => { focus.classList.remove('awake'); focus.classList.add('asleep'); }, 2500);
    };

    const timedWords = (text, start, end) => {
      const span = end - start;
      let done = 0;
      return text.split(/(?<=\s)/).filter(Boolean).map(part => {
        const el = h('span', { className: 'w' }, part);
        const at = start + span * done / text.length;
        done += part.length;
        return { el, at, end: start + span * done / text.length };
      });
    };

    // Going between one column and two moves the cover, so it glides from where it was.
    const slideCover = change => {
      const stage = focus.querySelector('.stage');
      const from = stage.getBoundingClientRect().left;
      stage.getAnimations().filter(a => a.id === 'meloir-toggle').forEach(a => a.cancel());
      change();
      const moved = from - stage.getBoundingClientRect().left;
      if (Math.abs(moved) < 1 || calm()) return;
      stage.animate([{ transform: `translateX(${moved}px)` }, { transform: 'none' }], { duration: COVER_MOVE_MS, easing: EASE, id: 'meloir-toggle' });
    };

    let snapLyrics = false;
    const showLyrics = data => {
      focus.classList.toggle('plain', !data);
      lyricsBox.classList.toggle('unsynced', !!data && !data.synced);
      activeLine = -2;
      snapLyrics = true;
      lines = [];
      focusLyrics.style.transform = '';
      if (!data) { focusLyrics.replaceChildren(); return; }
      lines = data.lines.map(line => {
        const words = line.words
          ? line.words.map(word => ({ el: h('span', { className: 'w' }, word.text), at: word.at, end: word.end }))
          : timedWords(line.text, line.start, line.end || line.start);
        const el = h('div', { className: 'fl', onclick: () => { if (data.synced) meloir.services.player.seekTo(line.start); } }, words.map(w => w.el));
        return { start: line.start, el, words };
      });
      focusLyrics.replaceChildren(...lines.map(line => line.el));
      if (!data.synced) lines = [];
    };

    // Every source is asked at once: Spotify's lines show as soon as they arrive, and better timing
    // replaces them whenever it comes, so a slow service never leaves the screen empty. A failed
    // lookup is tried again.
    let retryTimer = 0;
    const syncLyrics = () => {
      if (lyricsFor === currentUri) return;
      clearTimeout(retryTimer);
      const uri = lyricsFor = currentUri;
      if (!uri) { showLyrics(null); return; }
      // The layout stays as it is until the answers are in: only the old lines fade away.
      lines = [];
      activeLine = -2;
      lyricsBox.getAnimations().forEach(a => a.cancel());
      const leaving = lyricsBox.animate([{ opacity: 1 }, { opacity: 0 }], { duration: calm() ? 0 : LYRICS_LEAVE_MS, easing: 'ease-out', fill: 'forwards' });
      const state = meloir.state();
      const item = state && state.item;
      const song = item ? { title: item.name, artist: item.artists && item.artists[0] ? item.artists[0].name : '', durationMs: state.duration } : null;

      let shownRank = 0;
      const offer = (data, rank) => {
        if (lyricsFor !== uri || !data || rank <= shownRank) return;
        const first = !shownRank;
        shownRank = rank;
        slideCover(() => showLyrics(data));
        if (!first) return;
        leaving.cancel();
        if (!calm()) lyricsBox.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LYRICS_ARRIVE_MS, easing: 'ease-out' });
      };
      const lookups = [
        meloir.data.lyrics(uri, coverUrl).then(data => offer(data, 1)),
        song ? meloir.data.timedLyrics(uri, song).then(data => offer(data, data && data.wordTimed ? 3 : 2)) : Promise.resolve(),
      ];
      Promise.allSettled(lookups).then(results => {
        if (lyricsFor !== uri || shownRank) return;
        leaving.cancel();
        slideCover(() => showLyrics(null));
        if (!results.some(result => result.status === 'rejected')) return;
        lyricsFor = null;
        retryTimer = setTimeout(() => { if (focusOn) syncLyrics(); }, LYRICS_RETRY_MS);
      });
    };

    // The line lights on each beat that Spotify's analysis marks as strong, and for longer on a drop.
    let beats = [], beatsFor = null, nextBeat = 0, beatLevel = 0, beatFade = BEAT_FADE_MS, beatFrame = 0, beatPosition = -Infinity, beatShown = '';
    const pulse = s => {
      const { beatGlow, dropGlow } = meloir.prefs;
      const now = performance.now(), on = (beatGlow || dropGlow) && !calm();
      const uri = s.item && s.item.uri;
      if (on && uri !== beatsFor) {
        beatsFor = uri;
        beats = [];
        if (uri && uri.startsWith('spotify:track:')) meloir.data.beats(uri).then(found => {
          if (beatsFor !== uri) return;
          beats = found;
          beatPosition = -Infinity;
        }).catch(() => {});
      }
      if (Math.abs(s.position - beatPosition) > BEAT_JUMP_MS) {
        const ahead = beats.findIndex(beat => beat.at > s.position);
        nextBeat = ahead < 0 ? beats.length : ahead;
      }
      beatPosition = s.position;
      beatLevel *= Math.exp(-(now - beatFrame) / beatFade);
      beatFrame = now;
      for (; nextBeat < beats.length && beats[nextBeat].at <= s.position; nextBeat++) {
        const drop = beats[nextBeat].drop && dropGlow;
        const level = drop ? 1 : beats[nextBeat].level;
        if (!on || s.isPaused || !(drop || beatGlow) || level < beatLevel) continue;
        beatLevel = level;
        beatFade = drop ? DROP_FADE_MS : BEAT_FADE_MS;
      }
      const shown = (on ? beatLevel : 0).toFixed(2);
      if (shown !== beatShown) focusProgress.style.setProperty('--beat', beatShown = shown);
    };

    const focusTick = () => {
      if (!focusOn) return;
      requestAnimationFrame(focusTick);
      let s = null;
      try { s = meloir.state(); } catch (e) { return; }
      if (!s) return;
      focusProgress.style.width = (s.duration ? s.position / s.duration * 100 : 0) + '%';
      pulse(s);
      let index = -1;
      for (let i = 0; i < lines.length && lines[i].start <= s.position; i++) index = i;
      if (index !== activeLine) {
        lines.forEach((line, i) => {
          line.el.classList.toggle('on', i === index);
          line.el.classList.toggle('past', i < index);
        });
        activeLine = index;
        const target = lines[Math.max(0, index)];
        if (target) {
          // New lyrics start in place. Only moving from line to line scrolls.
          if (snapLyrics) focusLyrics.style.transition = 'none';
          focusLyrics.style.transform = `translateY(${lyricsBox.clientHeight / 2 - target.el.offsetTop - target.el.offsetHeight / 2}px)`;
          if (snapLyrics) {
            void focusLyrics.offsetHeight;
            focusLyrics.style.transition = '';
            snapLyrics = false;
          }
        }
      }
      if (index >= 0) {
        for (const word of lines[index].words) {
          const swept = Math.round(Math.min(1, Math.max(0, (s.position - word.at) / Math.max(1, word.end - word.at))) * 100);
          if (word.swept === swept) continue;
          word.swept = swept;
          word.el.style.setProperty('--w', swept + '%');
          word.el.classList.toggle('lit', swept > 0);
        }
      }
    };

    // Full screen makes the page wider and shorter, which cuts the scroll position off, so it is
    // remembered on the way in and put back once the window has its old size again.
    let focusScroll = null;
    const returnToPlace = () => {
      if (focusScroll === null || focusOn) return;
      const top = focusScroll;
      main.scrollTop = top;
      setTimeout(() => {
        main.scrollTop = top;
        focusScroll = null;
      }, FULLSCREEN_SETTLE_MS);
    };

    const setFocus = on => {
      if (on === focusOn) return;
      focusOn = on;
      if (on) {
        focusScroll = main.scrollTop;
        setTitleMenu(false);
      }
      app.classList.toggle('focusing', on);
      focus.classList.toggle('on', on);
      app.classList.toggle('fullscreen', on);
      // Meloir.exe sizes the window itself: the browser's full screen shows a grey notice, swallows Esc
      // and turns Spotify's window buttons back on.
      host('fullscreen:' + (on ? 1 : 0));
      if (!on) {
        returnToPlace();
        return;
      }
      syncLyrics();
      activeLine = -2;
      wake();
      requestAnimationFrame(focusTick);
    };

    // The queue: what plays next, sliding in from the right.
    const queueList = h('div', { className: 'qlist' });
    const queueTitle = h('div', { className: 'qtitle' }, 'Next up');
    const queuePanel = h('div', { id: 'queue' }, queueTitle, queueList);
    let queueOpen = false, queueShown = '', queueRows = new Map();

    const queueRow = item => {
      const { player } = meloir.services;
      const images = item.images || (item.album && item.album.images) || [];
      const jump = () => { if (!justDragged) player.skipTo({ uri: item.uri, uid: item.uid }); };
      const el = h('button', { className: 'qrow', onclick: jump, onmousedown: event => dragRow(event, el),
        oncontextmenu: event => trackMenu(event, { uri: item.uri, artists: item.artists, album: item.album }, [
          ['Play now', jump],
          ['Remove from queue', async () => {
            await player.removeFromQueue([{ uri: item.uri, uid: item.uid }]);
            fillQueue();
          }],
        ]) },
        images[0] ? h('img', { src: sized(images[0].url, 'small'), alt: '', loading: 'lazy' }) : h('span', { className: 'blank' }),
        h('span', {}, h('b', {}, item.name || item.title || ''), h('small', {}, artistLinks(item.artists))));
      el.queueItem = { uri: item.uri, uid: item.uid };
      return el;
    };

    // Dragging lifts the row, the others make room, and it drops into the gap. Spotify is told once.
    let dragging = false, justDragged = false;
    const dragRow = (event, el) => {
      if (event.button !== 0) return;
      const rows = [...queueList.querySelectorAll('.qrow')].filter(row => row.style.position !== 'absolute');
      const from = rows.indexOf(el), height = el.offsetHeight, startY = event.clientY, startScroll = queueList.scrollTop;
      let to = from, moved = 0;
      const move = e => {
        const area = queueList.getBoundingClientRect();
        if (e.clientY < area.top + DRAG_EDGE_PX) queueList.scrollTop -= DRAG_SCROLL_PX;
        if (e.clientY > area.bottom - DRAG_EDGE_PX) queueList.scrollTop += DRAG_SCROLL_PX;
        moved = e.clientY - startY + queueList.scrollTop - startScroll;
        if (!dragging) {
          if (Math.abs(moved) < DRAG_START_PX) return;
          dragging = true;
          el.classList.add('held');
          queueList.classList.add('sorting');
        }
        el.style.transform = `translateY(${moved}px)`;
        to = Math.max(0, Math.min(rows.length - 1, from + Math.round(moved / height)));
        rows.forEach((row, i) => {
          if (row === el) return;
          const shift = i > from && i <= to ? -height : i < from && i >= to ? height : 0;
          row.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };
      const drop = async () => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', drop, true);
        if (!dragging) return;
        justDragged = true;
        setTimeout(() => { justDragged = false; }, DRAG_CLICK_MS);
        const anchor = rows[to];
        // The rows are already where they belong on screen, so they settle without moving.
        queueList.classList.remove('sorting');
        queueList.classList.add('settled');
        el.classList.remove('held');
        rows.forEach(row => { row.style.transform = ''; });
        if (to !== from) anchor[to > from ? 'after' : 'before'](el);
        void queueList.offsetWidth;
        queueList.classList.remove('settled');
        if (!calm()) el.animate([{ transform: `translateY(${moved - (to - from) * height}px)` }, { transform: 'none' }], { duration: 220, easing: EASE });
        try {
          if (to !== from) await meloir.services.player.reorderQueue([el.queueItem], { [to > from ? 'after' : 'before']: anchor.queueItem });
        } catch (e) {
          showToast('Could not move that song');
        }
        // Spotify keeps answering with the old order for a moment.
        await new Promise(resolve => setTimeout(resolve, QUEUE_SETTLE_MS));
        dragging = false;
        queueShown = '';
        fillQueue(false).catch(() => {});
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', drop, true);
    };

    // Rows that stay are kept and glide to their new place, so a song starting lifts off the top
    // while the rest follow it up. A wholly new list just rises in.
    const fillQueue = async (animate = true) => {
      if (dragging && animate) return;
      const queue = await meloir.services.player.getQueue();
      const items = [...(queue.queued || []), ...(queue.nextUp || [])].filter(item => !meloir.isAd(item)).slice(0, QUEUE_LENGTH);
      const keyOf = item => item.uid || item.uri;
      const shown = items.map(keyOf).join();
      if (shown === queueShown) return;
      queueShown = shown;

      const rows = new Map(items.map(item => [keyOf(item), queueRows.get(keyOf(item)) || queueRow(item)]));
      const stayed = [...rows.values()].filter(el => el.isConnected);
      const moving = animate && stayed.length > 0 && !calm();
      const tops = new Map(stayed.map(el => [el, el.getBoundingClientRect().top]));
      const leaving = moving ? [...queueRows].filter(([key]) => !rows.has(key)).map(([, el]) => ({ el, top: el.offsetTop })) : [];
      const added = [...rows.values()].filter(el => !tops.has(el));
      queueRows = rows;
      queueList.replaceChildren(...(items.length ? rows.values() : [h('p', { className: 'note', style: 'padding: 0 20px' }, 'Nothing up next')]));
      if (!animate) return;

      const bottom = queueList.getBoundingClientRect().bottom;
      if (!moving) return riseIn(added, bottom);
      for (const { el, top } of leaving) {
        el.style.cssText = `position: absolute; left: 0; top: ${top}px; pointer-events: none;`;
        queueList.append(el);
        el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' })
          .onfinish = () => el.remove();
      }
      let order = 0;
      for (const [el, top] of tops) {
        const box = el.getBoundingClientRect();
        if (box.top === top || box.top >= bottom) continue;
        el.animate([{ transform: `translateY(${top - box.top}px)` }, { transform: 'none' }],
          { duration: 420, delay: Math.min(order++, MAX_REVEAL_STAGGER) * 16, easing: EASE, fill: 'backwards' });
      }
      riseIn(added, bottom);
    };

    const toggleQueue = () => {
      queueOpen = !queueOpen;
      queuePanel.classList.toggle('on', queueOpen);
      if (queueOpen) fillQueue(false).catch(() => {}).then(() => riseIn([queueTitle, ...queueList.children], queueList.getBoundingClientRect().bottom));
    };
    setInterval(() => { if (queueOpen) fillQueue().catch(() => {}); }, QUEUE_REFRESH_MS);

    const keysPanel = h('div', { id: 'keys', onclick: () => toggleKeys() },
      h('div', { className: 'keylist' }, h('h2', {}, 'Keyboard shortcuts'), SHORTCUTS.map(([keys, about], n) =>
        h('div', { className: 'keyrow', style: '--n: ' + n }, h('span', {}, about), h('kbd', {}, keys)))));
    const toggleKeys = () => keysPanel.classList.toggle('on');

    const cursorGlow = h('div', { className: 'cursor' });
    const backdropLayers = [h('i'), h('i')];
    const backdrop = h('div', { className: 'backdrop' }, backdropLayers);
    let backdropShown = '', backdropFront = 0;
    const showBackdrop = url => {
      if (!url || url === backdropShown) return;
      backdropShown = url;
      // The next cover loads first, so the fade never shows an empty layer.
      const image = new Image();
      image.onload = () => {
        if (url !== backdropShown) return;
        backdropFront = 1 - backdropFront;
        backdropLayers[backdropFront].style.backgroundImage = 'url("' + url + '")';
        backdropLayers.forEach((layer, i) => layer.classList.toggle('on', i === backdropFront));
      };
      image.src = url;
    };
    const app = h('div', { id: 'app', className: window.meloirNative ? 'native' : '' }, backdrop, cursorGlow, titlebar, nav, main, footer, full, focus, queuePanel, grips, keysPanel, menu, toast);
    const rootEl = h('div', { id: 'meloir-root' });
    const shadow = rootEl.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
    shadow.append(app);
    document.documentElement.append(rootEl);

    // Input: the glow, the tilt and the idle fade all start from the mouse.
    let lastInput = Date.now(), mouse = null, moveFrame = 0, openedByIdle = false;
    const stage = focus.querySelector('.stage');
    const scrollers = [main, lists, queueList, lyricsBox];
    const cursorGlows = [cursorGlow, fullGlow];
    const followMouse = () => {
      moveFrame = 0;
      if (!mouse) return;
      cursorGlow.style.transform = `translate3d(${mouse.x}px, ${mouse.y}px, 0)`;
      fullGlow.style.transform = `translate3d(${mouse.x}px, ${mouse.y - MELOIR_BAR_HEIGHT}px, 0)`;
      if (!mouse.held) scrollers.forEach(el => {
        const box = el.getBoundingClientRect();
        const near = mouse.x <= box.right && box.right - mouse.x < SCROLLBAR_NEAR_PX && mouse.y >= box.top && mouse.y <= box.bottom;
        el.classList.toggle('bar-near', near);
      });
      if (!focusOn) return;
      const tilt = meloir.prefs.coverTilt && !calm() ? MAX_TILT_DEGREES : 0;
      const box = stage.getBoundingClientRect();
      const across = Math.max(-1, Math.min(1, (mouse.x - (box.left + box.width / 2)) / (innerWidth / 2)));
      const down = Math.max(-1, Math.min(1, (mouse.y - (box.top + box.height / 2)) / (innerHeight / 2)));
      stage.style.setProperty('--tilt-y', (across * tilt).toFixed(2) + 'deg');
      stage.style.setProperty('--tilt-x', (-down * tilt).toFixed(2) + 'deg');
    };
    const noteInput = () => {
      lastInput = Date.now();
      app.classList.remove('idle');
      if (openedByIdle) full.classList.remove('on');
      openedByIdle = false;
    };
    const goIdle = () => {
      app.classList.add('idle');
      closeMenu();
      if (full.classList.contains('on') || !fullTitle.textContent) return;
      full.classList.add('on');
      openedByIdle = true;
    };
    window.addEventListener('mousemove', event => {
      noteInput();
      mouse = { x: event.clientX, y: event.clientY, held: event.buttons > 0 };
      cursorGlows.forEach(el => el.classList.toggle('on', meloir.prefs.cursorGlow));
      if (!moveFrame) moveFrame = requestAnimationFrame(followMouse);
    }, true);
    for (const type of ['mousedown', 'keydown', 'wheel']) window.addEventListener(type, noteInput, { capture: true, passive: true });
    document.documentElement.addEventListener('mouseleave', () => {
      cursorGlows.forEach(el => el.classList.remove('on'));
      scrollers.forEach(el => el.classList.remove('bar-near'));
    });
    setInterval(() => {
      if (meloir.prefs.idleFade && !focusOn && !app.classList.contains('idle') && Date.now() - lastInput > meloir.prefs.idleSeconds * 1000) goIdle();
    }, 1000);

    // Anything outside the menu closes it.
    window.addEventListener('mousedown', event => { if (!event.composedPath().includes(menu)) closeMenu(); }, true);
    window.addEventListener('wheel', event => { if (!event.composedPath().includes(menu)) closeMenu(); }, { capture: true, passive: true });
    app.addEventListener('contextmenu', event => event.preventDefault());

    const applyLook = () => {
      app.classList.toggle('light', meloir.prefs.theme === 'light');
      app.style.setProperty('--zoom', devicePixelRatio);
      app.style.setProperty('--focus-blur', meloir.prefs.focusBlur / 100);
      const size = meloir.prefs.focusBlurSize / 100;
      app.style.setProperty('--glow-grow', GLOW_TIGHT_GROW + (GLOW_WIDE_GROW - GLOW_TIGHT_GROW) * size);
      app.style.setProperty('--glow-soft', GLOW_TIGHT_SOFT_PX + (GLOW_WIDE_SOFT_PX - GLOW_TIGHT_SOFT_PX) * size + 'px');
      app.classList.toggle('compact', meloir.prefs.compact);
      app.classList.toggle('backdrop-on', !!meloir.prefs.coverBackdrop);
      app.style.setProperty('--backdrop', meloir.prefs.coverBackdropLevel / 100 * BACKDROP_MAX_OPACITY);
      app.classList.toggle('still', meloir.prefs.still);
      if (!meloir.prefs.cursorGlow) cursorGlows.forEach(el => el.classList.remove('on'));
      if (!meloir.prefs.coverTilt) {
        stage.style.removeProperty('--tilt-x');
        stage.style.removeProperty('--tilt-y');
      }
    };
    applyLook();

    window.__meloirFrame = maximized => {
      app.classList.toggle('max', maximized);
      maxButton.title = maximized ? 'Restore' : 'Maximize';
      maxButton.replaceChildren(svg(maximized ? WIN.restore : WIN.max, '0 0 10 10'));
    };

    const swapIn = els => els.forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, delay: i * 50, easing: EASE, fill: 'backwards' }));

    const isAd = item => !item || meloir.isAd(item);
    const remember = (item, duration) => {
      const album = item.album || {};
      const images = (album.images || item.images || []).slice(0, 1).map(image => ({ url: image.url }));
      const track = { uri: item.uri, name: item.name, duration_ms: duration, album: { uri: album.uri, name: album.name, images },
        artists: (item.artists || []).map(artist => ({ name: artist.name, uri: artist.uri })) };
      meloir.setPref('history', [track, ...meloir.prefs.history.filter(old => old.uri !== item.uri)].slice(0, MAX_HISTORY));
    };
    // Time is counted as it plays, so a skipped song counts for nothing.
    let lastTick = performance.now(), heardUri = null, songHeard = 0, unsaved = 0, counted = false;
    const saveListening = () => {
      const { stats } = meloir.prefs;
      stats.since = stats.since || Date.now();
      stats.ms += unsaved;
      unsaved = 0;
      meloir.setPref('stats', stats);
    };
    const countPlay = (item, duration) => {
      const { stats } = meloir.prefs;
      const album = item.album || {};
      const images = (album.images || item.images || []).slice(0, 1).map(image => ({ url: image.url }));
      const seen = stats.tracks[item.uri] || { n: 0 };
      stats.tracks[item.uri] = { n: seen.n + 1, uri: item.uri, name: item.name, duration_ms: duration, album: { uri: album.uri, name: album.name, images },
        artists: (item.artists || []).map(artist => ({ name: artist.name, uri: artist.uri })) };
      stats.plays++;
      for (const artist of item.artists || []) stats.artists[artist.name] = { n: ((stats.artists[artist.name] || {}).n || 0) + 1, uri: artist.uri };
      const kept = Object.values(stats.tracks).sort((a, b) => b.n - a.n).slice(0, MAX_STATS_SONGS);
      stats.tracks = Object.fromEntries(kept.map(track => [track.uri, track]));
      saveListening();
    };
    const listen = (s, paused) => {
      const now = performance.now(), passed = Math.min(now - lastTick, 1000);
      lastTick = now;
      if (s.item.uri !== heardUri) {
        heardUri = s.item.uri;
        songHeard = 0;
        counted = false;
      }
      if (paused) return;
      songHeard += passed;
      unsaved += passed;
      if (!counted && songHeard >= PLAY_COUNTS_MS) {
        counted = true;
        countPlay(s.item, s.duration);
      } else if (unsaved >= SAVE_LISTENING_MS) saveListening();
    };

    // Discord wants texts of at least two characters, and only the changes: a pause, a new song or a seek.
    const discordText = text => String(text || '').padEnd(2, ' ').slice(0, DISCORD_MAX_TEXT);
    let discordSong = null, discordStart = 0;
    const updateDiscord = s => {
      const playing = meloir.prefs.discord && s.item && !s.isPaused && !isAd(s.item);
      if (!playing) {
        if (discordSong !== null) host('discord:off');
        discordSong = null;
        return;
      }
      const start = Date.now() - s.position;
      if (s.item.uri === discordSong && Math.abs(start - discordStart) < DISCORD_SEEK_MS) return;
      discordSong = s.item.uri;
      discordStart = start;
      const album = s.item.album || {};
      const images = s.item.images || album.images || [];
      host('discord:' + JSON.stringify({
        // The member list shows the artist instead of the app's name.
        type: 2, status_display_type: 1, details: discordText(s.item.name), state: discordText(names(s.item.artists)),
        timestamps: { start: Math.round(start), end: Math.round(start + s.duration) },
        assets: { large_image: sized(images[0] ? images[0].url : '', 'large'), large_text: discordText(album.name) },
        buttons: meloir.prefs.discordButton ? [{ label: 'Meloir on GitHub', url: MELOIR_LINK }] : undefined,
      }));
    };

    const render = () => {
      let s = null;
      try { s = meloir.state(); } catch (e) { return; }
      if (!s) return;
      updateDiscord(s);
      // During a fade the button shows what was asked for, not the state it is leaving.
      const wantedPause = meloir.audio.wantedPause();
      const paused = wantedPause === null ? !!s.isPaused : wantedPause;
      setIcon(playBtn, paused ? 'play' : 'pause');
      setIcon(focusPlay, paused ? 'play' : 'pause');
      app.classList.toggle('paused', paused);
      shuffle.classList.toggle('on', !!s.shuffle);
      repeat.classList.toggle('on', !!s.repeat);
      repeat.title = ['Repeat off', 'Repeat all', 'Repeat one'][s.repeat || 0];
      // An ad that slips through for a moment never replaces the song on screen.
      if (isAd(s.item)) return;
      listen(s, paused);
      if (!seeking) {
        fill(seek, Math.round(s.position), s.duration || 1);
        elapsed.textContent = time(s.position);
      }
      total.textContent = time(s.duration);
      if (s.item.uri === currentUri) return;

      currentUri = s.item.uri;
      remember(s.item, s.duration);
      const images = s.item.images || (s.item.album && s.item.album.images) || [];
      const artists = names(s.item.artists);
      const picture = images[0] ? images[0].url : '';
      coverUrl = sized(picture, 'large');
      showBackdrop(coverUrl);
      npCover.src = sized(picture, 'medium');
      const fullSizes = [sized(picture, 'full'), sized(picture, 'large')];
      fadeTo(fullCover, fullSizes, full.classList.contains('on'));
      fadeFocus(picture);
      npTitle.textContent = fullTitle.textContent = focusTitle.textContent = s.item.name || '';
      [npArtist, fullArtist, focusArtist].forEach(el => el.replaceChildren(...artistLinks(s.item.artists)));
      swapIn([npCover, npTitle, npArtist]);
      if (full.classList.contains('on')) swapIn([fullTitle, fullArtist]);
      if (focusOn) { swapIn([focusTitle, focusArtist]); syncLyrics(); }
      if (queueOpen) fillQueue().catch(() => {});
      document.title = (s.item.name || 'Meloir') + (artists ? ' · ' + artists : '');
      for (const el of main.querySelectorAll('.row')) el.classList.toggle('now', el.dataset.uri === currentUri);
      Promise.resolve(meloir.services.library.contains(currentUri)).then(([liked]) => {
        heart.classList.toggle('on', !!liked);
        heart.classList.toggle('dim', !liked);
      }).catch(() => {});
    };
    setInterval(render, 250);

    window.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyU') {
        toggleSpotify();
        e.preventDefault();
        return;
      }
      if (app.classList.contains('off')) return;
      e.stopPropagation();
      if (e.ctrlKey && e.code === 'KeyK') { openSearch(); e.preventDefault(); return; }
      if (e.ctrlKey && e.code === 'KeyF') {
        const box = main.querySelector('.filter');
        if (box) box.focus();
        e.preventDefault();
        return;
      }
      const target = e.composedPath()[0];
      const typing = target && target.tagName === 'INPUT' && target.type !== 'range';
      if (e.key === '?' && !typing) { toggleKeys(); e.preventDefault(); return; }
      if (e.code === 'Escape' && keysPanel.classList.contains('on')) { toggleKeys(); e.preventDefault(); return; }
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) toggle();
      }
      if (e.code === 'KeyF' && !typing && !e.ctrlKey && !e.altKey) { setFocus(!focusOn); e.preventDefault(); }
      if (e.code === 'KeyL' && focusOn && !e.ctrlKey && !e.altKey) { toggleLyrics(); e.preventDefault(); }
      if (e.code === 'KeyQ' && !typing && !focusOn && !e.ctrlKey && !e.altKey) { toggleQueue(); e.preventDefault(); }
      if (e.code === 'Escape') {
        setTitleMenu(false);
        full.classList.remove('on');
        setFocus(false);
        if (queueOpen) toggleQueue();
      }
    }, true);

    // Spotify's own interface would keep animating out of sight under Meloir.
    // Spotify's page keeps an invisible drag strip for its own taller bar. Over Meloir it would swallow
    // clicks on whatever sits just below the top bar.
    const hideDragStrip = document.createElement('style');
    hideDragStrip.textContent = '.body-drag-top { display: none !important; }';
    const showSpotify = visible => {
      const spotifyUi = document.getElementById('main');
      if (spotifyUi) spotifyUi.style.display = visible ? '' : 'none';
      if (visible) hideDragStrip.remove();
      else document.head.append(hideDragStrip);
      // Meloir draws its own window buttons, so Spotify's and its menu are only there on its own interface.
      const { control } = meloir.services;
      if (!control) return;
      // Spotify's hidden buttons stay clickable down to this height, so Meloir's bar asks for almost none.
      control.setTitlebarHeight(visible ? SPOTIFY_BAR_HEIGHT : HIDDEN_BUTTONS_HEIGHT);
      control._updateUiClient.setButtonsVisibility({ showButtons: visible }).catch(() => {});
    };
    const toggleSpotify = () => {
      app.classList.toggle('off');
      showSpotify(app.classList.contains('off'));
    };
    showSpotify(false);

    // Spotify can turn its window buttons back on when the window changes.
    const hideSpotifyButtons = () => {
      if (app.classList.contains('off') || !meloir.services.control) return;
      meloir.services.control._updateUiClient.setButtonsVisibility({ showButtons: false }).catch(() => {});
    };
    window.addEventListener('resize', () => {
      host('state');
      hideSpotifyButtons();
      app.style.setProperty('--zoom', devicePixelRatio);
    });
    host('state');

    openHome();
    hideSplash();

    // Spotify restores its last song a moment after starting.
    const startUp = async () => {
      askHost('update:check');
      for (let i = 0; i < 40 && !currentUri; i++) await new Promise(resolve => setTimeout(resolve, 150));
      if (!currentUri) return;
      const state = meloir.services.player.getState();
      if (meloir.prefs.playOnOpen && state && state.isPaused) meloir.audio.toggle();
      if (meloir.prefs.focusOnOpen) setFocus(true);
    };
    startUp();
    window.__meloirUi = { app, shadow, setFocus, showLyrics, toggleQueue, resyncLyrics: () => { lyricsFor = null; syncLyrics(); } };
  };

  const brandPage = () => {
    const add = (tag, attributes) => document.head.append(Object.assign(document.createElement(tag), attributes));
    document.querySelectorAll('link[rel~="icon"]').forEach(el => el.remove());
    add('link', { rel: 'icon', href: 'data:image/svg+xml,' + encodeURIComponent(LOGO_SVG) });
    add('meta', { name: 'theme-color', content: '#000000' });
  };

  const start = async () => {
    const meloir = window.__meloir;
    brandPage();
    // Not signed in: Spotify's own page stays on screen, so the sign-in happens there.
    const anonymous = meloir.session().isAnonymous;
    if (anonymous && !window.__meloirPreview) { hideSplash(); return; }
    const me = anonymous ? { id: 'preview', display_name: 'preview' }
      : await meloir.data.profile().catch(() => ({ id: '', display_name: '' }));
    mount(meloir, me);
  };

  if (window.__meloir && window.__meloir.ready) start();
  else window.addEventListener('meloir:ready', start, { once: true });
})();
