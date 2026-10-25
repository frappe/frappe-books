import { Fyo } from 'fyo';
import {
  Action,
  EmptyMessageMap,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { canOpenLedger, getMappedDocAction } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { getReports } from 'reports';
import type { Field } from 'schemas/types';
import type { DocValue } from 'fyo/core/types';
import {
  getCompanyRowDescription,
  getCompanyRowValue,
  setCompanyRowValue,
} from 'src/frappe/companyRow';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';
import { getModel } from 'src/frappe/registry';
import { validateEmail, validatePhoneNumber } from 'src/frappe/validation';
import { getStates } from '../Address/Address';
import { PartyAccount } from './PartyAccount';

type PartyKey = 'customer' | 'supplier';

/**
 * What a new party's (or lead's) primary Address is made from, as ERPNext's
 * quick entry asks; the server reads them on insert.
 */
export const ADDRESS_FIELDS = [
  { fieldname: 'address_line1', fieldtype: 'Data', label: 'Address Line 1' },
  { fieldname: 'address_line2', fieldtype: 'Data', label: 'Address Line 2' },
  { fieldname: 'city', fieldtype: 'Data', label: 'City' },
  {
    fieldname: 'state',
    fieldtype: 'AutoComplete',
    label: 'State',
    options: [],
  },
  { fieldname: 'pincode', fieldtype: 'Data', label: 'Postal Code' },
  {
    fieldname: 'country',
    fieldtype: 'Link',
    label: 'Country',
    target: 'Country',
    create: false,
  },
].map((field) => ({ ...field, section: 'Address' })) as Field[];

/** The party's ledger account for the current company, kept in its `accounts` row. */
const ACCOUNT_FIELD = {
  fieldname: 'account',
  fieldtype: 'Link',
  label: 'Account',
  target: 'Account',
  create: false,
  companyTable: 'accounts',
  after: 'accounts',
} as Field & { after: string };

export const ADDRESS_FIELDNAMES = ADDRESS_FIELDS.map(
  ({ fieldname }) => fieldname
);

/**
 * What a customer and a supplier share, served by Frappe. The server fills
 * the default account and currency on save, and makes a new party's primary
 * Contact and Address from its email, mobile and address.
 */
export abstract class Party extends FrappeDoc {
  /** The account type of the default accounts. */
  static accountType: 'Receivable' | 'Payable';
  /** The start of the party's own fieldnames, as ERPNext names them. */
  static partyKey: PartyKey;
  static override rowModels = { accounts: PartyAccount };
  static override lists = { state: getStates };

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email_id: validateEmail,
    mobile_no: validatePhoneNumber,
  };

  // A new party asks for its contact and address once; a saved one shows its primary ones.
  hidden: HiddenMap = {
    email_id: () => this.inserted,
    mobile_no: () => this.inserted,
    [this.primaryContactField]: () => this.notInserted,
    [this.primaryAddressField]: () => this.notInserted,
  };

  /** The Account field shows the current company's `accounts` row; rows of other companies stay as they are. */
  get account(): DocValue {
    return getCompanyRowValue(this, 'accounts', 'account');
  }

  set account(value: DocValue) {
    setCompanyRowValue(this, 'accounts', 'account', value);
  }

  get primaryContactField(): string {
    return `${(this.constructor as typeof Party).partyKey}_primary_contact`;
  }

  get primaryAddressField(): string {
    return `${(this.constructor as typeof Party).partyKey}_primary_address`;
  }

  /** A saved party's contact and address sections hold its primary ones; the Account names its company. */
  override getFormFields(fields: Field[]): Field[] {
    const description = getCompanyRowDescription(this);
    fields = fields.map((field) =>
      field.fieldname === 'account' && description
        ? { ...field, sub_label: description }
        : field
    );
    if (this.notInserted) {
      return fields;
    }

    const titles = {
      [this.getSection(this.primaryContactField)]: this.fyo.t`Primary contact`,
      [this.getSection(this.primaryAddressField)]: this.fyo.t`Primary address`,
    };
    return fields.map((field) => {
      const title = field.section && titles[field.section];
      return title ? { ...field, section: title } : field;
    });
  }

  override getSectionDescription(section: string): string | undefined {
    if (this.inserted) {
      return undefined;
    }

    const label = this.typeLabel.toLowerCase();
    if (section === this.getSection(this.primaryContactField)) {
      return this.fyo.t`Saved as the primary Contact for this ${label}`;
    }

    if (section === this.getSection(this.primaryAddressField)) {
      return this.fyo.t`Saved as the primary Address for this ${label}`;
    }

    return undefined;
  }

  // Contact and address can only be filled before the first save.
  override isSectionOpen(section: string): boolean | undefined {
    const sections = [
      this.getSection(this.primaryContactField),
      this.getSection(this.primaryAddressField),
    ];
    return this.notInserted && sections.includes(section) ? true : undefined;
  }

  getSection(fieldname: string): string {
    return this.fieldMap[fieldname]?.section ?? '';
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'email_id', 'mobile_no', 'outstanding_amount'],
    };
  }
}

