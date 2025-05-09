import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import SettingsPage from "../pages/SettingsPage";
import "../global.css";
import { syncThemeWithLocal } from "../helpers/theme_helpers";
import { useTranslation } from "react-i18next";
import "../localization/i18n";
import { updateAppLanguage } from "../helpers/language_helpers";

/**
 * Standalone settings window app component
 */
function SettingsApp() {
  const { i18n } = useTranslation();

  useEffect(() => {
    syncThemeWithLocal();
    updateAppLanguage(i18n);
  }, [i18n]);

  return <SettingsPage />;
}

// Initialize the settings window
const settingsRoot = document.getElementById("settings-app");
if (settingsRoot) {
  createRoot(settingsRoot).render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>,
  );
}
