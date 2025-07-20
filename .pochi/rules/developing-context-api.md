# Developing a Context API and a New API Endpoint

This document outlines the process of developing a new context API and a new API endpoint in this project. The goal is to provide a clear and concise guide for future development.

## 1. Define the Core Logic in a Dedicated Module

- **Create a new file** in `app/src/electro-bridge/ipc/` to house the core logic for the new context. For example, `active-app-context.ts`.
- **Implement the functions** that will provide the desired context. For example, `getOpenedApps`.

## 2. Expose the New API via IPC

- **Define a new IPC channel** in `app/src/electro-bridge/ipc/channels.ts`. Add a new property to the `CHANNELS.APP` object, and a corresponding entry in the `IPCServer` interface and `methodChannelMap`.
- **Register the IPC handler** in `app/src/electro-bridge/ipc/listeners-register.ts`. Import the new function from your context module and add a new `ipcMain.handle` call within `setupElectronAPIIPC`.

## 3. Update the Frontend API

- **Update the type definitions** in `app/src/shared/types/electron.d.ts`. Add the new function to the `IActiveAppAPI` interface.
- **Expose the new function** in `app/src/preload.ts`. Add a new entry to the `activeAppAPI` object in the `contextBridge.exposeInMainWorld` call.

By following these steps, you can cleanly and effectively add new context APIs and API endpoints to the application, ensuring a consistent and maintainable codebase.
