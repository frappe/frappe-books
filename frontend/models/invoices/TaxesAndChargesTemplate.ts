import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { TaxesAndCharges } from './TaxesAndCharges';

/** A Taxes and Charges Template: the tax rows an invoice or quote starts from, named by its title. */
abstract class TaxesAndChargesTemplate extends FrappeDoc {
  static override rowModels = { taxes: TaxesAndCharges };

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'is_default'] };
  }
}

export class SalesTaxesAndChargesTemplate extends TaxesAndChargesTemplate {
  static override doctype = 'Books Sales Taxes and Charges Template';
  static override presentation = { label: 'Sales Taxes and Charges Template' };
}

export class PurchaseTaxesAndChargesTemplate extends TaxesAndChargesTemplate {
  static override doctype = 'Books Purchase Taxes and Charges Template';
  static override presentation = {
    label: 'Purchase Taxes and Charges Template',
  };
}
