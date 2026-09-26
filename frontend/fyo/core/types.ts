import type { Doc } from 'fyo/model/doc';
import type { Money } from 'pesa';
import type { RawValue } from 'schemas/types';
import type { DatabaseDemuxBase } from 'utils/db/types';

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

/**
 * DatabaseDemuxConstructor: type for a constructor that returns a DatabaseDemuxBase
 * it's typed this way because `typeof AbstractClass` is invalid as abstract classes
 * can't be initialized using `new`.
 */

export type DatabaseDemuxConstructor = new () => DatabaseDemuxBase;

export interface FyoConfig {
  DatabaseDemux: DatabaseDemuxConstructor;
}
