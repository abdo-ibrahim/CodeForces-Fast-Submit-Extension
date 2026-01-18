/**
 * CF Fast Submit - Popup Script
 * Author: Abdulrahman Ibrahim
 * © 2026
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const statusIndicator = document.getElementById("statusIndicator");
  const statusText = document.getElementById("statusText");
  const defaultLanguage = document.getElementById("defaultLanguage");
  const saveSettingsBtn = document.getElementById("saveSettings");
  const resetSettingsBtn = document.getElementById("resetSettings");
  const toast = document.getElementById("toast");

  // Default settings
  const defaultSettings = {
    defaultLanguage: "54",
  };

  // Load settings on popup open
  loadSettings();
  checkActiveTab();

  // Event listeners
  saveSettingsBtn.addEventListener("click", saveSettings);
  resetSettingsBtn.addEventListener("click", resetSettings);

  /**
   * Load settings from chrome storage
   */
  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (settings) => {
      defaultLanguage.value = settings.defaultLanguage;
    });
  }

  /**
   * Save settings to chrome storage
   */
  function saveSettings() {
    const settings = {
      defaultLanguage: defaultLanguage.value,
    };

    chrome.storage.sync.set(settings, () => {
      showToast("Settings saved successfully!");

      // Notify content script about settings change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes("codeforces.com")) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              action: "settingsUpdated",
              settings: settings,
            })
            .catch(() => {
              // Content script might not be loaded
            });
        }
      });
    });
  }

  /**
   * Reset settings to defaults
   */
  function resetSettings() {
    chrome.storage.sync.set(defaultSettings, () => {
      loadSettings();
      showToast("Settings reset to defaults!");
    });
  }

  /**
   * Check if the active tab is a Codeforces problem page
   */
  function checkActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const url = tabs[0].url || "";
        const isCodeforcesPage = url.includes("codeforces.com");
        const isProblemPage = /\/(contest|gym|problemset|group)\/.*\/problem\//.test(url);

        if (isCodeforcesPage && isProblemPage) {
          statusIndicator.classList.remove("inactive");
          statusIndicator.classList.add("active");
          statusText.textContent = "Active on this page";
        } else if (isCodeforcesPage) {
          statusIndicator.classList.remove("active", "inactive");
          statusText.textContent = "Navigate to a problem page";
        } else {
          statusIndicator.classList.remove("active");
          statusIndicator.classList.add("inactive");
          statusText.textContent = "Not on Codeforces";
        }
      }
    });
  }

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {boolean} isError - Whether it's an error message
   */
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.remove("error");
    if (isError) {
      toast.classList.add("error");
    }
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  }
});
