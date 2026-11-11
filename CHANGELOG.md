# Changelog

What changed in each version of Meloir, newest first.

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
