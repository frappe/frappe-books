import { Fyo, t } from 'fyo';
import {
  Action,
  LinkedRecords,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { FieldTypeEnum } from 'schemas/types';
import { validateEmail, validatePhoneNumber } from 'src/frappe/validation';
import { getLeadActions, getLeadStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';
import { getStates } from '../Address/Address';
import { ADDRESS_FIELDS } from '../Party/Party';

const ADDRESS_SECTION = 'Address';

/**
 * Books Lead, served by Frappe and named by its Full Name. Its server mappers
 * make customers and quotes; a new lead's address values make its Address.
 */
export class Lead extends FrappeDoc {
  static override doctype = 'Books Lead';
  static override presentation: Presentation = {
    label: 'Lead',
    insertFields: ADDRESS_FIELDS,
  };
  static override lists = { state: getStates };

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email_id: validateEmail,
    mobile_no: validatePhoneNumber,
  };

  override getSectionDescription(section: string): string | undefined {
    if (this.notInserted && section === ADDRESS_SECTION) {
      return this.fyo.t`Saved as an Address for this lead`;
    }

    return undefined;
  }

  // The address can only be filled before the first save.
  override isSectionOpen(section: string): boolean | undefined {
    return this.notInserted && section === ADDRESS_SECTION ? true : undefined;
  }

  static getActions(fyo: Fyo): Action[] {
    return getLeadActions(fyo);
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getLeadStatusColumn(), 'email_id', 'mobile_no'],
    };
  }

  /** A saved lead lists the Addresses linked to it. */
  static override getLinkedRecords(fyo: Fyo): LinkedRecords {
    return {
      schemaName: 'Address',
      linkField: 'links',
      dynamicLink: true,
      label: t`Addresses`,
      columns: [
        'address_title',
        'address_line1',
        'city',
        {
          label: t`Primary`,
          fieldname: 'is_primary_address',
          fieldtype: FieldTypeEnum.Check,
          badge: (row) =>
            row.is_primary_address
              ? { label: t`Primary`, theme: 'gray' }
              : undefined,
          display: (value) => (value ? t`Primary` : ''),
        },
      ],
      addLabel: t`Add address`,
      emptyMessage: fyo.t`No addresses`,
    };
  }
}
