import { Fyo } from 'fyo';
import { Action } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { getPartyActions, getPartyPresentation, Party } from '../Party/Party';

/** Books Supplier. */
export class Supplier extends Party {
  static override doctype = 'Books Supplier';
  static override presentation = getPartyPresentation('Supplier', [
    'email',
    'phone',
    'address',
    'accounts',
    'default_currency',
    'tax_id',
  ]);
  static override accountType = 'Payable' as const;

  static getActions(fyo: Fyo): Action[] {
    return getPartyActions(fyo, {
      schemaName: ModelNameEnum.PurchaseInvoice,
      mapper: 'make_purchase_invoice',
      createLabel: fyo.t`Create purchase`,
      viewLabel: fyo.t`View purchases`,
    });
  }
}
