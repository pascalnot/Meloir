/*
 * Meloir audio: Spotify's own equalizer and crossfade, and a short volume fade on pause and resume.
 */
(() => {
  if (location.hostname !== 'xpui.app.spotify.com' || window.top !== window) return;

  const PAUSE_FADE_MS = 200, RESUME_FADE_MS = 300, FADE_STEP_MS = 16, SETTLE_LIMIT_MS = 800, DRAIN_MS = 800, QUIET = 0.01;
  const PRESETS = {
    Flat: [0, 0, 0, 0, 0, 0],
    Bass: [6, 4, 1, 0, 0, 0],
    Treble: [0, 0, 0, 1, 4, 6],
    Vocal: [-2, 0, 2, 4, 3, 0],
    Warm: [3, 2, 1, -1, 0, 1],
    Loud: [5, 2, -1, 0, 2, 5],
  };

  const meloir = window.__meloir;
  const settings = { crossfade: 0, autoMix: false, eq: false, eqBlocked: false, preset: 'Custom', gains: PRESETS.Flat.slice() };
  let filters = [];

  const presetOf = gains => Object.keys(PRESETS).find(name => PRESETS[name].every((g, i) => Math.abs(g - gains[i]) < 0.1)) || 'Custom';

  const load = async () => {
    const { equalizer, settings: spotify } = meloir.services;
    filters = await equalizer.getFilters();
    meloir.audio.BANDS = filters.map(filter => filter.frequency);
    settings.gains = filters.map(filter => Math.round(filter.gain));
    settings.preset = presetOf(settings.gains);
    equalizer.subscribeToEnabledState(on => { settings.eq = on; });
    const { audioCrossfade, audioCrossfadeMs, autoMix } = spotify.playback;
    settings.crossfade = (await audioCrossfade.getValue()) ? Math.round((await audioCrossfadeMs.getValue()) / 1000) : 0;
    settings.autoMix = !!(await autoMix.getValue());
  };

  const setGains = gains => {
    settings.gains = gains.slice();
    filters.forEach((filter, i) => meloir.services.equalizer.setFilterGain(filter.key, gains[i]));
  };

  // Pause and resume fades. The latest press wins: `run` marks the current one, and a press during
  // a fade reverses it from where the volume is. `wanted` is what the button should show meanwhile.
  let run = 0, wanted = null, level = null, heard = 0;

  const ramp = (id, to, ms) => new Promise(resolve => {
    const from = heard, started = performance.now();
    const step = () => {
      if (id !== run) { resolve(); return; }
      const progress = Math.min(1, (performance.now() - started) / ms);
      heard = from + (to - from) * progress;
      meloir.services.playback.setVolume(heard);
      if (progress < 1) setTimeout(step, FADE_STEP_MS);
      else resolve();
    };
    step();
  });

  // Spotify applies a pause a moment after the command, and the volume must not rise before that.
  const until = (paused, id) => new Promise(resolve => {
    const started = performance.now();
    const step = () => {
      const state = meloir.services.player.getState();
      if (id !== run || (state && state.isPaused === paused) || performance.now() - started > SETTLE_LIMIT_MS) resolve();
      else setTimeout(step, 15);
    };
    step();
  });

  const finish = id => {
    if (id !== run) return;
    if (level !== null) meloir.services.playback.setVolume(level);
    level = null;
    wanted = null;
  };

  const toggle = async () => {
    const { player, playback } = meloir.services;
    const state = player.getState();
    if (!state) return;
    const pause = wanted === null ? !state.isPaused : !wanted;
    wanted = pause;
    const id = ++run;
    try {
      if (level === null) {
        level = await playback.getVolume();
        heard = level;
      }
      if (id !== run) return;
      if (!level || meloir.mutedForAd()) {
        await (pause ? player.pause() : player.resume());
        await until(pause, id);
      } else if (pause) {
        await ramp(id, level * QUIET, PAUSE_FADE_MS);
        if (id !== run) return;
        await player.pause();
        await until(true, id);
        // The state says paused while sound is still in the output buffer: raising the volume
        // now would play the end of that sound at full level.
        await new Promise(resolve => setTimeout(resolve, DRAIN_MS));
      } else {
        if (player.getState().isPaused) {
          heard = level * QUIET;
          playback.setVolume(heard);
          await player.resume();
          await until(false, id);
          if (id !== run) return;
        }
        await ramp(id, level, RESUME_FADE_MS);
      }
    } finally {
      finish(id);
    }
  };

  // Smooth transitions. One player cannot overlap two songs, so the end of a song fades out, the
  // last moments are skipped, which is often silence, and the next song fades in.
  const TRIM_MS = 1500, SMOOTH_IN_MS = 900, SONG_CHANGE_LIMIT_MS = 3000, CANCEL_FADE_MS = 300;
  let transition = null;

  const songChanged = (from, id) => new Promise(resolve => {
    const started = performance.now();
    const step = () => {
      const state = meloir.services.player.getState();
      const moved = state && state.item && state.item.uri !== from;
      if (id !== run || moved || performance.now() - started > SONG_CHANGE_LIMIT_MS) resolve();
      else setTimeout(step, 20);
    };
    step();
  });

  const smoothOut = async state => {
    const id = ++run;
    const from = state.item.uri;
    transition = { id, uri: from, skipped: false };
    try {
      if (level === null) {
        level = await meloir.services.playback.getVolume();
        heard = level;
      }
      if (id !== run) return;
      if (!level) return;
      await ramp(id, level * QUIET, state.duration - state.position - TRIM_MS);
      if (id !== run) return;
      transition.skipped = true;
      await meloir.next();
      await songChanged(from, id);
      if (id !== run) return;
      await ramp(id, level, SMOOTH_IN_MS);
    } finally {
      if (transition && transition.id === id) transition = null;
      finish(id);
    }
  };

  const watchSongEnd = () => {
    const { prefs } = meloir;
    const state = meloir.state();
    if (!state || !state.item) return;
    const span = prefs.smoothSeconds * 1000;
    const left = state.duration - state.position;
    if (transition) {
      // A seek or a skip during the fade: the song goes on, so the sound comes back.
      if (transition.skipped || (state.item.uri === transition.uri && left <= span + TRIM_MS + 1000)) return;
      const id = ++run;
      transition = null;
      ramp(id, level, CANCEL_FADE_MS).then(() => finish(id));
      return;
    }
    if (!prefs.smooth || wanted !== null || level !== null || state.isPaused || state.repeat === 2) return;
    if (meloir.isAd(state.item) || meloir.mutedForAd() || state.duration < span * 4) return;
    if (left <= span + TRIM_MS && left > TRIM_MS) smoothOut(state);
  };

  meloir.audio = {
    BANDS: [], PRESETS, settings, toggle,
    setCrossfade(seconds) {
      const { audioCrossfade, audioCrossfadeMs } = meloir.services.settings.playback;
      settings.crossfade = seconds;
      audioCrossfade.setValue(seconds > 0);
      if (seconds > 0) audioCrossfadeMs.setValue(seconds * 1000);
    },
    setAutoMix(on) {
      settings.autoMix = on;
      meloir.services.settings.playback.autoMix.setValue(on);
    },
    setEq(on) {
      settings.eq = on;
      meloir.services.equalizer.setEnabledState(on);
    },
    setBand(index, gain) {
      settings.gains[index] = gain;
      settings.preset = presetOf(settings.gains);
      meloir.services.equalizer.setFilterGain(filters[index].key, gain);
    },
    setPreset(name) {
      settings.preset = name;
      setGains(PRESETS[name]);
    },
    wantedPause: () => wanted,
    // The volume slider moved during a fade: that is the level to come back to.
    rebase(value) { if (level !== null) level = value; },
  };

  window.addEventListener('meloir:ready', () => {
    load().catch(() => {});
    setInterval(() => { try { watchSongEnd(); } catch (e) { /* the next tick */ } }, 100);
  }, { once: true });
})();
