import { Fyo } from 'fyo';

export function getAccountLabel(fyo: Fyo, name: string): string {
  return fyo.store.accountLabels[name] || name;
}
