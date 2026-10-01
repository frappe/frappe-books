import type { FrappeDoc } from 'src/frappe/document';
import type { Money } from 'pesa';
import type { RawValue } from 'schemas/types';

export type DocValue =
  | string
  | number
  | boolean
  | Date
  | Money
  | null
  | undefined;
export type DocValueMap = Record<string, DocValue | FrappeDoc[] | DocValueMap[]>;
export type RawValueMap = Record<string, RawValue | RawValueMap[]>;
