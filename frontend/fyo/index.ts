import { getMoneyMaker, MoneyMaker } from 'pesa';
import { Field, FieldType } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { markRaw } from 'vue';
import { DatabaseHandler } from './core/dbHandler';
import { DocHandler } from './core/docHandler';
import { DocValue, FyoConfig } from './core/types';
import { Doc } from './model/doc';
import { DocumentActionWarning, ModelMap } from './model/types';
import {
  DEFAULT_CURRENCY,
  DEFAULT_DISPLAY_PRECISION,
  DEFAULT_INTERNAL_PRECISION,
} from './utils/consts';
import * as errors from './utils/errors';
import { format } from './utils/format';
import {
  DocPermission,
  hasPermission,
  type Permissions,
} from './utils/permissions';
import { t, T } from './utils/translation';
import type { reports } from 'reports/index';
import type { Report } from 'reports/Report';
import type { ChartOfAccounts } from 'utils/types';

export class Fyo {
  t = t;
  T = T;

  errors = errors;

  pesa: MoneyMaker;

  user = '';
  doc: DocHandler;
  db: DatabaseHandler;

  _initialized = false;

  onDocumentActionWarning?: (warning: DocumentActionWarning) => void;
  temp?: Record<string, unknown>;

  currencyFormatter?: Intl.NumberFormat;
  currencySymbols: Record<string, string | undefined> = {};
  defaultNumberSeries: Record<string, string | undefined> = {};

  constructor(conf: FyoConfig) {
    this.db = new DatabaseHandler(this, conf.DatabaseDemux);
    this.doc = new DocHandler(this);

    this.pesa = getMoneyMaker({
      currency: DEFAULT_CURRENCY,
      precision: DEFAULT_INTERNAL_PRECISION,
      display: DEFAULT_DISPLAY_PRECISION,
      wrapper: markRaw,
    });

  }

  /** Loads the symbols that formatted amounts carry, e.g. ₹. */
  async loadCurrencySymbols() {
    const currencies = (await this.db.getAll('Currency', {
      fields: ['name', 'symbol'],
    })) as { name: string; symbol?: string | null }[];

    this.currencySymbols = Object.fromEntries(
      currencies.map(({ name, symbol }) => [name, symbol || undefined])
    );
  }

  /** Loads the series the server names new documents with, by schema. */
  async loadDefaultNumberSeries() {
    this.defaultNumberSeries = await this.db.getDefaultNumberSeries();
  }

  reportDocumentActionWarning(
    doc: Doc,
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

  get docs() {
    return this.doc.docs;
  }

  get models() {
    return this.doc.models;
  }

  get singles() {
    return this.doc.singles;
  }

  get schemaMap() {
    return this.db.schemaMap;
  }

  get fieldMap() {
    return this.db.fieldMap;
  }

  format(value: unknown, field: FieldType | Field, doc?: Doc) {
    return format(value, field, doc ?? null, this);
  }

  async initializeAndRegister(
    models: ModelMap = {},
    regionalModels: ModelMap = {}
  ) {
    if (this._initialized) return;

    this.#initializeModules();
    await this.#initializeMoneyMaker();

    this.doc.registerModels(models, regionalModels);
    await this.doc.getDoc('SystemSettings');
    this._initialized = true;
  }

  #initializeModules() {
    // temp params while calling routes
    this.temp = {};

    this.doc.init();
  }

  async #initializeMoneyMaker() {
    const values =
      (await this.db?.getSingleValues(
        {
          fieldname: 'internalPrecision',
          parent: 'SystemSettings',
        },
        {
          fieldname: 'displayPrecision',
          parent: 'SystemSettings',
        },
        {
          fieldname: 'currency',
          parent: 'SystemSettings',
        }
      )) ?? [];

    const acc = values.reduce((acc, sv) => {
      acc[sv.fieldname] = sv.value as string | number | undefined;
      return acc;
    }, {} as Record<string, string | number | undefined>);

    const precision: number =
      (acc.internalPrecision as number) ?? DEFAULT_INTERNAL_PRECISION;
    const display: number =
      (acc.displayPrecision as number) ?? DEFAULT_DISPLAY_PRECISION;
    const currency: string = (acc.currency as string) ?? DEFAULT_CURRENCY;

    this.pesa = getMoneyMaker({
      currency,
      precision,
      display,
      wrapper: markRaw,
    });
  }

  can(schemaName: string, permission: DocPermission): boolean {
    return hasPermission(this.store.permissions, schemaName, permission);
  }

  getField(schemaName: string, fieldname: string) {
    return this.fieldMap[schemaName]?.[fieldname];
  }

  async getValue(
    schemaName: string,
    name: string,
    fieldname?: string
  ): Promise<DocValue | Doc[]> {
    if (fieldname === undefined && this.schemaMap[schemaName]?.isSingle) {
      fieldname = name;
      name = schemaName;
    }

    if (getIsNullOrUndef(name) || getIsNullOrUndef(fieldname)) {
      return undefined;
    }

    const cachedDoc = this.docs.get(schemaName)?.[name];
    if (cachedDoc) {
      return cachedDoc.get(fieldname);
    }

    // A missing document reads as an empty map.
    const values = await this.db.get(schemaName, name, fieldname);
    return values[fieldname] as DocValue | undefined;
  }

  store = {
    isDevelopment: false,
    appVersion: '',
    language: '',
    permissions: null as Permissions | null,
    /** The fields search matches and shows, by schema, from the DocType search fields. */
    searchFields: {} as Record<string, string[] | undefined>,
    chartsOfAccounts: [] as ChartOfAccounts[],
    reports: {} as Record<keyof typeof reports, Report | undefined>,
  };
}

export { T, t };
