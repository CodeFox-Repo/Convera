import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// TODO: do later, for now only use english
i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        appName: "electron-shadcn",
        titleHomePage: "Home Page",
        titleSecondPage: "Second Page",
      },
    },
  },
});
