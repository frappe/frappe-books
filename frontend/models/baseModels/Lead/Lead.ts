import { Fyo } from 'fyo';
import { Action, ListViewSettings, ValidationMap } from 'fyo/model/types';
import {
  validateEmail,
  validatePhoneNumber,
} from 'fyo/model/validationFunction';
import { getLeadActions, getLeadStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';

/** Books Lead, served by Frappe. Its server mappers make customers and quotes. */
export class Lead extends FrappeDoc {
  static override doctype = 'Books Lead';
  static override presentation = {
    label: 'Lead',
    nameField: { label: 'Name', placeholder: 'Full Name' },
  };

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email: validateEmail,
    mobile: validatePhoneNumber,
  };

  static getActions(fyo: Fyo): Action[] {
    return getLeadActions(fyo);
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getLeadStatusColumn(), 'email', 'mobile'],
    };
  }
}
