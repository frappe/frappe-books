import { getMoneyMaker, MoneyMaker } from 'pesa';
import { Field, FieldType, Schema } from 'schemas/types';
import { getRandomString } from 'utils';
import { markRaw } from 'vue';
import type { FrappeDoc } from 'src/frappe/document';
import { DocumentActionWarning, SinglesMap } from './model/types';
import {
  DEFAULT_CURRENCY,
  DEFAULT_DISPLAY_PRECISION,
  DEFAULT_INTERNAL_PRECISION,
} from './utils/consts';
import * as errors from './utils/errors';
import { format } from './utils/format';
import Observable from './utils/observable';
import {
  DocPermission,
  hasPermission,
  type Permissions,
} from './utils/permissions';
import { t, T } from './utils/translation';
import type { reports } from 'reports/index';
import type { Report } from 'reports/Report';
import type { ChartOfAccounts } from 'utils/types';

/** A record Frappe's boot sends; currencies come as `:Currency`. */
type BootDoc = { doctype: string; name: string; symbol?: string | null };

type MoneySettings = {
  currency?: string;
  internal_precision?: number;
  display_precision?: number;
};

export class Fyo {
  t = t;
  T = T;

  errors = errors;

  pesa: MoneyMaker;

  user = '';
  /** Document events, like `sync:SalesInvoice`, that lists and screens follow. */
  observer: Observable<never> = new Observable();
  /** The open settings documents, by schema name. */
  singles: SinglesMap = {};

  onDocumentActionWarning?: (warning: DocumentActionWarning) => void;

  currencyFormatter?: Intl.NumberFormat;
  currencySymbols: Record<string, string | undefined> = {};
  #temporaryNameCounters: Record<string, number> = {};

  constructor() {
    this.pesa = getMoneyMaker({
      currency: DEFAULT_CURRENCY,
      precision: DEFAULT_INTERNAL_PRECISION,
      display: DEFAULT_DISPLAY_PRECISION,
      wrapper: markRaw,
    });
  }

  /** The symbols formatted amounts carry, e.g. ₹, of the enabled currencies Frappe's boot sends. */
  setCurrencySymbols(bootDocs: BootDoc[] = []) {
    this.currencySymbols = Object.fromEntries(
      bootDocs
        .filter(({ doctype }) => doctype === ':Currency')
        .map(({ name, symbol }) => [name, symbol || undefined])
    );
  }

  reportDocumentActionWarning(
    doc: FrappeDoc,
    action: DocumentActionWarning['action'],
    errors: unknown[]
  ) {
    const label = doc.name ?? doc.schema.label ?? doc.schemaName;
    const messages = {
      save: this.t`${label} was saved, but the view could not be fully updated. Reload the page before continuing.`,
      submit: this.t`${label} was submitted, but the view could not be fully updated. Reload the page before continuing.`,
    };
    const message = messages[action];
    try {
      this.onDocumentActionWarning?.({ doc, action, message, errors });
    } catch (error) {
      console.error(message, error);
    }
  }

  format(value: unknown, field: FieldType | Field, doc?: FrappeDoc) {
    return format(value, field, doc ?? null, this);
  }

  /** Counts and shows amounts in the company currency, as the system settings say. */
  initializeMoneyMaker(settings: MoneySettings) {
    this.pesa = getMoneyMaker({
      currency: settings.currency ?? DEFAULT_CURRENCY,
      precision: settings.internal_precision ?? DEFAULT_INTERNAL_PRECISION,
      display: settings.display_precision ?? DEFAULT_DISPLAY_PRECISION,
      wrapper: markRaw,
    });
  }

  can(schemaName: string, permission: DocPermission): boolean {
    return hasPermission(this.store.permissions, schemaName, permission);
  }

  /** The name a new document shows until the server names it, e.g. `New Sales Invoice 01`. */
  getTemporaryName(schema: Schema): string {
    if (schema.naming === 'random') {
      return getRandomString();
    }

    const index = (this.#temporaryNameCounters[schema.name] ?? 0) + 1;
    this.#temporaryNameCounters[schema.name] = index;
    const label = schema.label ?? schema.name;
    return this.t`New ${label} ${String(index).padStart(2, '0')}`;
  }

  isTemporaryName(name: string, schema: Schema): boolean {
    const label = schema.label ?? schema.name;
    return name.includes(this.t`New ${label} `);
  }

  store = {
    isDevelopment: false,
    appVersion: '',
    permissions: null as Permissions | null,
    chartsOfAccounts: [] as ChartOfAccounts[],
    // GST state codes and names, from the server
    indianStates: {} as Record<string, string>,
    reports: {} as Record<keyof typeof reports, Report | undefined>,
  };
}

export { T, t };
