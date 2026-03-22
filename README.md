# Capture Mike

Voice-to-text PWA that captures audio, transcribes it, and saves the output as markdown files to a GitHub repo.

## Features

- **Hold-to-record** microphone capture
- **Real-time transcription** using the Web Speech API
- **Multi-language support** — Danish, English (US/UK), German, Swedish, Norwegian, French, Spanish
- **Save to GitHub** — transcriptions saved as markdown files to your repo
- **Save/Discard workflow** — review before committing
- **iPhone Action Button** — launch and start recording via `?action=record` URL param
- **Auto-update** — checks `version.txt` on load and force-reloads when a new version is deployed
- **Test Connection** — verify your GitHub PAT and repo before recording

## Tech Stack

- Vanilla HTML, CSS, JavaScript — no frameworks, no build tools
- Progressive Web App (manifest.json, installable)
- Web Speech API, MediaRecorder API, GitHub REST API

## Setup

1. Open App at `https://qzoft.github.io/capture-mike/index.html`
2. Tap the **⚙️ Settings** gear (top-right) and enter:
   - **GitHub PAT** — generate at [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope
   - **Target repo** — in `owner/repo` format (e.g. `username/my-notes`)
   - **Speech language** — pick your preferred language
3. Tap **Test Connection** to verify access
4. Hold the **Record** button to capture audio and transcribe
5. **Save** to push the transcript to `recordings/YYYY-MM-DD_HH-MM-SS.md` in your repo, or **Discard** to throw it away
