import { Transactional } from 'models/Transactional/Transactional';
import type { TransferItem } from './TransferItem';

export abstract class Transfer extends Transactional {
  date?: Date;
  items?: TransferItem[];
}
