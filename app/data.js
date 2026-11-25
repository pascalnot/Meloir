/*
 * Meloir data. Reads through the Web Player's GraphQL service and flattens its wrappers into the
 * small shapes the UI draws.
 */
(() => {
  if (location.hostname !== 'xpui.app.spotify.com' || window.top !== window) return;

  const meloir = window.__meloir;
  const idOf = uri => String(uri || '').split(':').pop();
  const sources = list => [...(list || [])].sort((a, b) => (b.width || 0) - (a.width || 0));
  const artistsOf = d => ((d.artists && d.artists.items) || []).map(a => ({ name: a.profile ? a.profile.name : a.name, uri: a.uri }));
  const GENRE_PACE_MS = 3200, GENRE_BACKOFF_MS = 60000, GENRE_SAVE_EVERY = 15, GENRE_BATCH = 200;
  // Wikidata's many small genres, folded into the few the menu shows. The first group names a
  // specific sound and wins outright; otherwise the group with the most matches does.
  const SPECIFIC_GENRES = [['House', /house/i], ['Techno', /techno/i], ['Trance', /trance/i], ["Jungle/Drum'n'bass", /drum and bass|jungle/i], ['Dubstep', /dubstep/i]];
  const BROAD_GENRES = [['Hip-Hop/Rap', /hip.?hop|rap|trap|drill/i], ['R&B/Soul', /r&b|rhythm and blues|soul|funk/i], ['Metal', /metal/i], ['Pop', /pop/i], ['Rock', /rock|punk|grunge/i],
    ['Alternative', /alternative|indie/i], ['Dance', /dance|disco|garage/i], ['Electronic', /electr|edm|ambient|downtempo/i], ['Country', /country/i], ['Jazz', /jazz/i], ['Classical', /classical|opera/i], ['Reggae', /reggae|dancehall/i], ['Latin', /latin|reggaeton/i]];
  const HOME_WAIT_MS = 10000, MIN_SHELF_ITEMS = 3, MAX_SHELVES = 8, HOME_SECTIONS = ['HomeGenericSectionData', 'HomeFeedBaselineSectionData'];
  const MIN_LIKED_ALBUMS = 8, MAX_SINGLE_ALBUMS = 60;
  const DROP_RISE_DB = 2.5, BEAT_RANGE_DB = 15, BEAT_EARLY_SECONDS = 0.05, MIN_BEAT_LEVEL = 0.2;
  const beatCache = new Map(), genreQueue = new Map();
  let genreRunning = false, genreWatcher = () => {};
  const MIX_LENGTH = 50, MIX_RELEASES = 3, MIX_NEAREST_ARTISTS = 16, MIX_SIMILAR_ARTISTS = 8, MIX_SONGS_EACH = 3;
  const shuffled = list => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const weave = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter(Boolean);
  const settled = async jobs => (await Promise.allSettled(jobs)).filter(job => job.status === 'fulfilled').map(job => job.value);
  const names = track => (track.artists || []).map(artist => artist.name).join();
  const leadArtist = track => ((track.artists || [])[0] || {}).name;
  const spaced = tracks => {
    const out = [], rest = [...tracks];
    while (rest.length) {
      const last = out[out.length - 1];
      const next = rest.findIndex(track => !last || leadArtist(track) !== leadArtist(last));
      out.push(...rest.splice(Math.max(next, 0), 1));
    }
    return out;
  };
  const unwrap = wrapper => (wrapper && wrapper.data) || wrapper;
  const known = d => !!d && !!d.uri && d.__typename !== 'NotFound';

  const toAlbum = d => ({
    type: 'album', id: idOf(d.uri), uri: d.uri, name: d.name, artists: artistsOf(d),
    images: sources(d.coverArt && d.coverArt.sources), year: d.date && d.date.year,
  });
  const toArtist = d => ({
    type: 'artist', id: idOf(d.uri), uri: d.uri, name: d.profile ? d.profile.name : d.name,
    images: sources(d.visuals && d.visuals.avatarImage && d.visuals.avatarImage.sources),
  });
  const toPlaylist = d => ({
    type: 'playlist', id: idOf(d.uri), uri: d.uri, name: d.name,
    images: sources(d.images && d.images.items && d.images.items[0] && d.images.items[0].sources),
    owner: { display_name: d.ownerV2 && d.ownerV2.data && d.ownerV2.data.name },
  });
  const toTrack = (d, album) => {
    const of = d.albumOfTrack;
    return {
      uri: d.uri, name: d.name, artists: artistsOf(d),
      album: album || (of ? { uri: of.uri, name: of.name, images: sources(of.coverArt && of.coverArt.sources) } : null),
      duration_ms: (d.duration || d.trackDuration || {}).totalMilliseconds,
    };
  };

  // When a song was added to a list, in milliseconds. Spotify gives it as text or as a date.
  const addedTime = at => (at ? new Date(at.isoString || at).getTime() || 0 : 0);

  const toLibraryItem = wrapper => {
    const d = unwrap(wrapper);
    const uri = (wrapper && wrapper._uri) || (d && d.uri) || '';
    if (!d || d.__typename === 'NotFound') return null;
    const full = { ...d, uri };
    if (uri.startsWith('spotify:playlist:')) return toPlaylist(full);
    if (uri.startsWith('spotify:album:')) return toAlbum(full);
    if (uri.startsWith('spotify:artist:')) return toArtist(full);
    if (uri === 'spotify:collection:tracks') return { type: 'liked', count: d.count, images: sources(d.image && d.image.sources) };
    return null;
  };

  const searchVariables = (searchTerm, limit) => ({
    searchTerm, offset: 0, limit, numberOfTopResults: limit, includeAudiobooks: false, includeAuthors: true,
    includePreReleases: false, includeAlbumPreReleases: false, includeEpisodeContentRatingsV2: true,
  });

  const LYRICS_TIMEOUT_MS = 6000, SAME_SONG_MS = 4000, WORD_MIN_MS = 400, WORD_PACE_TIMES = 2.5;

  // Titles and artists as letters and digits only, without accents and without the extras
  // Spotify adds, such as "- 2011 Remaster" or "(feat. X)".
  const fold = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const pickGenre = labels => {
    const specific = SPECIFIC_GENRES.find(([, test]) => labels.some(label => test.test(label)));
    if (specific) return specific[0];
    const [best, matches] = BROAD_GENRES.map(([name, test]) => [name, labels.filter(label => test.test(label)).length]).sort((a, b) => b[1] - a[1])[0];
    return matches ? best : '';
  };
  const wikidataLabels = async (keys, byName) => {
    const artist = byName ? 'VALUES ?kind { wd:Q5 wd:Q215380 wd:Q2088357 wd:Q5741069 } ?artist rdfs:label ?key; wdt:P31 ?kind' : '?artist wdt:P1902 ?key';
    const query = 'SELECT DISTINCT ?key ?genre WHERE { VALUES ?key { ' + keys.join(' ') + ' } ' + artist + '; wdt:P136 ?item. ?item rdfs:label ?genre. FILTER(LANG(?genre) = "en") }';
    const response = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' }, body: 'query=' + encodeURIComponent(query) });
    if (!response.ok) throw new Error('Wikidata answered ' + response.status);
    const labels = new Map();
    for (const { key, genre } of (await response.json()).results.bindings) labels.set(key.value, [...(labels.get(key.value) || []), genre.value]);
    return labels;
  };
  // First by Spotify's own artist id, then by name for those Wikidata has no id for.
  // If it can't be reached, everyone simply stays in the queue for iTunes.
  const askWikidata = async () => {
    for (const byName of [false, true]) {
      const waiting = [...genreQueue];
      for (let at = 0; at < waiting.length; at += GENRE_BATCH) {
        const batch = waiting.slice(at, at + GENRE_BATCH);
        try {
          const labels = await wikidataLabels(batch.map(([uri, name]) => (byName ? JSON.stringify(name) + '@en' : '"' + idOf(uri) + '"')), byName);
          for (const [uri, name] of batch) {
            const genre = pickGenre(labels.get(byName ? name : idOf(uri)) || []);
            if (!genre) continue;
            meloir.prefs.genres[uri] = genre;
            genreQueue.delete(uri);
          }
          meloir.setPref('genres', meloir.prefs.genres);
          genreWatcher(genreQueue.size);
        } catch (e) {
          return;
        }
      }
    }
  };
  // The title without what Spotify adds, such as " - 2011 Remaster" or " (feat. X)".
  const plainTitle = text => String(text || '').split(' - ')[0].replace(/\s*[([][^)\]]*[)\]]/g, '').trim();
  const foldTitle = text => fold(plainTitle(text));
  const sameTitle = (a, b) => {
    const x = foldTitle(a), y = foldTitle(b);
    return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
  };
  const sameArtist = (candidate, artist) => {
    const wanted = fold(artist);
    return !!wanted && [candidate, ...String(candidate || '').split(/[,&/]/)].some(name => fold(name) === wanted);
  };

  class RateLimited extends Error {}
  const ask = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(LYRICS_TIMEOUT_MS) });
    if (response.status === 429) throw new RateLimited();
    return response;
  };

  // Backing vocals come in brackets, which the smaller row they are shown in already says.
  const backing = words => {
    if (!words.length) return undefined;
    const row = words.map(word => ({ ...word }));
    row[0].text = row[0].text.replace(/^\s*\(/, '');
    row[row.length - 1].text = row[row.length - 1].text.replace(/\)\s*$/, '');
    return row;
  };

  // Duets: the first singer stays on the left and the second goes right, as do the fourth, sixth...
  // Lines sung together, and songs with one singer, stay on the left.
  const withSingers = (lines, together) => {
    const singers = [];
    for (const line of lines) if (line.voice && !together(line.voice) && !singers.includes(line.voice)) singers.push(line.voice);
    for (const line of lines) {
      if (singers.length > 1 && singers.indexOf(line.voice) % 2 === 1) line.right = true;
      delete line.voice;
    }
    return lines;
  };

  // Each word's own start and length. A word split into syllables has `part` set on its pieces.
  const toTimedLine = line => {
    const all = (line.syllabus || []).filter(piece => piece.text);
    const pieces = all.filter(piece => !piece.isBackground);
    // Many songs have no word timing, but still the line's real length.
    if (!pieces.length) {
      return line.text && line.text.trim() ? { start: Number(line.time), end: Number(line.time) + Number(line.duration), text: line.text } : null;
    }
    const toWord = piece => ({
      at: Number(piece.time),
      end: Number(piece.time) + Number(piece.duration),
      text: piece.part || /\s$/.test(piece.text) ? piece.text : piece.text + ' ',
    });
    return {
      start: Number(line.time),
      text: pieces.map(piece => piece.text).join(''),
      words: pieces.map(toWord),
      background: backing(all.filter(piece => piece.isBackground).map(toWord)),
      voice: line.element && line.element.singer,
    };
  };

  // Answers are kept, so a song is only asked for once. The service limits how fast it is asked.
  const LYRICS_CACHE = 'meloir.lyrics8.', LYRICS_CACHE_INDEX = 'meloir.lyrics8.index', LYRICS_CACHE_SIZE = 200, RATE_LIMIT_WAIT_MS = 120000;

  // Earlier versions kept answers from fewer sources, with words timed too long, kept lines
  // without words where lrc.red had them, left out backing vocals and singers, or kept LRCLIB's
  // rougher words where lrc.red had better ones.
  try {
    Object.keys(localStorage).filter(key => /^meloir\.lyrics[234567]?\./.test(key)).forEach(key => localStorage.removeItem(key));
  } catch (e) { /* nothing kept */ }

  const cached = uri => {
    try { return JSON.parse(localStorage.getItem(LYRICS_CACHE + uri)); } catch (e) { return null; }
  };
  const remember = (uri, lyrics) => {
    try {
      const index = JSON.parse(localStorage.getItem(LYRICS_CACHE_INDEX) || '[]').filter(known => known !== uri);
      index.push(uri);
      while (index.length > LYRICS_CACHE_SIZE) localStorage.removeItem(LYRICS_CACHE + index.shift());
      localStorage.setItem(LYRICS_CACHE_INDEX, JSON.stringify(index));
      localStorage.setItem(LYRICS_CACHE + uri, JSON.stringify(lyrics));
    } catch (e) { /* not kept */ }
  };

  // With "(feat. ...)" in the title it often doesn't answer at all, so it gets the plain title.
  const fromLyricsPlus = async ({ title, artist, durationMs }) => {
    const query = 'title=' + encodeURIComponent(plainTitle(title) || title) + '&artist=' + encodeURIComponent(artist)
      + (durationMs ? '&duration=' + Math.round(durationMs / 1000) : '');
    const response = await ask('https://lyricsplus.binimum.org/v2/lyrics/get?' + query);
    if (!response.ok) return null;
    const answer = await response.json();
    if (answer.metadata && answer.metadata.title && !sameTitle(answer.metadata.title, title)) return null;
    // Its voices follow Apple's: v1000 and up are everyone singing together.
    return withSingers((answer.lyrics || []).map(toTimedLine).filter(Boolean), voice => /^v\d{4,}$/.test(voice));
  };

  // TTML times: "11.859", "1:02.345" or "00:01:02.345".
  const clock = value => String(value || '').replace(/s$/, '').split(':').reduce((total, part) => total * 60 + Number(part), 0) * 1000;

  // A <p> per line and a timed <span> per word. The text between two spans is the space after a
  // word. A span with the role x-bg holds the backing vocals' own timed spans; other roles are
  // translations. The singer is on the line or on the part of the song around it.
  const ttmlWords = (parent, words, backgroundWords) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (words.length) words[words.length - 1].text += node.textContent;
      } else if (node.nodeName === 'span') {
        const role = node.getAttribute('ttm:role');
        if (role === 'x-bg' && backgroundWords) ttmlWords(node, backgroundWords, null);
        else if (!role && node.getAttribute('begin')) words.push({ at: clock(node.getAttribute('begin')), end: clock(node.getAttribute('end')), text: node.textContent });
      }
    }
  };
  const ttmlVoice = p => {
    for (let node = p; node && node.getAttribute; node = node.parentNode) if (node.getAttribute('ttm:agent')) return node.getAttribute('ttm:agent');
    return undefined;
  };
  const ttmlLine = p => {
    const words = [], backgroundWords = [];
    ttmlWords(p, words, backgroundWords);
    const start = clock(p.getAttribute('begin'));
    if (words.length) return { start, text: words.map(word => word.text).join('').trim(), words, background: backing(backgroundWords), voice: ttmlVoice(p) };
    const text = p.textContent.trim();
    return text ? { start, end: clock(p.getAttribute('end')), text } : null;
  };
  const TTML_META = 'http://www.w3.org/ns/ttml#metadata';

  // The length lrc.red's search lists can be seconds off (Outside by Calvin Harris: 223 s, really
  // 227 s), so the closest few are fetched and judged by the length in the file itself.
  const LRC_RED_TRIES = 3;
  // Its search finds nothing for words it doesn't index, such as "feat." ("Outside (feat. Ellie
  // Goulding) Calvin Harris" has no hits, "Outside Calvin Harris" has), so the plain title is asked first.
  const lrcRedHits = async (title, artist) => {
    for (const name of [...new Set([plainTitle(title) || title, title])]) {
      const search = await ask('https://lrc.red/search.json?q=' + encodeURIComponent(name + ' ' + artist));
      if (!search.ok) return [];
      const hits = (await search.json()).hits || [];
      if (hits.length) return hits;
    }
    return [];
  };
  const fromLrcRed = async ({ title, artist, durationMs }) => {
    const off = candidate => (durationMs && candidate.duration ? Math.abs(candidate.duration * 1000 - durationMs) : 0);
    const hits = (await lrcRedHits(title, artist)).filter(candidate => candidate.isrc && sameTitle(candidate.title, title)
      && sameArtist(candidate.artist, artist)).sort((a, b) => off(a) - off(b)).slice(0, LRC_RED_TRIES);
    for (const hit of hits) {
      const file = await ask('https://lrc.red/s/' + encodeURIComponent(hit.isrc) + '.ttml');
      if (!file.ok) continue;
      const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
      const body = xml.getElementsByTagName('body')[0];
      const length = body && body.getAttribute('dur') ? clock(body.getAttribute('dur')) : (hit.duration || 0) * 1000;
      if (durationMs && length && Math.abs(length - durationMs) > SAME_SONG_MS) continue;
      const groups = [...xml.getElementsByTagNameNS(TTML_META, 'agent')].filter(agent => agent.getAttribute('type') === 'group')
        .map(agent => agent.getAttribute('xml:id'));
      return withSingers([...xml.getElementsByTagName('p')].map(ttmlLine).filter(Boolean), voice => groups.includes(voice));
    }
    return null;
  };

  // LRCLIB's word timing comes as a small YAML file: a list of lines, each with its words.
  const yamlValue = raw => {
    const value = raw.trim();
    if (value.startsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    if (value.startsWith('"')) { try { return JSON.parse(value); } catch (e) { return value.slice(1, -1); } }
    return value;
  };
  const lrclibWords = file => {
    const lines = [];
    let line = null, word = null;
    for (const text of String(file || '').split('\n')) {
      const field = text.match(/^(\s*)(- )?(\w+):\s?(.*)$/);
      if (!field) continue;
      const [, indent, item, key, raw] = field;
      if (indent === '' && item && key === 'text') { line = { text: yamlValue(raw), words: [] }; word = null; lines.push(line); }
      else if (line && indent.length >= 2 && item && key === 'text') { word = { text: yamlValue(raw) }; line.words.push(word); }
      else if (line && key === 'start_ms') (word || line).start = Number(raw);
      else if (line && key === 'end_ms') (word || line).end = Number(raw);
    }
    // Words often come with only a start. Stretched to the next word, one sung before a pause would
    // light up across the whole pause, so such a word lasts as long as the song's words usually do.
    const gaps = lines.flatMap(l => l.words.slice(1).map((w, i) => w.start - l.words[i].start)).filter(gap => gap > 0).sort((a, b) => a - b);
    const longest = Math.max(WORD_MIN_MS, (gaps[Math.floor(gaps.length / 2)] || 0) * WORD_PACE_TIMES);
    return lines.filter(l => l.text && l.text.trim()).map(l => {
      if (!l.words.length) return { start: l.start, end: l.end, text: l.text };
      const words = l.words.map((w, i) => ({
        at: w.start, end: w.end || Math.min(l.words[i + 1] ? l.words[i + 1].start : l.end, w.start + longest),
        text: /\s$/.test(w.text) || i === l.words.length - 1 ? w.text : w.text + ' ',
      }));
      return { start: l.start, text: l.text, words };
    });
  };
  // Without word timing, each line lasts until the next one starts.
  const lrcLines = lrc => {
    const lines = [];
    for (const text of String(lrc || '').split('\n')) {
      const stamp = text.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
      if (stamp) lines.push({ start: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000, text: stamp[3].trim() });
    }
    lines.forEach((line, i) => { line.end = lines[i + 1] ? lines[i + 1].start : line.start + 4000; });
    return lines.filter(line => line.text);
  };
  const fromLrclib = async ({ title, artist, durationMs }) => {
    const query = 'track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(artist);
    let found = null;
    if (durationMs) {
      const exact = await ask('https://lrclib.net/api/get?' + query + '&duration=' + Math.round(durationMs / 1000));
      if (exact.ok) found = await exact.json();
    }
    if (!found) {
      const search = await ask('https://lrclib.net/api/search?' + query);
      if (!search.ok) return null;
      found = (await search.json()).find(candidate => (candidate.syncedLyrics || candidate.lyricsfile) && sameTitle(candidate.trackName, title)
        && sameArtist(candidate.artistName, artist) && (!durationMs || Math.abs(candidate.duration * 1000 - durationMs) <= SAME_SONG_MS));
    }
    if (!found || found.instrumental) return null;
    if (found.hasWordSync && found.lyricsfile) {
      const words = lrclibWords(found.lyricsfile);
      if (words.length) return words;
    }
    return lrcLines(found.syncedLyrics);
  };

  // Best first: lrc.red has the cleanest word timing, backing vocals and singers. LRCLIB's words
  // often have only a start, and nothing about who sings.
  const SOURCES = [{ name: 'lrc.red', get: fromLrcRed, askAgainAt: 0 }, { name: 'LyricsPlus', get: fromLyricsPlus, askAgainAt: 0 },
    { name: 'LRCLIB', get: fromLrclib, askAgainAt: 0 }];
  const WORDS_GRACE_MS = 1500;

  // Many answers are labelled as word timed but have every time at 0: text with no timing.
  const hasTiming = lines => !!lines && lines.length > 0
    && lines.filter(line => (line.words && line.words.some(word => word.end > 0)) || line.end > line.start).length >= lines.length / 2;

  // All sources are asked at once, so a slow one holds nothing up. The first answer with word
  // timing wins as soon as it is in; without one, the earliest source in the list with line
  // lengths does. A song is only remembered as having nothing when every source really answered.
  const asking = new Map();
  const askAll = async (uri, song) => {
    let unsure = false;
    const answers = SOURCES.map(async source => {
      if (Date.now() < source.askAgainAt) { unsure = true; return null; }
      try {
        const lines = await source.get(song);
        return hasTiming(lines) ? { synced: true, wordTimed: lines.some(line => line.words), source: source.name, lines } : null;
      } catch (e) {
        unsure = true;
        if (e instanceof RateLimited) source.askAgainAt = Date.now() + RATE_LIMIT_WAIT_MS;
        return null;
      }
    });
    // An answer with words waits for the better sources above it in the list, but not for long.
    const firstWords = new Promise(resolve => {
      const done = SOURCES.map(() => false), found = SOURCES.map(() => null);
      let graceTimer = 0;
      const decide = force => {
        for (let i = 0; i < SOURCES.length; i++) {
          if (found[i]) { clearTimeout(graceTimer); resolve(found[i]); return; }
          if (!done[i] && !force) {
            if (!graceTimer && found.some(Boolean)) graceTimer = setTimeout(() => decide(true), WORDS_GRACE_MS);
            return;
          }
        }
        if (done.every(Boolean)) resolve(null);
      };
      answers.forEach((answer, i) => answer.then(lyrics => {
        done[i] = true;
        found[i] = lyrics && lyrics.wordTimed ? lyrics : null;
        decide(false);
      }));
    });
    const words = await firstWords;
    if (words) {
      remember(uri, words);
      return words;
    }
    const best = (await Promise.all(answers)).find(Boolean) || null;
    // Lines without word timing are only kept when no source failed: the one that timed out may
    // have had the words, so the song is asked again next time.
    if (best && !unsure) remember(uri, best);
    else if (!best && !unsure) remember(uri, { none: true });
    return best;
  };
  // Skipping back and forth asks for a song still being looked up: the same lookup answers both.
  const wordLyrics = (uri, song) => {
    const known = cached(uri);
    if (known) return Promise.resolve(known.none ? null : known);
    if (!asking.has(uri)) asking.set(uri, askAll(uri, song).finally(() => asking.delete(uri)));
    return asking.get(uri);
  };

  meloir.data = {
    profile: async () => {
      const { profile } = (await meloir.gql('profileAttributes', {})).me;
      return { id: profile.username, display_name: profile.name };
    },

    library: async () => {
      const data = await meloir.gql('libraryV3', {
        order: null, textFilter: '', features: ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'PRERELEASES_V2', 'CLIPS', 'EVENTS'],
        limit: 50, offset: 0, flatten: false, expandedFolders: [], folderUri: null, includeFoldersWhenFlattening: true,
      });
      return data.me.libraryV3.items.map(entry => toLibraryItem(entry.item)).filter(Boolean);
    },

    search: async q => {
      const [tracks, artists, albums, playlists] = await Promise.all([
        meloir.gql('searchTracks', searchVariables(q, 10)),
        meloir.gql('searchArtists', searchVariables(q, 10)),
        meloir.gql('searchAlbums', searchVariables(q, 10)),
        meloir.gql('searchPlaylists', searchVariables(q, 10)),
      ]);
      return {
        tracks: tracks.searchV2.tracksV2.items.map(i => unwrap(i.item)).filter(known).map(d => toTrack(d)),
        artists: artists.searchV2.artists.items.map(unwrap).filter(known).map(toArtist),
        albums: albums.searchV2.albumsV2.items.map(unwrap).filter(known).map(toAlbum),
        playlists: playlists.searchV2.playlists.items.map(unwrap).filter(known).map(toPlaylist),
      };
    },

    playlistPageSize: 100,
    playlist: async (id, offset = 0) => {
      const uri = 'spotify:playlist:' + id;
      const { playlistV2: p } = await meloir.gql('fetchPlaylist', {
        uri, offset, limit: meloir.data.playlistPageSize, enableWatchFeedEntrypoint: true, includeEpisodeContentRatingsV2: true,
      });
      return {
        ...toPlaylist({ ...p, uri }), total: p.content.totalCount,
        tracks: p.content.items.filter(i => known(unwrap(i.itemV2))).map(i => ({ ...toTrack(unwrap(i.itemV2)), uid: i.uid, added: addedTime(i.addedAt) })),
      };
    },

    album: async id => {
      const uri = 'spotify:album:' + id;
      const { albumUnion: a } = await meloir.gql('getAlbum', { uri, locale: '', offset: 0, limit: 50 });
      const album = toAlbum({ ...a, uri });
      return { ...album, tracks: a.tracksV2.items.map(i => toTrack(i.track, album)) };
    },

    artist: async id => {
      const uri = 'spotify:artist:' + id;
      const { artistUnion: a } = await meloir.gql('queryArtistOverview', { uri, locale: '', preReleaseV2: true });
      const releases = group => ((a.discography[group] && a.discography[group].items) || [])
        .map(i => i.releases.items[0]).filter(known).map(toAlbum);
      return {
        ...toArtist({ ...a, uri }),
        tracks: a.discography.topTracks.items.map(i => toTrack(i.track)),
        releases: [...releases('albums'), ...releases('singles')],
        related: ((a.relatedContent && a.relatedContent.relatedArtists.items) || []).filter(known).map(toArtist),
      };
    },

    // Different on every call: the artist's hits and deep cuts take turns with songs from artists
    // like them, and the same artist only plays twice in a row if nobody else is left.
    artistMix: async id => {
      const artist = await meloir.data.artist(id);
      const [albums, similar] = await Promise.all([
        settled(shuffled(artist.releases).slice(0, MIX_RELEASES).map(album => meloir.data.album(album.id))),
        settled(shuffled(artist.related.slice(0, MIX_NEAREST_ARTISTS)).slice(0, MIX_SIMILAR_ARTISTS).map(other => meloir.data.artist(other.id))),
      ]);
      const picks = similar.map(other => shuffled(other.tracks).slice(0, MIX_SONGS_EACH));
      const others = picks.flatMap((_, round) => picks.map(songs => songs[round])).filter(Boolean);
      const own = weave(shuffled(artist.tracks), shuffled(albums.flatMap(album => album.tracks)));
      const seen = new Set();
      const tracks = weave(others.length ? own.slice(0, others.length + 1) : own, others).filter(track => {
        const key = fold(track.name) + '/' + fold(names(track));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { artist, tracks: spaced(tracks).slice(0, MIX_LENGTH) };
    },

    // Spotify's own radio for a song, spaced out like a mix. Without one, the artist's mix follows
    // the song instead.
    songRadio: async track => {
      try {
        const response = await meloir.spotifyFetch('https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/' + track.uri + '?response-format=json');
        if (!response.ok) throw new Error('Spotify answered ' + response.status);
        const { uri } = (await response.json()).mediaItems[0];
        const { tracks } = await meloir.data.playlist(idOf(uri));
        return { uri, tracks: spaced([track, ...tracks.filter(other => other.uri !== track.uri)]) };
      } catch (e) {
        const artist = (track.artists || []).find(other => other.uri);
        if (!artist) throw e;
        const mix = await meloir.data.artistMix(idOf(artist.uri));
        return { uri: mix.artist.uri, tracks: [track, ...mix.tracks.filter(other => other.uri !== track.uri)] };
      }
    },

    // Beats worth lighting up for, from Spotify's analysis of the song. A beat counts by how loud it
    // hits and how loud its section is, and a section that gets clearly louder starts with a drop.
    beats: async uri => {
      if (beatCache.has(uri)) return beatCache.get(uri);
      const response = await meloir.spotifyFetch('https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/' + idOf(uri) + '?format=json');
      if (!response.ok) throw new Error('Spotify answered ' + response.status);
      const { beats, sections, segments } = await response.json();
      const levels = sections.map(section => section.loudness);
      const quietest = Math.min(...levels), range = (Math.max(...levels) - quietest) || 1;
      const top = Math.max(...segments.map(segment => segment.loudness_max));
      const drops = sections.filter((section, i) => i && section.loudness - levels[i - 1] >= DROP_RISE_DB).map(section => section.start);
      let segment = 0, section = 0;
      const hits = beats.map(beat => {
        while (section + 1 < sections.length && sections[section + 1].start <= beat.start) section++;
        while (segment + 1 < segments.length && segments[segment + 1].start <= beat.start - BEAT_EARLY_SECONDS) segment++;
        let peak = -Infinity;
        for (let i = segment; i < segments.length && segments[i].start < beat.start + beat.duration / 2; i++) peak = Math.max(peak, segments[i].loudness_max);
        const strength = Math.max(0, 1 + (peak - top) / BEAT_RANGE_DB);
        const drop = drops.some(start => Math.abs(beat.start - start) <= beat.duration / 2);
        return { at: beat.start * 1000, drop, level: strength * strength * (.3 + .7 * (levels[section] - quietest) / range) };
      }).filter(hit => hit.drop || hit.level >= MIN_BEAT_LEVEL);
      beatCache.set(uri, hits);
      return hits;
    },

    timedLyrics: wordLyrics,

    // Liked Songs is a playlist whose id no simple call gives, so the page's own service reads it.
    likedPageSize: 100,
    liked: async offset => {
      const page = await meloir.services.library.getTracks({ limit: meloir.data.likedPageSize, offset });
      return (page.items || []).map(t => ({
        uri: t.uri, name: t.name, artists: t.artists || [],
        album: t.album ? { uri: t.album.uri, name: t.album.name, images: sources(t.album.images) } : null,
        duration_ms: t.duration && t.duration.milliseconds, added: addedTime(t.addedAt),
      }));
    },

    // Spotify's own picks for this account, from the Home feed its page loads at startup. Sections
    // with the same title are joined, and podcasts stay out.
    home: async () => {
      const answer = await Promise.race([meloir.homeAnswer, new Promise(resolve => setTimeout(resolve, HOME_WAIT_MS, null))]);
      if (!answer) return [];
      const shelves = new Map();
      for (const section of answer.data.home.sectionContainer.sections.items) {
        const data = section.data || {};
        const title = data.title && (data.title.transformedLabel || data.title.text);
        if (!title || !HOME_SECTIONS.includes(data.__typename)) continue;
        const items = shelves.get(title) || new Map();
        for (const entry of (section.sectionItems && section.sectionItems.items) || []) {
          const item = toLibraryItem({ ...entry.content, _uri: entry.uri });
          if (item && item.uri) items.set(item.uri, item);
        }
        shelves.set(title, items);
      }
      return [...shelves].map(([title, items]) => ({ title, items: [...items.values()] })).filter(shelf => shelf.items.length >= MIN_SHELF_ITEMS).slice(0, MAX_SHELVES);
    },

    // Spotify doesn't tell the desktop app an artist's genres. Wikidata answers for hundreds of artists
    // at once, and whoever it doesn't know goes to iTunes, one by one to stay inside Apple's limit.
    // Artists with the most songs go first, and each answer is remembered.
    genreOf: uri => meloir.prefs.genres[uri] || '',
    lookUpGenres: async (artists, progress) => {
      const songs = new Map();
      for (const artist of artists) if (artist.uri) songs.set(artist.uri, (songs.get(artist.uri) || 0) + 1);
      for (const artist of artists) if (artist.uri && !(artist.uri in meloir.prefs.genres)) genreQueue.set(artist.uri, artist.name);
      const sorted = [...genreQueue].sort((a, b) => (songs.get(b[0]) || 0) - (songs.get(a[0]) || 0));
      genreQueue.clear();
      sorted.forEach(([uri, name]) => genreQueue.set(uri, name));
      genreWatcher = progress;
      progress(genreQueue.size);
      if (genreRunning) return;
      genreRunning = true;
      await askWikidata();
      let unsaved = 0;
      while (genreQueue.size) {
        const [uri, name] = genreQueue.entries().next().value;
        try {
          const response = await fetch('https://itunes.apple.com/search?entity=musicArtist&attribute=artistTerm&limit=5&term=' + encodeURIComponent(name));
          if (!response.ok) throw new Error('iTunes answered ' + response.status);
          const { results } = await response.json();
          const match = results.find(result => fold(result.artistName) === fold(name));
          meloir.prefs.genres[uri] = match ? match.primaryGenreName || '' : '';
          genreQueue.delete(uri);
          unsaved++;
          if (unsaved >= GENRE_SAVE_EVERY || !genreQueue.size) {
            meloir.setPref('genres', meloir.prefs.genres);
            unsaved = 0;
          }
          genreWatcher(genreQueue.size);
          await new Promise(resolve => setTimeout(resolve, GENRE_PACE_MS));
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, GENRE_BACKOFF_MS));
        }
      }
      genreRunning = false;
    },

    // The playlists a song can go into, wherever they sit in folders.
    ownPlaylists: async () => {
      const flat = items => items.flatMap(item => (item.type === 'folder' ? flat(item.items || []) : [item]));
      return flat((await meloir.services.rootlist.getContents()).items).filter(item => item.type === 'playlist' && item.canAdd);
    },

    // The albums behind the liked songs, most liked first. Most liked songs are singles, so an
    // album needs more than one, unless that leaves almost nothing.
    likedAlbums: async () => {
      const albums = new Map();
      for (let offset = 0; ; offset += meloir.data.likedPageSize) {
        const page = await meloir.data.liked(offset);
        for (const track of page) {
          if (!track.album || !track.album.uri) continue;
          const album = albums.get(track.album.uri) || { ...track.album, type: 'album', id: idOf(track.album.uri), artists: track.artists.slice(0, 1), liked: 0 };
          album.liked++;
          albums.set(album.uri, album);
        }
        if (page.length < meloir.data.likedPageSize) break;
      }
      const all = [...albums.values()].sort((a, b) => b.liked - a.liked);
      const repeated = all.filter(album => album.liked > 1);
      return repeated.length >= MIN_LIKED_ALBUMS ? repeated : all.slice(0, MAX_SINGLE_ALBUMS);
    },
  };
})();
