import { app } from "electron";

// Use Electron's packaging state instead of environment variables
export const inDevelopment = !app.isPackaged;
