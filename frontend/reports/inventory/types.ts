import { ModelNameEnum } from "models/types";

export interface StockLedgerRow {
  name: number;
  date: string;

  item: string;
  location: string;
  batch: string;
  serialNumber: string;

  quantity: number;
  balanceQuantity: number;

  incomingRate: number;
  valuationRate: number;

  balanceValue: number;
  valueChange: number;

  referenceName: string;
  referenceType: string;
}

export interface StockBalanceEntry{
  name: number;

  item: string;
  location:string;
  batch: string;
  serialNumber: string;

  balanceQuantity: number;
  balanceValue: number;

  openingQuantity: number;
  openingValue:number;

  incomingQuantity:number;
  incomingValue:number;

  outgoingQuantity:number;
  outgoingValue:number;

  valuationRate:number;
}

export type ReferenceType =
  | ModelNameEnum.StockMovement
  | ModelNameEnum.Shipment
  | ModelNameEnum.PurchaseReceipt
  | 'All';

export type SerialNumberStatus = 'All' | 'In stock' | 'Out stock';
