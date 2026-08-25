# Capture Mike

> If a project has no next action, it is stalled.

---

**Area:** Open
**Role:** Owner
**Owner:** Thomas <!-- auto -->
**Status:** Parked
**Storage:** PATH_LOCAL
**Intake:**  <!-- auto -->
**Tags:** open

---

## Outcome

_A working PWA voice recorder that can be installed on phone home screens, record voice memos with hold-to-record, store them locally (IndexedDB), and play/download/delete them — fully offline-capable._

---

## Current Focus

_The core app is built. Evaluate whether it meets daily-use needs and decide on next iteration._

---

## Next Actions

- [ ] `[15]` Consider adding recording labels or timestamps for easier retrieval


---

## Resolved

- **Duplicate capture button bug fixed (2026-04-03):** Fixed bug where duplicating the capture button enabled continuous recording mode.
- **Sharing/export path decided (2026-03-29):** Download works; no need for cloud sync or send-to-inbox identified.
- **Pause/resume behavior added (2026-03-29):** App pauses on button release, resumes on re-press; save ends pause mode; delete/discard ends recording.
- **iOS Safari tested:** Install-to-home-screen and offline playback verified

---

## Open Questions

- Is local-only storage sufficient, or does the app need a sync/backup mechanism?
- Should recordings feed into the personal OS inbox (e.g., voice-to-text capture)?

---

## Constraints

_What limits this project? Be honest._

- **Time:** Side project — minimal maintenance expected once stable
- **Money:** Zero — pure client-side PWA, no backend
- **Energy:** Small codebase (HTML/CSS/JS, ~6 files), low overhead
