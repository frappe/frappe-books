import { ReadOnlyMap } from 'fyo/model/types';
import { hasDocTypePermission } from 'fyo/utils/permissions';
import { FrappeDoc } from 'src/frappe/document';
import { call } from 'src/web/api';

const SET_FONT =
  'frappe_books.frappe_books.doctype.books_print_settings.books_print_settings.set_font';

/**
 * Books Print Settings, served by Frappe: what print formats show of the
 * company. Its font is the font of Frappe's Print Settings.
 */
export class PrintSettings extends FrappeDoc {
  static override doctype = 'Books Print Settings';
  static override presentation = {
    label: 'Print Settings',
    fields: {
      color: {
        options: [
          { label: 'Red', value: '#f56565' },
          { label: 'Orange', value: '#ed8936' },
          { label: 'Yellow', value: '#ecc94b' },
          { label: 'Green', value: '#48bb78' },
          { label: 'Teal', value: '#38b2ac' },
          { label: 'Blue', value: '#33a1ff' },
          { label: 'Indigo', value: '#667eea' },
          { label: 'Purple', value: '#9f7aea' },
          { label: 'Pink', value: '#ed64a6' },
          { label: 'Black', value: '#112B42' },
        ],
      },
    },
  };

  declare logo?: string;
  declare company_name?: string;
  declare display_logo?: boolean;
  declare font?: string;

  readOnly: ReadOnlyMap = {
    font: () =>
      !hasDocTypePermission(
        this.fyo.store.permissions,
        'Print Settings',
        'write'
      ),
  };

  /** The font is Frappe's; a save that changes it sets it first. */
  override async beforeSync() {
    await super.beforeSync();
    if (this.isChanged('font')) {
      await call(SET_FONT, { font: this.font });
    }
  }
}
