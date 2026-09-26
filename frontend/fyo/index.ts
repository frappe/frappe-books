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
  type PermissionMap,
} from './utils/permissions';
import { t, T } from './utils/translation';
import { ErrorLog } from './utils/types';
import type { reports } from 'reports/index';
import type { Report } from 'reports/Report';

export class Fyo {
  t = t;
  T = T;

  errors = errors;

  pesa: MoneyMaker;

  user = '';
  doc: DocHandler;
  db: DatabaseHandler;

  _initialized = false;

  errorLog: ErrorLog[] = [];
  onDocumentActionWarning?: (warning: DocumentActionWarning) => void;
  temp?: Record<string, unknown>;

  currencyFormatter?: Intl.NumberFormat;
  currencySymbols: Record<string, string | undefined> = {};

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
    for (const error of errors) {
      this.errorLog.push({
        name: 'Document follow-up failed',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        more: { schemaName: doc.schemaName, name: doc.name, action },
      });
    }
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

    let doc: Doc;
    let value: DocValue | Doc[];
    try {
      doc = await this.doc.getDoc(schemaName, name);
      value = doc.get(fieldname);
    } catch {
      value = undefined;
    }

    if (value === undefined && schemaName === name) {
      const sv = await this.db.getSingleValues({
        fieldname: fieldname,
        parent: schemaName,
      });

      return sv?.[0]?.value;
    }

    return value;
  }

  store = {
    isDevelopment: false,
    appVersion: '',
    language: '',
    permissions: null as PermissionMap | null,
    reports: {} as Record<keyof typeof reports, Report | undefined>,
  };
}

export { T, t };
