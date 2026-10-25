import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { ItemTaxTemplateDetail } from './ItemTaxTemplateDetail';

/** Books Item Tax Template, served by Frappe with its tax rate rows and named by its title. */
export class ItemTaxTemplate extends FrappeDoc {
  static override doctype = 'Books Item Tax Template';
  static override presentation = {
    label: 'Tax Template',
    quickEditFields: ['taxes'],
  };
  static override rowModels = { taxes: ItemTaxTemplateDetail };

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name'] };
  }
}
