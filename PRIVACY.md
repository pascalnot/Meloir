# Privacy

*Last updated: 11 November 2026*

Meloir has no server, no account of its own and no analytics. Nothing about you is sent to the people
who make Meloir. Everything below happens on your PC, or between your PC and the services named here.

## What stays on your PC

These are kept in `%LOCALAPPDATA%\Meloir`:

- **Settings:** your choices in Settings, such as the theme or the equalizer, in `prefs.json`, with a backup copy next to it.
- **History:** the last 30 songs you played and your recent searches.
- **Stats:** how long you listened, and your most played songs and artists, in total and per day for up to 400 days.
- **Last version seen:** so Meloir knows when to show what's new after an update.
- **Genres:** the genre found for each artist, so it is only looked up once.
- **Error log:** a short record of problems with saving settings, in `errors.log`.
- **Updates:** a downloaded update, in the `update` folder, until it is installed.

Song lyrics that were found are also kept, for up to 200 songs, inside Spotify's own storage on your PC.

**To delete them:** in Settings, **Clear** removes your history, searches, Stats and genres. Uninstalling Meloir removes
everything in the Meloir folder.

## What goes to other services

Meloir only contacts these services, and only for the reasons given. Each one also sees your IP address,
as with any website. Their own privacy policies apply.

| Service | What it receives | When |
|---|---|---|
| **Spotify** | What the Spotify app always sends, as you, signed in | While Meloir runs, since Spotify does the playing |
| **[LyricsPlus](https://lyricsplus.binimum.org), [lrc.red](https://lrc.red), [LRCLIB](https://lrclib.net)** | The song's title, artist and length | When lyrics are shown for a song not looked up before |
| **[Wikidata](https://www.wikidata.org)** | Spotify artist ids and artist names | When you open the genre menu |
| **[Apple iTunes](https://www.apple.com/itunes/)** | Artist names Wikidata doesn't know | When you open the genre menu |
| **[GitHub](https://github.com)** | A request for the latest release | When Meloir starts, and when you check for updates |
| **[Discord](https://discord.com)** | The song, artist, album, cover link, time and, if you choose, a link to Meloir on GitHub | Only with the Discord status turned on in Settings |

The Discord status is shown on your Discord profile, so other people on Discord can see what you are
playing. It is off unless you turn it on, and it clears when you turn it off, pause or close Meloir.

## Your Spotify account

You sign in with Spotify's own app, on Spotify's own page. Meloir never sees your password. It uses the
session the Spotify app already has, only on your PC.

Meloir blocks ads, which goes against Spotify's Terms of Use, and Spotify may suspend accounts that do
it. Use it at your own risk.

## Children

Meloir does not collect information from anyone, including children.

## Changes

If this policy changes, the new version is published here with a new date.

## Contact

Questions about privacy can be asked in [the project's issues on GitHub](https://github.com/pascalnot/Meloir/issues).
