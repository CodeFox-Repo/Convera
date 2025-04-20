export async function minimizeWindow() {
  if (window.electronAPI) {
    await window.electronAPI.minimizeWindow();
  } else {
    console.error("electronAPI is not available for minimizing window!");
  }
}

export async function maximizeWindow() {
  if (window.electronAPI) {
    await window.electronAPI.maximizeWindow();
  } else {
    console.error("electronAPI is not available for maximizing window!");
  }
}

export async function closeWindow() {
  if (window.electronAPI) {
    await window.electronAPI.closeWindow();
  } else {
    console.error("electronAPI is not available for closing window!");
  }
}
