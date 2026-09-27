import { Doc } from 'fyo/model/doc';
import type { DefaultMap } from 'fyo/model/types';
import type { Transfer } from './Transfer';
import type { Money } from 'pesa';

export class TransferItem extends Doc {
  item?: string;

  unit?: string;
  transferUnit?: string;
  quantity?: number;
  transferQuantity?: number;
  unitConversionFactor?: number;

  rate?: Money;
  amount?: Money;

  batch?: string;
  serialNumber?: string;

  parentdoc?: Transfer;

  // The server derives a missing quantity from the other, so a new row's start is set here.
  static defaults: DefaultMap = {
    quantity: () => 1,
    transferQuantity: () => 1,
  };
}
