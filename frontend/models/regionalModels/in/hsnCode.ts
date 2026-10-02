import type { Fyo } from 'fyo';

/** HSN/SAC is India's GST code, so only an Indian company sees and checks it, as the server does. */
export function isHsnCodeHidden(fyo: Fyo): boolean {
  return fyo.singles.AccountingSettings?.country !== 'India';
}
