import { Fyo } from 'fyo';
import { Action } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import {
  ADDRESS_FIELDNAMES,
  getPartyActions,
  getPartyPresentation,
  getPrimaryEmptyMessages,
  getPartyFilters,
  Party,
} from '../Party/Party';

/** Books Supplier. */
export class Supplier extends Party {
  static override doctype = 'Books Supplier';
  static override presentation = getPartyPresentation('Supplier', 'supplier', [
    'supplier_primary_contact',
    'email_id',
    'mobile_no',
    'supplier_primary_address',
    ...ADDRESS_FIELDNAMES,
    'account',
    'default_currency',
    'tax_id',
  ]);
  static override accountType = 'Payable' as const;
  static override partyKey = 'supplier' as const;
  static override filters = getPartyFilters('supplier');
  static override emptyMessages = getPrimaryEmptyMessages('supplier');

  static getActions(fyo: Fyo): Action[] {
    return getPartyActions(fyo, {
      schemaName: ModelNameEnum.PurchaseInvoice,
      mapper: 'make_purchase_invoice',
      createLabel: fyo.t`Create purchase`,
      viewLabel: fyo.t`View purchases`,
    });
  }
}
