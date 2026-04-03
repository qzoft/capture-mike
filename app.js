// ==========================================
// Voice Recorder PWA — app.js
// ==========================================

(function () {
  "use strict";

  // --- DOM references ---
  const recordBtn = document.getElementById("record-btn");
  const recordStatus = document.getElementById("record-status");
  const recordTimer = document.getElementById("record-timer");
  const recordingsList = document.getElementById("recordings-list");
  const emptyMsg = document.getElementById("empty-msg");
  const transcriptPreview = document.getElementById("transcript-preview");
  const barSaveBtn = document.getElementById("bar-save-btn");
  const barDiscardBtn = document.getElementById("bar-discard-btn");
  const barStatus = document.getElementById("bar-status");

  // Settings DOM
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const settingsPatInput = document.getElementById("settings-pat");
  const settingsRepoInput = document.getElementById("settings-repo");
  const settingsLangSelect = document.getElementById("settings-lang");
  const settingsSaveBtn = document.getElementById("settings-save");
  const settingsTestBtn = document.getElementById("settings-test");
  const settingsCloseBtn = document.getElementById("settings-close");
  const settingsStatus = document.getElementById("settings-status");

  // --- State ---
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let timerInterval = null;
  let startTime = 0;
  let recognition = null;
  let transcript = "";
  let interimTranscript = "";
  let pendingTranscript = "";
  let pendingCreatedAt = "";
  let accumulatedDuration = 0;
  let segments = []; // { text, duration } per recording segment

  // --- MIME type detection (Safari prefers audio/mp4) ---
  function getSupportedMimeType() {
    const types = [
      "audio/mp4",
      "audio/aac",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ""; // let browser pick default
  }

  function getFileExtension(mimeType) {
    if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("ogg")) return "ogg";
    return "audio";
  }

  // --- Settings Management ---
  function getSettings() {
    return {
      pat: localStorage.getItem("github-pat") || "",
      repo: localStorage.getItem("github-repo") || "",
      lang: localStorage.getItem("speech-lang") || "da-DK",
    };
  }

  function saveSettings(pat, repo, lang) {
    localStorage.setItem("github-pat", pat);
    localStorage.setItem("github-repo", repo);
    localStorage.setItem("speech-lang", lang);
  }

  function isConfigured() {
    const s = getSettings();
    return s.pat.length > 0 && s.repo.length > 0;
  }

  function showSettingsModal() {
    const s = getSettings();
    settingsPatInput.value = s.pat;
    settingsRepoInput.value = s.repo;
    settingsLangSelect.value = s.lang;
    settingsStatus.classList.add("hidden");
    settingsModal.classList.remove("hidden");
  }

  function hideSettingsModal() {
    settingsModal.classList.add("hidden");
  }

  settingsBtn.addEventListener("click", showSettingsModal);
  settingsCloseBtn.addEventListener("click", hideSettingsModal);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) hideSettingsModal();
  });

  settingsSaveBtn.addEventListener("click", () => {
    const pat = settingsPatInput.value.trim();
    const repo = settingsRepoInput.value.trim();
    if (!pat || !repo) {
      settingsStatus.textContent = "Both fields are required.";
      settingsStatus.className = "error";
      settingsStatus.classList.remove("hidden");
      return;
    }
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      settingsStatus.textContent = "Repo must be in owner/repo format.";
      settingsStatus.className = "error";
      settingsStatus.classList.remove("hidden");
      return;
    }
    const lang = settingsLangSelect.value;
    saveSettings(pat, repo, lang);
    settingsStatus.textContent = "Settings saved!";
    settingsStatus.className = "success";
    settingsStatus.classList.remove("hidden");
    removeConfigWarning();
    setTimeout(hideSettingsModal, 800);
  });

  settingsTestBtn.addEventListener("click", async () => {
    const pat = settingsPatInput.value.trim();
    const repo = settingsRepoInput.value.trim();
    if (!pat || !repo) {
      settingsStatus.textContent = "Fill in PAT and repo first.";
      settingsStatus.className = "error";
      settingsStatus.classList.remove("hidden");
      return;
    }
    settingsStatus.textContent = "Testing…";
    settingsStatus.className = "";
    settingsStatus.classList.remove("hidden");
    try {
      const [owner, name] = repo.split("/");
      const resp = await fetch(
        "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(name),
        {
          headers: {
            "Authorization": "token " + pat,
            "Accept": "application/vnd.github.v3+json",
          },
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        settingsStatus.textContent = "✓ Connected to " + data.full_name;
        settingsStatus.className = "success";
      } else if (resp.status === 401) {
        settingsStatus.textContent = "✗ Invalid token (401).";
        settingsStatus.className = "error";
      } else if (resp.status === 404) {
        settingsStatus.textContent = "✗ Repo not found (404). Check owner/repo.";
        settingsStatus.className = "error";
      } else {
        settingsStatus.textContent = "✗ GitHub API error (" + resp.status + ").";
        settingsStatus.className = "error";
      }
    } catch (err) {
      settingsStatus.textContent = "✗ Network error: " + err.message;
      settingsStatus.className = "error";
    }
  });

  function showConfigWarning() {
    if (document.getElementById("config-warning")) return;
    const warning = document.createElement("div");
    warning.id = "config-warning";
    warning.textContent = "⚙️ Configure GitHub settings to auto-save transcriptions.";
    warning.addEventListener("click", showSettingsModal);
    warning.style.cursor = "pointer";
    document.querySelector("main").prepend(warning);
  }

  function removeConfigWarning() {
    const el = document.getElementById("config-warning");
    if (el) el.remove();
  }

  // --- Speech Recognition ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startTranscription() {
    if (!SpeechRecognition) return;
    transcript = "";
    interimTranscript = "";
    transcriptPreview.textContent = "";
    transcriptPreview.classList.remove("hidden");

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSettings().lang;

    // Show active language
    const activeLangEl = document.getElementById("active-lang");
    if (activeLangEl) activeLangEl.textContent = "🌐 " + recognition.lang;

    recognition.onresult = (e) => {
      interimTranscript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          transcript += e.results[i][0].transcript + " ";
        } else {
          interimTranscript += e.results[i][0].transcript;
        }
      }
      transcriptPreview.textContent = transcript + interimTranscript || "Listening…";
    };

    recognition.onend = () => {
      // Safari stops after silence — restart if still recording
      if (isRecording && recognition) {
        try { recognition.start(); } catch (_) { /* already started */ }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      console.error("Speech recognition error:", e.error);
    };

    try { recognition.start(); } catch (_) { /* already started */ }
  }

  function stopTranscription() {
    if (recognition) {
      try { recognition.stop(); } catch (_) { /* not started */ }
      recognition = null;
    }
    transcriptPreview.classList.add("hidden");
    // Fold any remaining interim results into final transcript
    if (interimTranscript) {
      transcript += interimTranscript;
      interimTranscript = "";
    }
    return transcript.trim();
  }

  // --- GitHub Save ---
  async function saveToGitHub(text, createdAt) {
    const { pat, repo } = getSettings();
    if (!pat || !repo || !text) return null;

    const date = new Date(createdAt);
    const pad = (n) => String(n).padStart(2, "0");
    const filename = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" +
      pad(date.getDate()) + "_" + pad(date.getHours()) + "-" +
      pad(date.getMinutes()) + "-" + pad(date.getSeconds()) + ".md";

    const dateStr = date.toLocaleString();
    const markdown = "# Voice Memo - " + dateStr + "\n\n" + text + "\n";
    const content = btoa(unescape(encodeURIComponent(markdown)));

    const url = "https://api.github.com/repos/" + encodeURIComponent(repo.split("/")[0]) +
      "/" + encodeURIComponent(repo.split("/")[1]) +
      "/contents/recordings/" + encodeURIComponent(filename);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": "token " + pat,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: "Add voice memo " + filename,
        content: content,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "GitHub API error " + response.status);
    }

    return await response.json();
  }

  // --- Timer ---
  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + String(sec).padStart(2, "0");
  }

  function startTimer() {
    startTime = Date.now();
    recordTimer.textContent = "0:00";
    recordTimer.classList.remove("hidden");
    timerInterval = setInterval(() => {
      recordTimer.textContent = formatTime(Date.now() - startTime);
    }, 200);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    recordTimer.classList.add("hidden");
  }

  // --- Recording ---
  async function startRecording() {
    if (isRecording) return;

    if (!isConfigured()) {
      showSettingsModal();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};

      mediaRecorder = new MediaRecorder(stream, options);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the mic
        stream.getTracks().forEach((t) => t.stop());

        const finalTranscript = stopTranscription();
        const segmentDuration = Date.now() - startTime;

        // No transcript captured this segment
        if (!finalTranscript) {
          // Re-enable buttons if we already have pending transcript from earlier segments
          if (pendingTranscript) {
            barSaveBtn.disabled = false;
            barDiscardBtn.disabled = false;
          }
          return;
        }

        if (pendingTranscript) {
          // Continuing: append new segment
          segments.push({ text: finalTranscript, duration: segmentDuration });
          pendingTranscript = pendingTranscript.trim() + " " + finalTranscript;
          accumulatedDuration += segmentDuration;
          updatePendingCard(pendingTranscript, accumulatedDuration);
        } else {
          // New recording
          const createdAt = new Date().toISOString();
          pendingCreatedAt = createdAt;
          segments = [{ text: finalTranscript, duration: segmentDuration }];
          pendingTranscript = finalTranscript;
          accumulatedDuration = segmentDuration;
          addRecordingCard({ createdAt, duration: segmentDuration }, finalTranscript);
        }

        // Enable Save/Discard buttons
        barSaveBtn.disabled = false;
        barDiscardBtn.disabled = false;
        barStatus.textContent = "";
        barStatus.className = "";
        updateRecordBtnState();
      };

      mediaRecorder.start(100); // collect data every 100ms
      isRecording = true;
      recordBtn.classList.add("recording");
      if (recordStatus) recordStatus.textContent = "Recording…";
      // Disable save/discard while actively recording
      barSaveBtn.disabled = true;
      barDiscardBtn.disabled = true;
      startTimer();
      startTranscription();
    } catch (err) {
      showPermissionError(err);
    }
  }

  function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;
    mediaRecorder.stop();
    recordBtn.classList.remove("recording");
    if (recordStatus) recordStatus.textContent = "Hold to record";
    stopTimer();
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function showPermissionError(err) {
    console.error("Microphone error:", err);
    let existing = document.getElementById("permission-error");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "permission-error";
      document.querySelector("main").prepend(existing);
    }
    if (err.name === "NotAllowedError") {
      existing.textContent = "Microphone access denied. Please allow microphone in your browser settings and reload.";
    } else {
      existing.textContent = "Could not access microphone: " + err.message;
    }
  }

  // --- UI: Recording Cards ---
  function addRecordingCard(record, transcriptText) {
    emptyMsg.classList.add("hidden");

    const card = document.createElement("div");
    card.className = "recording-card";
    card.dataset.id = record.id;

    const date = new Date(record.createdAt);
    const dateStr =
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " +
      date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const durStr = formatTime(record.duration);

    // Header
    const header = document.createElement("div");
    header.className = "card-header";
    header.innerHTML =
      '<span class="card-title">Recording</span>' +
      '<span class="card-meta">' + dateStr + " · " + durStr + "</span>";

    card.appendChild(header);

    // Transcript text
    if (transcriptText) {
      const transcriptEl = document.createElement("textarea");
      transcriptEl.className = "card-transcript card-transcript--editable";
      transcriptEl.setAttribute("aria-label", "Edit transcript");
      transcriptEl.value = transcriptText;
      transcriptEl.addEventListener("input", () => {
        pendingTranscript = transcriptEl.value;
      });
      card.appendChild(transcriptEl);
    } else {
      const noTranscript = document.createElement("p");
      noTranscript.className = "card-transcript card-transcript--empty";
      noTranscript.textContent = "No transcript captured.";
      card.appendChild(noTranscript);
    }

    // Save status (shown per card after save)
    const saveStatusEl = document.createElement("p");
    saveStatusEl.className = "card-save-status";
    card.appendChild(saveStatusEl);

    // Insert at top of list
    recordingsList.prepend(card);
    return card;
  }

  function updatePendingCard(transcriptText, duration) {
    const card = recordingsList.querySelector(".recording-card");
    if (!card) return;

    // Update transcript
    const transcriptEl = card.querySelector(".card-transcript");
    if (transcriptEl) {
      transcriptEl.value = transcriptText;
      transcriptEl.classList.remove("card-transcript--empty");
    }

    // Update duration in meta
    const metaEl = card.querySelector(".card-meta");
    if (metaEl) {
      const date = new Date(pendingCreatedAt);
      const dateStr =
        date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      metaEl.textContent = dateStr + " · " + formatTime(duration);
    }
  }

  // --- Bottom bar Save/Discard handlers ---
  function updateRecordBtnState() {
    if (pendingTranscript) {
      recordBtn.textContent = "Continue";
      recordBtn.classList.add("continue-mode");
    } else {
      recordBtn.textContent = "Record";
      recordBtn.classList.remove("continue-mode");
    }
    // Undo when multiple segments, Discard when one or zero
    barDiscardBtn.textContent = segments.length > 1 ? "Undo" : "Discard";
  }

  function disableBarButtons() {
    barSaveBtn.disabled = true;
    barDiscardBtn.disabled = true;
    pendingTranscript = "";
    pendingCreatedAt = "";
    accumulatedDuration = 0;
    segments = [];
    updateRecordBtnState();
  }

  function removeLastCard() {
    const card = recordingsList.querySelector(".recording-card");
    if (card) card.remove();
    if (!recordingsList.querySelector(".recording-card")) {
      emptyMsg.classList.remove("hidden");
    }
  }

  barSaveBtn.addEventListener("click", async () => {
    if (!pendingTranscript) return;
    barSaveBtn.disabled = true;
    barDiscardBtn.disabled = true;
    barStatus.textContent = "Saving…";
    barStatus.className = "bar-status-saving";
    try {
      await saveToGitHub(pendingTranscript, pendingCreatedAt);
      barStatus.textContent = "✓ Saved";
      barStatus.className = "bar-status-success";
      removeLastCard();
      disableBarButtons();
    } catch (err) {
      console.error("GitHub save error:", err);
      barStatus.textContent = "✗ " + err.message;
      barStatus.className = "bar-status-error";
      barSaveBtn.disabled = false;
      barDiscardBtn.disabled = false;
    }
  });

  barDiscardBtn.addEventListener("click", () => {
    if (segments.length <= 1) {
      // Last segment or empty — discard everything
      removeLastCard();
      disableBarButtons();
      barStatus.textContent = "";
    } else {
      // Undo last segment
      segments.pop();
      pendingTranscript = segments.map((s) => s.text).join(" ");
      accumulatedDuration = segments.reduce((sum, s) => sum + s.duration, 0);
      updatePendingCard(pendingTranscript, accumulatedDuration);
      updateRecordBtnState();
      barStatus.textContent = "";
    }
  });

  // --- Event Listeners (hold-to-record) ---
  recordBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startRecording();
  });

  recordBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    stopRecording();
  });

  recordBtn.addEventListener("pointerleave", (e) => {
    e.preventDefault();
    stopRecording();
  });

  recordBtn.addEventListener("pointercancel", (e) => {
    e.preventDefault();
    stopRecording();
  });

  // Prevent context menu on long press (iOS Safari)
  recordBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  // Prevent text selection and callout on long press
  document.addEventListener("touchstart", () => {}, { passive: true });

  // --- Init ---
  function init() {
    // Clean up any leftover IndexedDB data
    try { indexedDB.deleteDatabase("VoiceRecorderDB"); } catch (_) {}

    if (!isConfigured()) showConfigWarning();
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
    }

    // Auto-record when launched with ?action=record (e.g. from iPhone Action Button shortcut)
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "record") {
      history.replaceState(null, "", window.location.pathname);
      toggleRecording();
    }
  }

  init();
})();
