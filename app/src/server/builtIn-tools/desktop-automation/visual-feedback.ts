/**
 * Visual Feedback for Desktop Automation
 * Shows animated circles and highlights when AI performs actions
 */

import { BrowserWindow } from "electron";

interface ClickHighlightOptions {
  x: number;
  y: number;
  size?: number;
  color?: string;
  duration?: number;
}

class VisualFeedback {
  private static instance: VisualFeedback;
  private activeOverlays: BrowserWindow[] = [];

  static getInstance(): VisualFeedback {
    if (!VisualFeedback.instance) {
      VisualFeedback.instance = new VisualFeedback();
    }
    return VisualFeedback.instance;
  }

  /**
   * Show an animated circle at the click location
   */
  async showClickHighlight(options: ClickHighlightOptions): Promise<void> {
    const { x, y, size = 60, color = "#ff6b35", duration = 2000 } = options;

    try {
      // Create overlay window
      const overlay = new BrowserWindow({
        width: size * 2,
        height: size * 2,
        x: x - size,
        y: y - size,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        thickFrame: false,
        paintWhenInitiallyHidden: true,
        type: "panel",
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      overlay.setFocusable(false);
      overlay.setContentProtection(true);
      overlay.setIgnoreMouseEvents(true, { forward: true });

      // Set always on top for different platforms
      if (process.platform === "win32") {
        overlay.setAlwaysOnTop(true, "screen-saver");
      }

      // Create animated circle HTML
      const html = `
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 0;
                background: transparent;
                overflow: hidden;
              }
              
              .click-indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: ${size}px;
                height: ${size}px;
                border: 3px solid ${color};
                border-radius: 50%;
                animation: clickPulse ${duration}ms ease-out forwards;
                box-shadow: 0 0 20px ${color}40;
              }
              
              .click-indicator::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 8px;
                height: 8px;
                background: ${color};
                border-radius: 50%;
                animation: centerDot ${duration}ms ease-out forwards;
              }
              
              @keyframes clickPulse {
                0% {
                  transform: translate(-50%, -50%) scale(0.2);
                  opacity: 1;
                  border-width: 6px;
                }
                50% {
                  transform: translate(-50%, -50%) scale(1);
                  opacity: 0.8;
                  border-width: 3px;
                }
                100% {
                  transform: translate(-50%, -50%) scale(1.5);
                  opacity: 0;
                  border-width: 1px;
                }
              }
              
              @keyframes centerDot {
                0% {
                  transform: translate(-50%, -50%) scale(1);
                  opacity: 1;
                }
                70% {
                  transform: translate(-50%, -50%) scale(1);
                  opacity: 1;
                }
                100% {
                  transform: translate(-50%, -50%) scale(0);
                  opacity: 0;
                }
              }
            </style>
          </head>
          <body>
            <div class="click-indicator"></div>
          </body>
        </html>
      `;

      overlay.loadURL(
        `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`,
      );

      // Track overlay
      this.activeOverlays.push(overlay);

      // Auto-close after animation
      setTimeout(() => {
        this.closeOverlay(overlay);
      }, duration + 100);
    } catch (error) {
      console.error("[VisualFeedback] Failed to show click highlight:", error);
    }
  }

  /**
   * Show a rectangular highlight for regions or UI elements
   */
  async showRegionHighlight(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string = "#4CAF50",
    duration: number = 3000,
  ): Promise<void> {
    try {
      const overlay = new BrowserWindow({
        width: width + 20,
        height: height + 20,
        x: x - 10,
        y: y - 10,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        thickFrame: false,
        paintWhenInitiallyHidden: true,
        type: "panel",
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      overlay.setFocusable(false);
      overlay.setContentProtection(true);
      overlay.setIgnoreMouseEvents(true, { forward: true });

      if (process.platform === "win32") {
        overlay.setAlwaysOnTop(true, "screen-saver");
      }

      const html = `
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 0;
                background: transparent;
                overflow: hidden;
              }
              
              .region-highlight {
                position: absolute;
                top: 10px;
                left: 10px;
                width: ${width}px;
                height: ${height}px;
                border: 3px solid ${color};
                border-radius: 8px;
                animation: regionPulse ${duration}ms ease-in-out forwards;
                box-shadow: 0 0 15px ${color}60;
              }
              
              @keyframes regionPulse {
                0%, 100% {
                  opacity: 0.9;
                  transform: scale(1);
                  border-width: 3px;
                }
                50% {
                  opacity: 0.6;
                  transform: scale(1.02);
                  border-width: 2px;
                }
              }
            </style>
          </head>
          <body>
            <div class="region-highlight"></div>
          </body>
        </html>
      `;

      overlay.loadURL(
        `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`,
      );
      this.activeOverlays.push(overlay);

      setTimeout(() => {
        this.closeOverlay(overlay);
      }, duration + 100);
    } catch (error) {
      console.error("[VisualFeedback] Failed to show region highlight:", error);
    }
  }

  /**
   * Show typing indicator at current text cursor position
   */
  async showTypingIndicator(
    x: number,
    y: number,
    text: string,
    duration: number = 2000,
  ): Promise<void> {
    try {
      const overlay = new BrowserWindow({
        width: Math.max(200, text.length * 8 + 40),
        height: 60,
        x: x - 100,
        y: y - 30,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        thickFrame: false,
        paintWhenInitiallyHidden: true,
        type: "panel",
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      overlay.setFocusable(false);
      overlay.setContentProtection(true);
      overlay.setIgnoreMouseEvents(true, { forward: true });

      if (process.platform === "win32") {
        overlay.setAlwaysOnTop(true, "screen-saver");
      }

      const html = `
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 0;
                background: transparent;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
              }
              
              .typing-indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 20px;
                font-size: 12px;
                white-space: nowrap;
                animation: typingFade ${duration}ms ease-out forwards;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
              }
              
              .typing-text {
                display: inline-block;
                animation: typeWriter 1s steps(${text.length}) forwards;
                overflow: hidden;
                white-space: nowrap;
                width: 0;
              }
              
              @keyframes typingFade {
                0% {
                  opacity: 0;
                  transform: translate(-50%, -50%) translateY(10px);
                }
                10% {
                  opacity: 1;
                  transform: translate(-50%, -50%) translateY(0);
                }
                90% {
                  opacity: 1;
                  transform: translate(-50%, -50%) translateY(0);
                }
                100% {
                  opacity: 0;
                  transform: translate(-50%, -50%) translateY(-10px);
                }
              }
              
              @keyframes typeWriter {
                to {
                  width: 100%;
                }
              }
            </style>
          </head>
          <body>
            <div class="typing-indicator">
              <span class="typing-text">${text}</span>
            </div>
          </body>
        </html>
      `;

      overlay.loadURL(
        `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`,
      );
      this.activeOverlays.push(overlay);

      setTimeout(() => {
        this.closeOverlay(overlay);
      }, duration + 100);
    } catch (error) {
      console.error("[VisualFeedback] Failed to show typing indicator:", error);
    }
  }

  /**
   * Close a specific overlay
   */
  private closeOverlay(overlay: BrowserWindow): void {
    try {
      const index = this.activeOverlays.indexOf(overlay);
      if (index > -1) {
        this.activeOverlays.splice(index, 1);
      }

      if (!overlay.isDestroyed()) {
        overlay.close();
      }
    } catch (error) {
      console.error("[VisualFeedback] Failed to close overlay:", error);
    }
  }

  /**
   * Close all active overlays
   */
  closeAllOverlays(): void {
    this.activeOverlays.forEach((overlay) => {
      this.closeOverlay(overlay);
    });
    this.activeOverlays = [];
  }
}

// Export singleton instance and helper functions
export const visualFeedback = VisualFeedback.getInstance();

export const showClickHighlight = (options: ClickHighlightOptions) => {
  return visualFeedback.showClickHighlight(options);
};

export const showRegionHighlight = (
  x: number,
  y: number,
  width: number,
  height: number,
  color?: string,
  duration?: number,
) => {
  return visualFeedback.showRegionHighlight(
    x,
    y,
    width,
    height,
    color,
    duration,
  );
};

export const showTypingIndicator = (
  x: number,
  y: number,
  text: string,
  duration?: number,
) => {
  return visualFeedback.showTypingIndicator(x, y, text, duration);
};

export const closeAllFeedback = () => {
  visualFeedback.closeAllOverlays();
};
