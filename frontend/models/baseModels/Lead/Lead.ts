import { Fyo } from 'fyo';
import { Action, ListViewSettings, ValidationMap } from 'fyo/model/types';
import {
  validateEmail,
  validatePhoneNumber,
} from 'src/frappe/validation';
import { getLeadActions, getLeadStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';

/** Books Lead, served by Frappe and named by its Full Name. Its server mappers make customers and quotes. */
export class Lead extends FrappeDoc {
  static override doctype = 'Books Lead';
  static override presentation = {
    label: 'Lead',
  };

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email_id: validateEmail,
    mobile_no: validatePhoneNumber,
  };

  static getActions(fyo: Fyo): Action[] {
    return getLeadActions(fyo);
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getLeadStatusColumn(), 'email_id', 'mobile_no'],
    };
  }
}
