/*
 * Meloir bridge. Finds the Spotify app's own services and exposes them to the UI as window.__meloir.
 * Spotify keeps doing the playback, so plays count as usual.
 */
(() => {
  if (location.hostname !== 'xpui.app.spotify.com' || window.top !== window) return;

  const findPlatform = () => {
    const host = document.getElementById('main') || document.body;
    if (!host) return null;
    for (const el of [host, ...host.querySelectorAll('*')]) {
      const key = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
      if (!key) continue;
      const stack = [el[key]];
      while (stack.length) {
        const fiber = stack.pop();
        const value = fiber.memoizedProps && fiber.memoizedProps.value;
        if (value && typeof value === 'object' && typeof value.getRegistry === 'function') return value;
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
      }
    }
    return null;
  };

  const resolveServices = () => {
    const platform = findPlatform();
    if (!platform) return null;
    const registry = platform.getRegistry();
    const keys = {};
    for (const key of registry._map.keys()) if (key && key.description) keys[key.description] = key;
    const get = name => (keys[name] ? registry.resolve(keys[name]) : null);
    const player = get('PlayerAPI');
    if (!player || typeof player.getState !== 'function') return null;
    return {
      player, playback: get('PlaybackAPI'), library: get('LibraryAPI'), tokens: get('TokenProvider'),
      equalizer: get('EqualizerAPI'), settings: get('SettingsAPI'), adManagers: get('AdManagers'), control: get('ControlMessageAPI'),
      productState: get('ProductStateAPI'), remoteConfig: get('RemoteConfigDebugAPI'), playlists: get('PlaylistAPI'), rootlist: get('RootlistAPI'),
    };
  };

  const meloir = window.__meloir = { ready: false, services: null, stats: { adsMuted: 0, managersOff: [], slots: [], slotsCleared: 0, lastAd: null } };

  // Meloir.exe keeps these in a file: it hands them over at startup and saves every change.
  meloir.prefs = {
    smooth: true, smoothSeconds: 4, playOnOpen: false, focusOnOpen: false, compact: false, still: false, showLyrics: true,
    cursorGlow: true, idleFade: true, idleSeconds: 60, coverTilt: true, beatGlow: true, dropGlow: true,
    theme: 'dark', history: [], recentOpen: false, unmuteVolume: 50, discord: false, discordButton: true, coverBackdrop: false, coverBackdropLevel: 40, seenVersion: '', statsRange: 'all', searches: [], genres: {}, focusBlur: 22, focusBlurSize: 100, stats: { since: 0, ms: 0, plays: 0, tracks: {}, artists: {}, days: {} },
  };
  Object.assign(meloir.prefs, window.meloirSavedPrefs);
  meloir.setPref = (name, value) => {
    meloir.prefs[name] = value;
    if (window.meloirHost) window.meloirHost('prefs:' + JSON.stringify(meloir.prefs));
  };

  meloir.token = async forceRefresh => {
    const { tokens } = meloir.services;
    // Spotify's provider answers nothing when a load fails, so that gets one forced try.
    const result = await tokens.getToken({ forceRefresh: !!forceRefresh }) || await tokens.getToken({ forceRefresh: true });
    return typeof result === 'string' ? result : result && (result.accessToken || result.token);
  };

  meloir.session = () => ({});

  // Last known hashes, for operations the running build's main files do not name.
  const KNOWN_HASHES = {
    profileAttributes: '08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0',
    libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
    fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
    getAlbum: '11c9cad9cb24c4f9e25ef9456f68621cfd6006a90f679e729c1d2f2fd70dfe16',
    queryArtistOverview: '9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6',
    searchTracks: 'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',
    searchArtists: '7bf95d754fdbe32c8b161fbbe54d1ae50974900df4dce4c8f1afcbcad153224d',
    searchAlbums: '202cb3305e31e5a0767ba7925f28bd728cf8f8b0217e6da43909056071cd70e9',
    searchPlaylists: 'd520014e748f9ea44f7707d8df1819867ac1205e8b7f3e28f22fe5fc858921b1',
  };

  // Spotify's own Home query lives in its snapshot, out of reach of the bundle search below. Its page
  // asks for it at startup anyway, so Meloir keeps that answer.
  const pageFetch = window.fetch;
  let gotHome = () => {};
  meloir.homeAnswer = new Promise(resolve => { gotHome = resolve; });
  window.fetch = function (input, init) {
    const answer = pageFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/pathfinder/')) return answer;
    const body = init && typeof init.body === 'string' ? Promise.resolve(init.body) : input.clone ? input.clone().text() : Promise.resolve('');
    Promise.all([body, answer]).then(async ([text, response]) => {
      const request = JSON.parse(text);
      if (request.operationName === 'home' && response.ok) gotHome(await response.clone().json());
    }).catch(() => {});
    return answer;
  };

  // Operation hashes change with Spotify's builds, so the running build comes first.
  let bundle = null;
  const bundleHashes = () => bundle || (bundle = (async () => {
    const hashes = {};
    for (const src of [...document.scripts].map(s => s.src).filter(Boolean)) {
      try {
        const source = await (await fetch(src)).text();
        for (const m of source.matchAll(/new [\w$]+(?:\.[\w$]+)?\("(\w+)","(?:query|mutation|subscription)","([0-9a-f]{64})"/g)) {
          hashes[m[1]] = m[2];
        }
      } catch (e) { /* the next file */ }
    }
    return hashes;
  })());

  meloir.headers = async forceRefresh => {
    const token = await meloir.token(forceRefresh);
    if (!token) throw new Error('No Spotify session yet');
    return { authorization: 'Bearer ' + token, accept: 'application/json', 'app-platform': 'WebPlayer' };
  };

  // A rejected login gets one more try with a new token.
  meloir.spotifyFetch = async (url, options = {}) => {
    const send = async forceRefresh => fetch(url, { ...options, headers: { ...(await meloir.headers(forceRefresh)), ...options.headers } });
    const response = await send(false);
    return response.status === 401 ? send(true) : response;
  };

  // One attempt only: never retry in a loop against Spotify's servers.
  meloir.gql = async (operationName, variables) => {
    const sha256Hash = (await bundleHashes())[operationName] || KNOWN_HASHES[operationName];
    if (!sha256Hash) throw new Error('Unknown operation ' + operationName);
    const response = await meloir.spotifyFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ variables, operationName, extensions: { persistedQuery: { version: 1, sha256Hash } } }),
    });
    if (!response.ok) throw new Error('Spotify answered ' + response.status);
    const json = await response.json();
    if (!json.data) throw new Error((json.errors && json.errors[0] && json.errors[0].message) || 'Empty answer');
    return json.data;
  };

  meloir.state = () => {
    const s = meloir.services.player.getState();
    if (!s) return null;
    const elapsed = s.isPaused ? 0 : (Date.now() - s.timestamp) * (s.speed || 1);
    return { ...s, position: Math.min(s.duration || 0, (s.positionAsOfTimestamp || 0) + elapsed) };
  };

  meloir.play = (contextUri, trackUri) => meloir.services.player.play({ uri: contextUri }, {}, trackUri ? { skipTo: { uri: trackUri } } : {});
  meloir.playList = (contextUri, uris, from, shuffle = false) => meloir.services.player.play({ uri: contextUri, pages: [{ items: uris.map(uri => ({ uri })) }] }, {}, from ? { shuffle, skipTo: { uri: from } } : { shuffle });
  meloir.next = () => meloir.services.player.skipToNext();

  /*
   * The ad handling below is adapted from the adblock extension in rxri/spicetify-extensions.
   *
   * MIT License
   *
   * Copyright (c) 2021-2023 CharlieS1103
   * Copyright (c) 2024 ririxi
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  // Ads, after the approach of ririxi's adblock extension for Spicetify (MIT). The app's ad managers
  // are switched off, its ad slots are emptied and disabled, and anything that still plays as an
  // ad is muted. Its Premium overrides are left out on purpose: the account stays reported as Free.
  const SLOT_FALLBACK = ['stream', 'preroll', 'leaderboard', 'hpto'];
  const NEVER_PLAYTIME_SECONDS = -100000000000, SLOT_RETRIES = 5, SLOT_RETRY_MS = 1000;
  let watchingAccount = false;
  const AD_MODULE = /spotify\.ads\.esperanto\.proto\.Slots/;

  // Spotify's ad services sit in one module, found by name, so nothing else has to be loaded.
  const adServices = () => {
    const queue = window.rspackChunkclient_web || window.rspackChunk || window.webpackChunkclient_web;
    if (!queue) return {};
    const load = queue.push([[Symbol()], {}, internal => internal]);
    const id = Object.keys(load.m).find(key => AD_MODULE.test(String(load.m[key])));
    if (!id) return {};
    const found = {};
    for (const value of Object.values(load(id) || {})) {
      if (typeof value === 'function' && value.SERVICE_ID) found[value.SERVICE_ID.split('.').pop()] = value;
    }
    return found;
  };

  const adsOff = () => {
    const managers = meloir.services.adManagers || {};
    const off = [];
    const turnOff = (name, manager, method = 'disable') => {
      if (!manager || typeof manager[method] !== 'function') return;
      try {
        manager[method]();
        off.push(name);
      } catch (e) { /* the next one */ }
    };
    turnOff('audio', managers.audio);
    turnOff('billboard', managers.billboard);
    turnOff('inStream', managers.inStreamApi);
    turnOff('leaderboard', managers.leaderboard, 'disableLeaderboard');
    turnOff('sponsoredPlaylist', managers.sponsoredPlaylist);
    turnOff('embedded', managers.embeddedAd && managers.embeddedAd.embeddedAdManager);
    turnOff('vto', managers.vto && managers.vto.manager);
    if (managers.audio) managers.audio.isNewAdsNpvEnabled = false;
    if (managers.vto) managers.vto.isNewAdsNpvEnabled = false;
    meloir.stats.managersOff = off;
  };

  // Spotify's in-app promos and upgrade prompts. The extension's Premium mini player flag is left out.
  const CONFIG_OVERRIDES = { enableEsperantoMigration: true, enableInAppMessaging: false, hideUpgradeCTA: true };
  const applyConfig = async () => {
    const config = meloir.services.remoteConfig;
    if (!config || !config.getProperties || !config.setOverride) return;
    const properties = await config.getProperties();
    for (const [name, value] of Object.entries(CONFIG_OVERRIDES)) {
      const ref = properties.find(property => property && property.source === 'web' && property.type === 'boolean' && property.name === name);
      if (ref) await config.setOverride({ ref, value }, { autoRunOverrideEffects: ref.localValue !== value });
    }
  };

  const blockSlots = async () => {
    const { adManagers, productState } = meloir.services;
    const state = productState && productState.productStateApi;
    if (!state) return;
    await state.putOverridesValues({ pairs: { ads: '0' } }).catch(() => {});

    const { Slots, Settings, Testing } = adServices();
    const slots = Slots && new Slots(state.transport);
    const settings = Settings && new Settings(state.transport);
    const testing = Testing && new Testing(state.transport);
    const pushBackAds = () => {
      if (testing) Promise.resolve(testing.addPlaytime({ seconds: NEVER_PLAYTIME_SECONDS })).catch(() => {});
    };
    pushBackAds();

    const connector = adManagers.inStreamApi && adManagers.inStreamApi.adsCoreConnector;
    const empty = async (slotId, tries = 0) => {
      meloir.stats.slotsCleared++;
      try {
        if (connector) connector.clearSlot(slotId);
        if (slots) await slots.clearAllAds({ slotId });
      } catch (e) {
        if (tries < SLOT_RETRIES) setTimeout(() => empty(slotId, tries + 1), SLOT_RETRY_MS);
      }
      pushBackAds();
      if (!settings) return;
      await Promise.resolve(settings.updateAdServerEndpoint({ slotIds: [slotId], url: 'http://localhost/no/thanks' })).catch(() => {});
      await Promise.resolve(settings.updateStreamTimeInterval({ slotId, timeInterval: 0n })).catch(() => {});
      await Promise.resolve(settings.updateSlotEnabled({ slotId, enabled: false })).catch(() => {});
      await Promise.resolve(settings.updateDisplayTimeInterval({ slotId, timeInterval: 0n })).catch(() => {});
    };

    const known = slots ? await Promise.resolve(slots.getSlots()).catch(() => null) : null;
    const ids = known && known.adSlots && known.adSlots.length
      ? known.adSlots.map(slot => slot.slotId || slot.slot_id) : SLOT_FALLBACK;
    meloir.stats.slots = ids;
    for (const id of ids) {
      try {
        if (connector) connector.subscribeToSlot(id, event => { empty((event && event.adSlotEvent && event.adSlotEvent.slotId) || id); adsOff(); });
      } catch (e) { /* the slot is still emptied below */ }
      await empty(id);
    }

    // Spotify changing the account's ad state undoes some of this.
    if (watchingAccount) return;
    watchingAccount = true;
    state.subValues({ keys: ['ads', 'catalogue', 'product', 'type'] }, () => {
      adsOff();
      pushBackAds();
    });
  };

  // Which sign made Meloir treat something as an ad.
  const adSign = item => {
    if (!item) return null;
    if (item.type === 'ad') return 'type';
    if (String(item.uri || '').startsWith('spotify:ad:')) return 'uri';
    if (item.advertiser) return 'advertiser';
    if (item.metadata && item.metadata.is_advertisement === 'true') return 'is_advertisement';
    if (item.metadata && item.metadata.ad_id) return 'ad_id';
    return null;
  };
  meloir.isAd = item => !!adSign(item);

  let mutedForAd = false;
  meloir.mutedForAd = () => mutedForAd;
  const watchAds = () => {
    const state = meloir.services.player.getState();
    const ad = !!state && meloir.isAd(state.item);
    if (ad === mutedForAd) return;
    mutedForAd = ad;
    if (ad) {
      meloir.stats.adsMuted++;
      meloir.stats.lastAd = { sign: adSign(state.item), at: new Date().toISOString(), seconds: Math.round((state.duration || 0) / 1000) };
    }
    const mute = meloir.services.playback.getMuteHelper();
    if (ad) mute.mute();
    else mute.unmute();
  };

  const boot = setInterval(() => {
    let services = null;
    try { services = resolveServices(); } catch (e) { return; }
    if (!services) return;
    clearInterval(boot);
    meloir.services = services;
    meloir.ready = true;
    adsOff();
    blockSlots().catch(() => {});
    applyConfig().catch(() => {});
    setTimeout(() => { applyConfig().catch(() => {}); }, 3000);
    setTimeout(() => { blockSlots().catch(() => {}); }, 5000);
    setInterval(adsOff, 30000);
    setInterval(watchAds, 250);
    window.dispatchEvent(new Event('meloir:ready'));
  }, 250);
})();
