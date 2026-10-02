export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 4096;

/** Canvas font of an element; `style.font` is empty when it has no shorthand. */
export function getFont(style: CSSStyleDeclaration) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/** Text width in the context's font, with the element's letter spacing. */
export function measureText(
  context: CanvasRenderingContext2D,
  value: string,
  style: CSSStyleDeclaration
) {
  const text = value.replace(/\s+/g, ' ');
  const spacing = parseFloat(style.letterSpacing) || 0;
  return context.measureText(text).width + text.length * spacing;
}

/** Column widths in pixels, kept per browser under `storageKey`. */
export class ColumnWidths {
  widths: Record<string, number> = {};
  private storageKey: string;

  constructor(storageKey: string) {
    this.storageKey = storageKey;
    this.load();
  }

  /** `undefined` restores the column's default width. */
  set(key: string, width: number | undefined, persist = false) {
    if (width === undefined) {
      delete this.widths[key];
    } else {
      this.widths[key] = Math.round(
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))
      );
    }
    if (persist) this.save();
  }

  private load() {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? '{}'
      );
      if (!stored || typeof stored !== 'object' || Array.isArray(stored))
        return;
      this.widths = Object.fromEntries(
        Object.entries(stored).filter(
          ([, width]) =>
            typeof width === 'number' &&
            Number.isFinite(width) &&
            width >= MIN_COLUMN_WIDTH &&
            width <= MAX_COLUMN_WIDTH
        )
      );
    } catch {
      // Columns still work when browser storage is unavailable.
    }
  }

  private save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.widths));
    } catch {
      // Keep resized widths for this visit if browser storage is unavailable.
    }
  }
}
