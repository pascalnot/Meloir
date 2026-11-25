# Changelog

What changed in each version of Meloir, newest first.

## 1.5.1

*25 November 2026*

### New

- **Backing vocals.** In focus mode, backing vocals show in a smaller row under the line they go with and light up word by word on their own timing. When they run on into the next line, only they stay lit.
- **Duets.** When a song has two singers, the second one's lines are on the right, so you can see who sings what. Lines sung together stay on the left.

### Fixed

- Focus mode now fills the whole screen, without the thin window border and rounded corners Windows 11 draws around it.
- Lyrics show up faster: all lyrics services are asked at once instead of one after another, so a slow one no longer holds up the rest.
- Skipping quickly through songs no longer flashes each song's lyrics for a moment.
- More songs get word-by-word lyrics. lrc.red found nothing for titles with "feat." in them, turned down songs whose length its search lists a few seconds off, and a song stayed without word timing for good when a lyrics service was slow to answer once.

## 1.5.0

*18 November 2026*

### New

- **Back and forward.** Arrows next to the menu in the title bar, Alt+Left and Alt+Right, or the mouse's side buttons. Each page comes back where you had scrolled to.
- **Startup settings.** A new Settings section for how Meloir opens: start with Windows, optionally hidden in the tray, play right away, or open in focus mode.
- **Pinned playlists.** Right-click a playlist in the sidebar to keep it at the top.
- **Sort songs.** Playlists and Liked Songs sort by title, artist, album, length or when songs were added. Play follows the order shown.
- **Ad breaks blocked.** Settings → Ads counts every ad break Meloir stopped, for good instead of per session.

### Changed

- Lyrics no longer come from Spotify (Musixmatch). Only LyricsPlus, lrc.red and LRCLIB are asked, so a song none of them has shows no lyrics.

### Fixed

- Closing Meloir puts it in a tray icon of its own, which opens it again with a click. Spotify's icon didn't. Right-click the icon or use File → Quit to end it, and starting Meloir again while it's in the tray shows it.
- When the next line starts before the last one is sung to the end, both stay lit instead of the first one being skipped.
- Words from LRCLIB no longer light up slowly across a pause.

## 1.4.0

*11 November 2026*

### New

- **What's new.** The first time Meloir opens after an update, it shows what changed.
- **Stats over time.** Switch Stats between the last 7 days, the last 30 days and all time.

### Fixed

- Uninstalling now also removes the settings backup and the error log.

## 1.3.0

*11 November 2026*

### New

- **Cover backdrop.** A soft, blurred copy of the current cover behind the whole app, with a strength slider. Off by default, in Settings → Appearance.
- **Copy link.** The song menu copies the song's Spotify link.
- **Song menu on the player bar.** Right-click the cover in the bottom left.
- **Remove from this playlist.** In playlists you can edit.
- **More word-by-word lyrics.** LRCLIB joins LyricsPlus and lrc.red.

### Changed

- Removed songs fade out of Liked Songs and playlists straight away.
- Lyrics in focus mode light up word by word with a soft edge and a gentle glow, and move from line to line more slowly.
- Song covers in every list line up with the headings, with the track numbers just to their left.
- Stats rises in and reveals on scroll like the other pages. The artist bars fill as they come into view, are thinner and all the same thickness.
- Stats shows listening time in days past 24 hours.

### Fixed

- Settings, history and Stats are saved safely with a backup, and a settings file that can't be read is never overwritten. Problems are written to `errors.log`.
- The lyrics no longer jump while a word is sung.

## 1.2.0

*7 November 2026*

### New

- **Discord status.** Shows the song you're playing on your Discord profile, with the artist in the member list. You can turn it on in Settings, and the GitHub button is optional.
- **Recommendations on Home.** Up to eight rows of Spotify's own picks for your account.
- **Artist links.** Click an artist's name in song lists, the player bar, the queue, focus mode or album pages.
