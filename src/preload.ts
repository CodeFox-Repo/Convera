import { contextBridge, ipcRenderer } from "electron";
import { createElectronAPI } from "./helpers/ipc/listeners-register";

// SOURCE(Sma1lboy): https://www.electronjs.org/docs/latest/tutorial/process-model
// expose electronAPI to renderer process
contextBridge.exposeInMainWorld("electronAPI", createElectronAPI(ipcRenderer));
