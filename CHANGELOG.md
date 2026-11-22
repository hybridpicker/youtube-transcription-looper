# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [2.2.0] – 2026-11-22

First public release.

### Added

- English user interface. English is the default; German is included as a translation. The language follows the browser and can be switched with the `EN` / `DE` button in the YouTube panel and the workstation.
- Extension name and description in English and German (`_locales/`).
- Release ZIP built by `scripts/package.sh`.
- Synthetic demo track generator (`scripts/demo-audio.py`) for testing and screenshots.
- README in English and German, screenshots, license (MIT), privacy policy, contribution guide and issue templates.

### Changed

- The extension is now called "Transcription Looper" in English ("Transkriptions-Looper" in German).
- Note names follow the language (B in English, H in German) until you pick one with the `B` / `H` button.

### Removed

- The first version of the extension (`legacy-v1/`). It remains in the Git history.

## [2.1.1] – 2026-11-20

### Added

- Extension logo.

## [2.1.0] – 2026-11-19

### Added

- Transcription panel for YouTube and the workstation for audio files.
- Bar grid in the YouTube panel with tap tempo, bar numbers and snapping.

[2.2.0]: https://github.com/hybridpicker/youtube-transcription-looper/releases/tag/v2.2.0
