# Contributing

Thanks for your interest in Transcription Looper! Bug reports, ideas and pull requests are welcome.

## Reporting bugs and ideas

Please use the [issue templates](https://github.com/hybridpicker/youtube-transcription-looper/issues/new/choose). For bugs, include your browser and version, the extension version (`chrome://extensions`) and the steps to reproduce. A link to a public video where it happens helps a lot.

## Development setup

There is no build step and no dependency to install.

1. Clone the repository.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the repository folder.
3. After a change, click the reload icon on the extension's card and reload open YouTube tabs.

The workstation can also be run without the extension: `python3 -m http.server 8791` in the repository folder, then open `http://localhost:8791/app/`. A synthetic test track is created with `python3 scripts/demo-audio.py demo.wav`.

## Guidelines

- Keep it dependency-free: plain JavaScript, HTML and CSS, no bundler.
- Everything stays local. Pull requests that add network requests, analytics or remote code will not be accepted.
- Code, comments and commit messages in English.
- **UI texts** live in `shared/i18n.js`. Add every new string to both the English (`en`) and the German (`de`) dictionary and reference it via `data-i18n*` attributes in HTML or `t("key")` in JavaScript. Translations into further languages are welcome as a new dictionary.
- Test both parts (YouTube panel and workstation) in English and German before opening a pull request.
- Keep pull requests focused on one change and describe what you tested.

## Releases

1. Bump `version` in `manifest.json` and add an entry to `CHANGELOG.md`.
2. Run `./scripts/package.sh` – it writes `dist/transcription-looper-<version>.zip`.
3. Tag the commit as `v<version>` and attach the ZIP to a GitHub release.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
