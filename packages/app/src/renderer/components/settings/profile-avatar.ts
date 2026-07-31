/**
 * Turning a photo off disk into the same kind of avatar the built-in agents
 * carry: a small square `data:` URL living on the member row.
 */

/**
 * Matches the built-in agent portraits (128px). A full-size photo inlined as
 * base64 would sit in IndexedDB forever at megabytes apiece.
 */
export const AVATAR_PX = 128;

/** Center square of a source image, so a non-square photo crops instead of squashing. */
export function squareCrop(
  width: number,
  height: number,
): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/** A member with a blank name renders as a blank avatar and a nameless row. */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 ? name : null;
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { x, y, size } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This device could not process the image.");
    // JPEG has no alpha, so a transparent PNG would letterbox to black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
    ctx.drawImage(bitmap, x, y, size, size, 0, 0, AVATAR_PX, AVATAR_PX);
    // ~6KB at this size, against ~30KB for PNG — and base64 inflates it by a third.
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
