import type { Doc } from 'fyo/model/doc';
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
export type DocValueMap = Record<string, DocValue | Doc[] | DocValueMap[]>;
export type RawValueMap = Record<string, RawValue | RawValueMap[]>;
