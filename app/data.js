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

  const LYRICS_TIMEOUT_MS = 6000, SAME_SONG_MS = 4000;

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
  const foldTitle = text => fold(String(text || '').split(' - ')[0].replace(/\s*[([][^)\]]*[)\]]/g, ''));
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

  // Each word's own start and length. A word split into syllables has `part` set on its pieces.
  const toTimedLine = line => {
    const pieces = (line.syllabus || []).filter(piece => !piece.isBackground && piece.text);
    // Many songs have no word timing, but still the line's real length.
    if (!pieces.length) {
      return line.text && line.text.trim() ? { start: Number(line.time), end: Number(line.time) + Number(line.duration), text: line.text } : null;
    }
    return {
      start: Number(line.time),
      text: pieces.map(piece => piece.text).join(''),
      words: pieces.map(piece => ({
        at: Number(piece.time),
        end: Number(piece.time) + Number(piece.duration),
        text: piece.part || /\s$/.test(piece.text) ? piece.text : piece.text + ' ',
      })),
    };
  };

  // Answers are kept, so a song is only asked for once. The service limits how fast it is asked.
  const LYRICS_CACHE = 'meloir.lyrics3.', LYRICS_CACHE_INDEX = 'meloir.lyrics3.index', LYRICS_CACHE_SIZE = 200, RATE_LIMIT_WAIT_MS = 120000;

  // Earlier versions kept answers from fewer sources.
  try {
    Object.keys(localStorage).filter(key => /^meloir\.lyrics2?\./.test(key)).forEach(key => localStorage.removeItem(key));
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

  const fromLyricsPlus = async ({ title, artist, durationMs }) => {
    const query = 'title=' + encodeURIComponent(title) + '&artist=' + encodeURIComponent(artist)
      + (durationMs ? '&duration=' + Math.round(durationMs / 1000) : '');
    const response = await ask('https://lyricsplus.binimum.org/v2/lyrics/get?' + query);
    if (!response.ok) return null;
    const answer = await response.json();
    if (answer.metadata && answer.metadata.title && !sameTitle(answer.metadata.title, title)) return null;
    return (answer.lyrics || []).map(toTimedLine).filter(Boolean);
  };

  // TTML times: "11.859", "1:02.345" or "00:01:02.345".
  const clock = value => String(value || '').replace(/s$/, '').split(':').reduce((total, part) => total * 60 + Number(part), 0) * 1000;

  // A <p> per line and a timed <span> per word. The text between two spans is the space after a
  // word. Spans with a role are backing vocals or translations.
  const ttmlLine = p => {
    const words = [];
    for (const node of p.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (words.length) words[words.length - 1].text += node.textContent;
      } else if (node.nodeName === 'span' && node.getAttribute('begin') && !node.getAttribute('ttm:role')) {
        words.push({ at: clock(node.getAttribute('begin')), end: clock(node.getAttribute('end')), text: node.textContent });
      }
    }
    const start = clock(p.getAttribute('begin'));
    if (words.length) return { start, text: words.map(word => word.text).join('').trim(), words };
    const text = p.textContent.trim();
    return text ? { start, end: clock(p.getAttribute('end')), text } : null;
  };

  const fromLrcRed = async ({ title, artist, durationMs }) => {
    const search = await ask('https://lrc.red/search.json?q=' + encodeURIComponent(title + ' ' + artist));
    if (!search.ok) return null;
    const hit = ((await search.json()).hits || []).find(candidate => sameTitle(candidate.title, title) && sameArtist(candidate.artist, artist)
      && (!durationMs || !candidate.duration || Math.abs(candidate.duration * 1000 - durationMs) <= SAME_SONG_MS));
    if (!hit || !hit.isrc) return null;
    const file = await ask('https://lrc.red/s/' + encodeURIComponent(hit.isrc) + '.ttml');
    if (!file.ok) return null;
    const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
    return [...xml.getElementsByTagName('p')].map(ttmlLine).filter(Boolean);
  };

  const SOURCES = [{ name: 'LyricsPlus', get: fromLyricsPlus, askAgainAt: 0 }, { name: 'lrc.red', get: fromLrcRed, askAgainAt: 0 }];

  // Many answers are labelled as word timed but have every time at 0: text with no timing.
  const hasTiming = lines => !!lines && lines.length > 0
    && lines.filter(line => (line.words && line.words.some(word => word.end > 0)) || line.end > line.start).length >= lines.length / 2;

  // The first source with word timing wins, then the best with line lengths. A song is only
  // remembered as having nothing when every source really answered.
  const wordLyrics = async (uri, song) => {
    const known = cached(uri);
    if (known) return known.none ? null : known;
    let best = null, unsure = false;
    for (const source of SOURCES) {
      if (Date.now() < source.askAgainAt) { unsure = true; continue; }
      try {
        const lines = await source.get(song);
        if (!hasTiming(lines)) continue;
        const lyrics = { synced: true, wordTimed: lines.some(line => line.words), source: source.name, lines };
        if (lyrics.wordTimed) { best = lyrics; break; }
        best = best || lyrics;
      } catch (e) {
        unsure = true;
        if (e instanceof RateLimited) source.askAgainAt = Date.now() + RATE_LIMIT_WAIT_MS;
      }
    }
    if (best) remember(uri, best);
    else if (!unsure) remember(uri, { none: true });
    return best;
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
        tracks: p.content.items.filter(i => known(unwrap(i.itemV2))).map(i => ({ ...toTrack(unwrap(i.itemV2)), uid: i.uid })),
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

    // Spotify's own lyrics, timed per line.
    lyrics: async (uri, coverUrl) => {
      if (!coverUrl) return null;
      const url = 'https://spclient.wg.spotify.com/color-lyrics/v2/track/' + idOf(uri) + '/image/' + encodeURIComponent(coverUrl)
        + '?format=json&vocalRemoval=false&market=from_token';
      const response = await meloir.spotifyFetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Spotify answered ' + response.status);
      const { lyrics } = await response.json();
      if (!lyrics || !lyrics.lines || !lyrics.lines.length) return null;
      return {
        synced: lyrics.syncType !== 'UNSYNCED',
        lines: lyrics.lines.filter(line => line.words && line.words.trim())
          .map(line => ({ start: Number(line.startTimeMs), text: line.words })),
      };
    },

    // Liked Songs is a playlist whose id no simple call gives, so the page's own service reads it.
    likedPageSize: 100,
    liked: async offset => {
      const page = await meloir.services.library.getTracks({ limit: meloir.data.likedPageSize, offset });
      return (page.items || []).map(t => ({
        uri: t.uri, name: t.name, artists: t.artists || [],
        album: t.album ? { uri: t.album.uri, name: t.album.name, images: sources(t.album.images) } : null,
        duration_ms: t.duration && t.duration.milliseconds,
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