/** A customer's or supplier's presentation; GST fields are Indian. */
export function getPartyPresentation(
  label: string,
  partyKey: PartyKey,
  quickEditFields: string[],
  fields: Presentation['fields'] = {}
): Presentation {
  // A saved party shows its primary records as cards, picked from those linked to it.
  const card = { create: false, card: true };
  return {
    label,
    quickEditFields,
    insertFields: ADDRESS_FIELDS,
    clientFields: [ACCOUNT_FIELD],
    fields: {
      ...fields,
      // The Account field edits the current company's row.
      accounts: { hidden: true },
      // ERPNext's Read Only fields, which a new party fills as Desk's quick entry does.
      email_id: { control: undefined },
      mobile_no: { control: undefined },
      [`${partyKey}_primary_contact`]: {
        ...card,
        placeholder: 'No primary contact',
      },
      [`${partyKey}_primary_address`]: {
        ...card,
        placeholder: 'No primary address',
      },
    },
    omitFields: ['gst_category', 'gstin'],
  };
}

/**
 * The primary Contact and Address are picked from those linked to the party;
 * the Account from the ledgers of its type (ERPNext's rule for the row in accessory mode).
 */
export function getPartyFilters(partyKey: PartyKey): FiltersMap {
  const linkedToParty = (doc: FrappeDoc) => [
    ['Dynamic Link', 'link_doctype', '=', doc.doctype],
    ['Dynamic Link', 'link_name', '=', doc.name],
  ];
  return {
    [`${partyKey}_primary_contact`]: linkedToParty,
    [`${partyKey}_primary_address`]: linkedToParty,
    account: (doc: FrappeDoc) => [
      ['is_group', '=', 0],
      ['account_type', '=', (doc.constructor as typeof Party).accountType],
    ],
  } as FiltersMap;
}

export function getPrimaryEmptyMessages(partyKey: PartyKey): EmptyMessageMap {
  const label = (doc: FrappeDoc) => doc.typeLabel.toLowerCase();
  return {
    [`${partyKey}_primary_contact`]: (doc: FrappeDoc) =>
      doc.fyo.t`No contacts linked to this ${label(doc)}`,
    [`${partyKey}_primary_address`]: (doc: FrappeDoc) =>
      doc.fyo.t`No addresses linked to this ${label(doc)}`,
  };
}

interface PartyInvoice {
  schemaName: ModelNameEnum.SalesInvoice | ModelNameEnum.PurchaseInvoice;
  mapper: string;
  createLabel: string;
  viewLabel: string;
}

/** Make an invoice for the party, list its invoices, and open its ledger. */
export function getPartyActions(
  fyo: Fyo,
  { schemaName, mapper, createLabel, viewLabel }: PartyInvoice
): Action[] {
  return [
    getMappedDocAction(fyo, {
      label: createLabel,
      condition: (doc: FrappeDoc) => !doc.notInserted,
      target: () => [schemaName, mapper],
    }),
    {
      label: viewLabel,
      condition: (doc: FrappeDoc) =>
        !doc.notInserted && fyo.can(schemaName, 'read'),
      action: async (partyDoc, router) => {
        const partyField = getModel(schemaName)!.partyField!;
        await router.push({
          path: `/list/${schemaName}`,
          query: {
            filters: JSON.stringify([[partyField, '=', partyDoc.name]]),
          },
        });
      },
    },
    getGeneralLedgerAction(fyo),
  ];
}

function getGeneralLedgerAction(fyo: Fyo): Action {
  return {
    label: fyo.t`General Ledger`,
    group: fyo.t`View`,
    condition: (doc: FrappeDoc) =>
      doc.inserted && canOpenLedger('GeneralLedger'),
    action: async (partyDoc, router) => {
      // The party type first: a new party type clears the party.
      const [typeFilter, nameFilter] = getReports().GeneralLedger!.partyFilters;
      const filters = {
        [typeFilter]: partyDoc.doctype,
        [nameFilter]: partyDoc.name,
      };
      await router.push({
        path: '/report/GeneralLedger',
        query: { defaultFilters: JSON.stringify(filters) },
      });
    },
  };
}
