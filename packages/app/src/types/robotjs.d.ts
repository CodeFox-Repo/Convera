declare module "@hurdlegroup/robotjs" {
  export interface Bitmap {
    width: number;
    height: number;
    image: Buffer;
    byteWidth: number;
    bitsPerPixel: number;
    bytesPerPixel: number;
    colorAt(x: number, y: number): string;
  }

  export const screen: {
    capture(x?: number, y?: number, width?: number, height?: number): Bitmap;
    updateMetrics(): void;
  };

  export function keyTap(key: string, modifier?: string | string[]): void;
  export function keyToggle(
    key: string,
    down: "up" | "down",
    modifier?: string | string[],
  ): void;
  export function typeString(text: string): void;
  export function typeStringDelayed(text: string, cpm: number): void;
  export function moveMouse(x: number, y: number): void;
  export function moveMouseSmooth(x: number, y: number): void;
  export function dragMouse(x: number, y: number): void;
  export function mouseClick(
    button?: "left" | "right" | "middle",
    double?: boolean,
  ): void;
  export function mouseToggle(
    down: "up" | "down",
    button?: "left" | "right" | "middle",
  ): void;
  export function scrollMouse(x: number, y: number): void;
  export function getMousePos(): { x: number; y: number };
  export function getPixelColor(x: number, y: number): string;
  export function getScreenSize(): { width: number; height: number };
  export function setKeyboardDelay(ms: number): void;
  export function setMouseDelay(ms: number): void;
}
