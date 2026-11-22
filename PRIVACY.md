# Privacy policy

Transcription Looper processes everything on your device. It has no server, no account, no analytics and no tracking.

## What the extension does with data

- **Audio:** The sound of the YouTube video you are watching, or the audio file you open in the workstation, is processed locally in your browser (tempo, pitch, filters, note display). It is never recorded, uploaded or sent anywhere.
- **Settings you make:** Loop points, tempo, pitch, bar grid, markers, saved loops, notes and interface preferences (such as the language) are stored locally in your browser:
  - for YouTube videos in the extension's storage (`chrome.storage.local`), keyed by the video ID;
  - for audio files in the workstation's local storage, keyed by file name and size. The last opened file is kept in the browser's IndexedDB so it can be reopened on the next start.
- **No network requests:** The extension does not make network requests of its own. YouTube itself, of course, works as usual.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Remember loops, settings and saved places per video. |
| `activeTab`, `scripting` | Show the panel in the YouTube tab when you click the extension icon (also in tabs that were open before the extension was installed). |
| Access to `https://www.youtube.com/*` | Run the panel on YouTube pages and route the video's sound through the local audio processing. |

## Deleting your data

Remove the extension in `chrome://extensions`; Chrome deletes its storage with it. In the workstation, the data of the local web server variant can be deleted via your browser's site data settings.

## Contact

Questions about privacy: please open an issue in the [GitHub repository](https://github.com/hybridpicker/youtube-transcription-looper/issues).

Last updated: 2026-11-22
