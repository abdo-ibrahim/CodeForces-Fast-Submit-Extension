/**
 * CF Fast Submit - Content Script
 * Author: Abdulrahman Ibrahim
 * © 2026
 *
 * Injects a submission form directly into Codeforces problem pages
 * for faster code submission without navigating to the submit page.
 */

(function () {
  "use strict";

  const SCRIPT_NAME = "CF Fast Submit";
  const VERSION = "1.0.0";

  // Configuration
  const config = {
    regenerateInterval: 30, // minutes
    retryInterval: 1000, // ms
    retryTimes: 20,
  };

  // State
  let state = {
    type: null,
    submitURL: null,
    problemId: null,
    contestId: null,
    participantId: null,
    groupId: null,
    editor: null,
    $form: null,
    doRegenerateOnSubmit: false,
    settings: {},
  };

  // URL patterns
  const patterns = {
    contest: /(contest|gym)\/([^/]+)\/problem\/([^/]*)\/?$/,
    problemset: /problemset\/problem\/([^/]+)\/([^/]*)\/?$/,
    group: /group\/([^/]+)\/contest\/([^/]+)\/problem\/([^/]*)\/?$/,
  };

  // Language extension mapping
  const extensionMap = {
    3: "program.dpr",
    4: "program.pas",
    6: "program.php",
    7: "program.py",
    9: "program.cs",
    12: "program.hs",
    13: "program.pl",
    19: "program.ml",
    20: "program.scala",
    28: "program.d",
    31: "program.py",
    32: "program.go",
    34: "program.js",
    36: "program.java",
    40: "program.py",
    41: "program.py",
    43: "program.c",
    48: "program.kt",
    49: "program.rs",
    50: "program.cpp",
    51: "program.pas",
    52: "program.cpp",
    54: "program.cpp",
    55: "program.js",
    59: "program.cpp",
    60: "program.java",
    61: "program.cpp",
    65: "program.cs",
    67: "program.rb",
    70: "program.py",
    73: "program.cpp",
    74: "program.java",
    75: "program.rs",
    77: "program.kt",
    79: "program.cs",
    80: "program.c",
    83: "program.kt",
    87: "program.java",
    88: "program.kt",
    89: "program.cpp",
    90: "program.cpp",
    91: "program.cpp",
  };

  // Initialize
  init();

  async function init() {
    // Check if logged in
    if (!isLoggedIn()) {
      console.log(`[${SCRIPT_NAME}] User not logged in.`);
      return;
    }

    // Parse URL and determine page type
    if (!parseURL()) {
      console.log(`[${SCRIPT_NAME}] Not a valid problem page.`);
      return;
    }

    // Load settings
    await loadSettings();

    // Initialize the form
    await tryToInit();
  }

  function isLoggedIn() {
    const logoutLinks = document.querySelectorAll("a");
    for (const link of logoutLinks) {
      if (link.textContent === "Logout" || link.textContent === "Выйти") {
        return true;
      }
    }
    return false;
  }

  function parseURL() {
    const pathname = location.pathname;
    const origin = location.origin;

    // Check problemset
    if (pathname.match(/^\/problemset\//)) {
      const match = pathname.match(patterns.problemset);
      if (!match) return false;

      state.type = "problemset";
      state.contestId = match[1];
      state.problemId = match[2];
      // Handle "0" as "A" for problemset
      if (state.problemId === "0") {
        state.problemId = "A";
      }
      state.submitURL = origin + "/problemset/submit";
      return true;
    }

    // Check group
    if (pathname.match(/^\/group\//)) {
      const match = pathname.match(patterns.group);
      if (!match) return false;

      state.type = "group";
      state.groupId = match[1];
      state.contestId = match[2];
      state.problemId = match[3];
      // Handle "0" as "A"
      if (state.problemId === "0") {
        state.problemId = "A";
      }
      state.submitURL = `${origin}/group/${state.groupId}/contest/${state.contestId}/submit`;
      return true;
    }

    // Check contest/gym
    const match = pathname.match(patterns.contest);
    if (!match) return false;

    state.type = match[1];
    state.contestId = match[2];
    state.problemId = match[3];
    // Handle "0" as "A"
    if (state.problemId === "0") {
      state.problemId = "A";
    }
    state.submitURL = origin + "/" + state.type + "/" + state.contestId + "/submit";
    return true;
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.sync.get(
          {
            defaultLanguage: "54",
          },
          (settings) => {
            state.settings = settings;
            resolve();
          },
        );
      } else {
        state.settings = {
          defaultLanguage: "54",
        };
        resolve();
      }
    });
  }

  async function tryToInit() {
    for (let i = 0; i < config.retryTimes; i++) {
      try {
        if (await initForm()) {
          console.log(`[${SCRIPT_NAME}] Successfully initialized.`);
          return;
        }
      } catch (e) {
        removeExistingForm();
        console.error(`[${SCRIPT_NAME}] Error:`, e);
      }
      removeExistingForm();
      await delay(config.retryInterval);
    }
    console.error(`[${SCRIPT_NAME}] Failed to initialize after ${config.retryTimes} attempts.`);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function initForm() {
    // Fetch the submit page
    const response = await fetch(state.submitURL);
    const html = await response.text();

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const originalForm = doc.querySelector("form.submit-form");

    if (!originalForm) {
      console.log(`[${SCRIPT_NAME}] Could not find submit form.`);
      return false;
    }

    // Extract CSRF token and other hidden fields
    const csrfToken = originalForm.querySelector('input[name="csrf_token"]')?.value;
    const ftaa = originalForm.querySelector('input[name="ftaa"]')?.value;
    const bfaa = originalForm.querySelector('input[name="bfaa"]')?.value;
    const action = originalForm.querySelector('input[name="action"]')?.value || "submitSolutionFormSubmitted";

    // Extract contest/participant IDs from the page
    const contestIdMatch = html.match(/contestId\s*[=:]\s*(\d+)/);
    const participantIdMatch = html.match(/participantId\s*[=:]\s*(\d+)/);
    if (contestIdMatch) state.contestId = contestIdMatch[1];
    if (participantIdMatch) state.participantId = participantIdMatch[1];

    // Get language options
    const languageSelect = originalForm.querySelector('select[name="programTypeId"]');
    const languageOptions = languageSelect
      ? Array.from(languageSelect.options).map((opt) => ({
          value: opt.value,
          text: opt.textContent,
          selected: opt.selected,
        }))
      : [];

    // Get problem options
    const problemSelect = originalForm.querySelector('select[name="submittedProblemIndex"]');
    const problemOptions = problemSelect
      ? Array.from(problemSelect.options).map((opt) => ({
          value: opt.value,
          text: opt.textContent,
          timeLimit: opt.getAttribute("data-time-limit"),
          memoryLimit: opt.getAttribute("data-memory-limit"),
          inputFile: opt.getAttribute("data-input-file"),
          outputFile: opt.getAttribute("data-output-file"),
        }))
      : [];

    // Create our custom form
    createSubmitForm(csrfToken, ftaa, bfaa, action, languageOptions, problemOptions);

    // Setup regeneration timer
    state.doRegenerateOnSubmit = false;
    setTimeout(
      () => {
        state.doRegenerateOnSubmit = true;
      },
      config.regenerateInterval * 60 * 1000,
    );

    return true;
  }

  function createSubmitForm(csrfToken, ftaa, bfaa, action, languageOptions, problemOptions) {
    const problemStatement = document.querySelector(".problem-statement");
    if (!problemStatement) return;

    // Remove existing form if any
    removeExistingForm();

    // Create container
    const container = document.createElement("div");
    container.className = "cf-fast-submit-container";
    container.id = "cf-fast-submit";

    // Find current problem's limits
    const currentProblem = problemOptions.find((p) => p.value === state.problemId) || problemOptions[0];
    const timeLimit = currentProblem?.timeLimit || "?";
    const memoryLimit = currentProblem?.memoryLimit || "?";

    container.innerHTML = `
      <div class="cf-fast-submit-header">
        <div class="cf-fast-submit-title">
          <span class="icon">⚡</span>
          <h3>Fast Submit</h3>
        </div>
        <div class="cf-fast-submit-status">
          <span class="dot"></span>
          <span>Ready</span>
        </div>
      </div>

      <form class="cf-fast-submit-form" id="cfFastSubmitForm" method="post" enctype="multipart/form-data">
        <input type="hidden" name="csrf_token" value="${csrfToken || ""}">
        <input type="hidden" name="ftaa" value="${ftaa || ""}">
        <input type="hidden" name="bfaa" value="${bfaa || ""}">
        <input type="hidden" name="action" value="${action}">
        <input type="hidden" name="submittedProblemIndex" value="${state.problemId}">
        ${state.type === "problemset" ? `<input type="hidden" name="submittedProblemCode" value="${state.contestId}${state.problemId}">` : ""}
        ${state.type === "problemset" ? `<input type="hidden" name="contestId" value="${state.contestId}">` : ""}

        <div class="cf-fast-submit-row">
          <div class="cf-fast-submit-group">
            <label for="cfProblemSelect">Problem</label>
            <select id="cfProblemSelect" disabled>
              ${problemOptions
                .map(
                  (opt) => `
                <option value="${opt.value}" ${opt.value === state.problemId ? "selected" : ""}>
                  ${opt.text}
                </option>
              `,
                )
                .join("")}
            </select>
          </div>

          <div class="cf-fast-submit-group">
            <label for="cfLanguageSelect">Language</label>
            <select id="cfLanguageSelect" name="programTypeId">
              ${languageOptions
                .map(
                  (opt) => `
                <option value="${opt.value}" ${opt.value === state.settings.defaultLanguage ? "selected" : ""}>
                  ${opt.text}
                </option>
              `,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div class="cf-fast-submit-group">
          <label>Source Code</label>
          <div class="cf-fast-submit-editor-container">
            <div class="cf-fast-submit-editor-toolbar">
              <div class="left">
                <span class="file-info">📄 ${timeLimit}s, ${memoryLimit}MB</span>
              </div>
            </div>
            <div id="cfFastSubmitEditor" class="cf-fast-submit-editor"></div>
            <textarea id="cfSourceCode" name="source" style="display: none;"></textarea>
          </div>
        </div>

        <div class="cf-fast-submit-actions">
          <div class="cf-fast-submit-info">
            <span>Problem: <strong>${state.problemId}</strong></span>
            <span>Contest: <strong>${state.contestId}</strong></span>
          </div>
          <div class="cf-fast-submit-buttons">
            <button type="submit" class="cf-fast-submit-btn cf-fast-submit-btn-primary" id="cfSubmitBtn">
              🚀 Submit
            </button>
          </div>
        </div>
      </form>

      <div class="cf-fast-submit-footer">
        <p>CF Fast Submit v${VERSION} | Created by <a href="https://github.com/abdo-ibrahim" target="_blank">Abdulrahman Ibrahim</a></p>
      </div>
    `;

    // Insert after problem statement
    problemStatement.parentNode.insertBefore(container, problemStatement.nextSibling);

    // Initialize ACE editor
    initEditor();

    // Setup event listeners
    setupEventListeners(csrfToken, ftaa, bfaa);
  }

  function initEditor() {
    // Check if ACE is available (it should be on Codeforces pages)
    if (typeof ace !== "undefined") {
      setupAceEditor();
    } else {
      // Fallback: create a simple textarea editor
      setupFallbackEditor();
    }
  }

  function setupFallbackEditor() {
    const editorDiv = document.getElementById("cfFastSubmitEditor");
    const textarea = document.createElement("textarea");
    textarea.id = "cfFallbackEditor";
    textarea.style.cssText = "width: 100%; height: 200px; font-family: monospace; font-size: 12px; padding: 8px; border: none; resize: vertical; box-sizing: border-box;";
    editorDiv.appendChild(textarea);

    // Sync with hidden textarea on input
    textarea.addEventListener("input", () => {
      const code = textarea.value;
      document.getElementById("cfSourceCode").value = code;
    });

    // Create editor-like interface
    state.editor = {
      getValue: () => textarea.value,
      setValue: (val, pos) => {
        textarea.value = val;
        document.getElementById("cfSourceCode").value = val;
      },
      focus: () => textarea.focus(),
      setTheme: () => {},
      setOptions: () => {},
      getSession: () => ({
        on: () => {},
      }),
      session: {
        setMode: () => {},
      },
    };

    // Auto-focus editor
    setTimeout(() => textarea.focus(), 500);
  }

  function setupAceEditor() {
    const editorElement = document.getElementById("cfFastSubmitEditor");

    if (typeof ace !== "undefined") {
      state.editor = ace.edit(editorElement);

      // Configure editor with default theme
      state.editor.setTheme("ace/theme/chrome");
      state.editor.setShowPrintMargin(false);
      state.editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        tabSize: 4,
        fontSize: "14px",
      });

      // Set mode based on selected language
      updateEditorMode();

      // Sync with hidden textarea on every change
      state.editor.getSession().on("change", () => {
        const code = state.editor.getValue();
        document.getElementById("cfSourceCode").value = code;
      });

      // Auto-focus editor
      setTimeout(() => state.editor.focus(), 500);
    } else {
      // Fallback to textarea editor
      setupFallbackEditor();
    }
  }

  function updateEditorMode() {
    if (!state.editor || typeof ace === "undefined") return;

    const languageSelect = document.getElementById("cfLanguageSelect");
    const languageId = languageSelect?.value;
    const extension = extensionMap[languageId] || "program.cpp";

    if (ace.require) {
      const modelist = ace.require("ace/ext/modelist");
      if (modelist) {
        const mode = modelist.getModeForPath(extension).mode;
        state.editor.session.setMode(mode);
      }
    }
  }

  function setupEventListeners(csrfToken, ftaa, bfaa) {
    // Language change
    document.getElementById("cfLanguageSelect")?.addEventListener("change", () => {
      updateEditorMode();
      // Save preference
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.sync.set({ defaultLanguage: document.getElementById("cfLanguageSelect").value });
      }
    });

    // Form submission
    document.getElementById("cfFastSubmitForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await submitSolution();
    });
  }

  async function submitSolution() {
    const submitBtn = document.getElementById("cfSubmitBtn");
    const form = document.getElementById("cfFastSubmitForm");
    const sourceCodeTextarea = document.getElementById("cfSourceCode");

    if (!form) return;

    // Get code from editor or fallback textarea
    let sourceCode = "";
    if (state.editor && typeof state.editor.getValue === "function") {
      sourceCode = state.editor.getValue();
    }

    // Also check the fallback textarea directly
    const fallbackEditor = document.getElementById("cfFallbackEditor");
    if (!sourceCode && fallbackEditor) {
      sourceCode = fallbackEditor.value;
    }

    // Update the hidden textarea with the code
    sourceCodeTextarea.value = sourceCode;

    // Check if code is empty
    if (!sourceCode.trim()) {
      showNotification("Please enter your code", "error");
      return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="cf-fast-submit-loading"></span> Submitting...';

    try {
      // Update hidden fields with current values from window
      if (window._ftaa) {
        form.querySelector('input[name="ftaa"]').value = window._ftaa;
      }
      if (window._bfaa) {
        form.querySelector('input[name="bfaa"]').value = window._bfaa;
      }

      // Set the form action URL
      form.action = state.submitURL;

      // Remove enctype since we're not uploading files
      form.removeAttribute("enctype");

      // Submit the form directly (this works better with Codeforces)
      form.submit();
    } catch (error) {
      console.error(`[${SCRIPT_NAME}] Submit error:`, error);
      showNotification("Error submitting. Please try again.", "error");
      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.innerHTML = "🚀 Submit";
    }
  }

  function showNotification(message, type = "info") {
    // Remove existing notification
    const existing = document.querySelector(".cf-fast-submit-notification");
    if (existing) {
      existing.remove();
    }

    // Create notification
    const notification = document.createElement("div");
    notification.className = `cf-fast-submit-notification ${type}`;

    const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
    notification.innerHTML = `<span>${icon}</span><span>${message}</span>`;

    document.body.appendChild(notification);

    // Show animation
    setTimeout(() => notification.classList.add("show"), 10);

    // Hide after 4 seconds
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  function removeExistingForm() {
    const existing = document.getElementById("cf-fast-submit");
    if (existing) {
      existing.remove();
    }
  }
})();
