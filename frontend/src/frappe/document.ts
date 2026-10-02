import type { Fyo } from 'fyo';
import type { DocValue, DocValueMap } from 'fyo/core/types';
import {
  areDocValuesEqual,
  getFieldDefault,
  getMissingMandatoryMessage,
  getPreDefaultValues,
  isDocValueTruthy,
  setChildDocIdx,
} from 'fyo/model/helpers';
import type {
  Action,
  ChangeArg,
  CurrenciesMap,
  DocumentActionWarning,
  EmptyMessageMap,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  ListsMap,
  ReadOnlyMap,
  RequiredMap,
  TreeViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import {
  validateOptions,
  validateRequired,
} from 'fyo/model/validationFunction';
import { ConflictError, MandatoryError, ValueError } from 'fyo/utils/errors';
import { isPesa } from 'fyo/utils';
import Observable from 'fyo/utils/observable';
import type { DocPermission, DocPermissionMap } from 'fyo/utils/permissions';
import {
  FieldTypeEnum,
  type Field,
  type Schema,
  type TargetField,
} from 'schemas/types';
import { getIsNullOrUndef, getMapFromList, getRandomString } from 'utils';
import type { LinkedDoc } from 'utils/db/types';
import { markRaw, reactive } from 'vue';
import * as api from './api';
import type { DocValues } from './api';
import { evaluateCondition, type EvalDoc } from './dependsOn';
import { getDocType } from './doctypes';
import { forgetFrappeDoc, newFrappeDoc } from './documents';
import type { DocField } from './meta';
import { getNamingField, type Presentation } from './schema';
import { toDocValue, toDocValues, toFrappeValue } from './values';

const PREVIEW_DELAY = 300;

export type FieldRule = 'hidden' | 'readOnly' | 'required';

const ruleConditions: Record<
  FieldRule,
  (field: DocField) => string | undefined
> = {
  hidden: (field) => field.depends_on,
  readOnly: (field) => field.read_only_depends_on,
  required: (field) => field.mandatory_depends_on,
};

/**
 * A document a form edits, as Frappe serves it: its values, unsaved edits,
 * rights and save lifecycle. Its fields are the DocType's, it loads and saves
 * the whole document over /api/v2, and the server fills and checks its
 * values. A model that extends it only adds how /books presents it.
 */
export class FrappeDoc extends Observable<DocValue | FrappeDoc[]> {
  /** The Frappe DocType the model shows, e.g. `Books Item`. */
  static doctype = '';
  static presentation: Presentation = { label: '' };
  /** A whitelisted method that fills what a save would; previewed while the user edits. */
  static previewMethod?: string;
  /** The models of a table's rows by table fieldname; other rows are plain `FrappeDoc`s. */
  static rowModels: Record<string, typeof FrappeDoc> = {};
  /**
   * Fields the server fills again after the user edits the field they follow,
   * by that field, e.g. a payment account after its method; see `leaveToServer`.
   */
  static refills: Record<string, string[]> = {};
  /** Fields whose default the server decides, like one that follows a setting; see `leaveToServer`. */
  static serverDefaults: string[] = [];

  static lists: ListsMap = {};
  static filters: FiltersMap = {};
  /** Filters whose values a record created from the link's Create option takes. */
  static createFilters: FiltersMap = {};
  static emptyMessages: EmptyMessageMap = {};

  static getListViewSettings(_fyo: Fyo): ListViewSettings {
    return {};
  }

  static getTreeSettings(_fyo: Fyo): TreeViewSettings | void {
    return;
  }

  static getActions(_fyo: Fyo): Action[] {
    return [];
  }

  name?: string;
  schema: Readonly<Schema>;
  fyo: Fyo;
  fieldMap: Record<string, Field>;

  /** A row's place in its table, and the document and table it is in. */
  idx?: number;
  parentdoc?: FrappeDoc;
  parentFieldname?: string;

  /** The server's rights on this saved document; unset until a form loads them. */
  docPermissions?: DocPermissionMap;
  _dirty = true;
  _notInserted = true;
  _syncPromise?: Promise<FrappeDoc>;

  /** Rows the server holds; other rows are new and saved without their client names. */
  _savedRows = new Set<string>();
  /** The values as last loaded or saved. */
  _savedValues: DocValueMap = {};
  /** Fields the last preview filled; the next preview fills them again until the user edits one. */
  _serverFilled = new Set<string>();
  _previewTimer?: ReturnType<typeof setTimeout>;
  /** An edit's fills are not back from the server yet. */
  _isPreviewDue = false;
  _edits = 0;

  validations: ValidationMap = {};
  required: RequiredMap = {};
  hidden: HiddenMap = {};
  readOnly: ReadOnlyMap = {};
  getCurrencies: CurrenciesMap = {};

  constructor(schema: Schema, data: DocValueMap, fyo: Fyo) {
    super();
    this.fyo = markRaw(fyo);
    this.schema = schema;
    this.fieldMap = getMapFromList(schema.fields, 'fieldname');

    if (this.schema.isSingle) {
      this.name = this.schemaName;
    }

    this._setDefaults();
    this._setValuesWithoutChecks(data);
    return reactive(this) as FrappeDoc;
  }

  get schemaName(): string {
    return this.schema.name;
  }

  get doctype(): string {
    return getDocType(this.schemaName).doctype;
  }

  /** The name Frappe knows the document by; a single's is its doctype. */
  get frappeName(): string {
    return this.schema.isSingle ? this.doctype : this.name!;
  }

  get notInserted(): boolean {
    return this._notInserted;
  }

  get inserted(): boolean {
    return !this._notInserted;
  }

  get tableFields(): TargetField[] {
    return this.schema.fields.filter(
      (f) => f.fieldtype === FieldTypeEnum.Table
    ) as TargetField[];
  }

  get dirty() {
    return this._dirty;
  }

  get submitted(): boolean {
    return Number(this.docstatus ?? 0) > 0;
  }

  get cancelled(): boolean {
    return this.docstatus === 2;
  }

  get previewMethod(): string | undefined {
    return (this.constructor as typeof FrappeDoc).previewMethod;
  }

  get namingField(): string | undefined {
    return getNamingField(getDocType(this.schemaName).meta);
  }

  /** What a form of the document is headed by. */
  get formTitle(): string {
    return this.name ?? '';
  }

  get quickEditFields() {
    let fieldnames = this.schema.quickEditFields;

    if (fieldnames === undefined) {
      fieldnames = [];
    }

    if (fieldnames.length === 0 && this.fieldMap['name']) {
      fieldnames = ['name'];
    }

    return fieldnames.map((f) => this.fieldMap[f]);
  }

  /** The fields a form shows, in order. Models override it to label fields by value. */
  getFormFields(fields: Field[]): Field[] {
    return fields;
  }

  get isSubmitted() {
    return !!this.submitted && !this.cancelled;
  }

  get isCancelled() {
    return !!this.submitted && !!this.cancelled;
  }

  get isSyncing() {
    return !!this._syncPromise;
  }

  get canDelete() {
    if (this.notInserted || !this.can('delete')) {
      return false;
    }

    if (this.schema.isSingle || this.schema.isChild) {
      return false;
    }

    return !this.schema.isSubmittable || !this.isSubmitted;
  }

  get canEdit(): boolean {
    if (this.schema.isSubmittable && (this.submitted || this.cancelled)) {
      return false;
    }

    return this.canWrite;
  }

  get canSave() {
    const isSubmittable = this.schema.isSubmittable;
    if (isSubmittable && (!!this.submitted || !!this.cancelled)) {
      return false;
    }

    if (!this.dirty || this.schema.isChild) {
      return false;
    }

    return this.canWrite;
  }

  get canSubmit() {
    if (!this.schema.isSubmittable || !this.can('submit')) {
      return false;
    }

    if (this.dirty || this.notInserted) {
      return false;
    }

    return !this.submitted && !this.cancelled;
  }

  get canCancel() {
    if (!this.schema.isSubmittable || !this.can('cancel')) {
      return false;
    }

    if (this.dirty || this.notInserted) {
      return false;
    }

    return !this.cancelled && !!this.submitted;
  }

  /** Create for a new document and write for a saved one or a single. */
  get canWrite(): boolean {
    if (this.schema.isChild) {
      // A row is saved with its parent; a detached row is never saved.
      return this.parentdoc?.canWrite ?? true;
    }

    // Frappe lists singles under can_write, never can_create.
    const isNew = this.notInserted && !this.schema.isSingle;
    return this.can(isNew ? 'create' : 'write');
  }

  /** Rights on a saved document come from the server when loaded, else from the schema. */
  can(permission: DocPermission): boolean {
    if (this.docPermissions && this.inserted) {
      return !!this.docPermissions[permission];
    }

    return this.fyo.can(this.schemaName, permission);
  }

  /** Whether the DocField's depends_on, read_only_depends_on or mandatory_depends_on applies. */
  hasFieldRule(fieldname: string, rule: FieldRule): boolean {
    const docfield = getDocType(this.schemaName).meta.fields.find(
      (field) => field.fieldname === fieldname
    );
    const condition = docfield && ruleConditions[rule](docfield);
    if (!condition) {
      return false;
    }

    const evalDoc = this.getEvalDoc();
    if (rule === 'readOnly') {
      // A field locks on its saved value, so an unsaved edit never locks it.
      evalDoc[fieldname] = this._getSavedFrappeValue(fieldname);
    }

    const parent = this.parentdoc?.getEvalDoc();
    const isMet = evaluateCondition(condition, evalDoc, parent);
    return rule === 'hidden' ? !isMet : isMet;
  }

  /** A field's saved value as form conditions read it. */
  _getSavedFrappeValue(fieldname: string): unknown {
    const value = this._savedValues[fieldname] as DocValue;
    const field = this.fieldMap[fieldname];
    return getIsNullOrUndef(value)
      ? null
      : toFrappeValue(value, field, this.fyo);
  }

  /** The values Frappe's form conditions read; amounts are numbers there. */
  getEvalDoc(): EvalDoc {
    const values = this.getFrappeValues({ keepRowNames: true });
    for (const { fieldname, fieldtype } of this.schema.fields) {
      if (fieldtype === 'Currency' && fieldname in values) {
        values[fieldname] = Number(values[fieldname]);
      }
    }

    const docstatus = this.docstatus ?? 0;
    const __islocal = this.notInserted ? 1 : 0;
    return { ...values, name: this.name, docstatus, __islocal };
  }

  /** The document as Frappe takes it; new rows go without their client names. */
  getFrappeValues(options: FrappeValueOptions = {}): DocValues {
    const values: DocValues = {};
    for (const field of this.schema.fields) {
      if (
        field.meta ||
        (options.clearServerFilled && this._serverFilled.has(field.fieldname))
      ) {
        continue;
      }

      values[field.fieldname] = this._getFrappeValue(field, options);
    }

    return values;
  }

  _getFrappeValue(field: Field, options: FrappeValueOptions): unknown {
    const value = this[field.fieldname];
    if (field.fieldtype !== 'Table') {
      return toFrappeValue(value as DocValue, field, this.fyo);
    }

    return ((value ?? []) as FrappeDoc[]).map((row) => {
      const rowValues = row.getFrappeValues(options);
      const isKnown = options.keepRowNames || this._savedRows.has(row.name!);
      return isKnown ? { ...rowValues, name: row.name } : rowValues;
    });
  }

  /**
   * The document a controller method runs on, with what Frappe checks it by:
   * its docstatus and `modified`, and the `creation` and `owner` a saved
   * document may not change.
   */
  getMethodDocument(options: FrappeValueOptions = {}): DocValues {
    const values = this.getFrappeValues(options);
    // Frappe refuses a saved copy whose modified time is stale, or whose status, creation or owner changed.
    const saved = this.notInserted
      ? { __islocal: 1 }
      : {
          name: this.frappeName,
          modified: this.modified,
          docstatus: this.docstatus ?? 0,
          creation: this.creation,
          owner: this.owner,
        };
    return { ...values, ...saved, doctype: this.doctype };
  }

  toDocValues(values: DocValues): DocValueMap {
    return toDocValues(this.schema, values, this.fyo, (target) => {
      return getDocType(target).schema;
    });
  }

  _setValuesWithoutChecks(data: DocValueMap) {
    for (const field of this.schema.fields) {
      const { fieldname, fieldtype } = field;
      const value = data[field.fieldname];

      if (Array.isArray(value)) {
        for (const row of value) {
          this.push(fieldname, row as FrappeDoc | DocValueMap);
        }
      } else if (
        fieldtype === FieldTypeEnum.Currency &&
        typeof value === 'number'
      ) {
        this[fieldname] = this.fyo.pesa(value);
      } else if (value !== undefined) {
        this[fieldname] = value;
      } else {
        this[fieldname] = this[fieldname] ?? null;
      }

      if (field.fieldtype === FieldTypeEnum.Table && !this[fieldname]) {
        this[fieldname] = [];
      }
    }
  }

  _setDirty(value: boolean) {
    this._dirty = value;
    if (this.schema.isChild && this.parentdoc) {
      this.parentdoc._dirty = value;
    }
  }

  // set value and trigger change
  async set(
    fieldname: string | DocValueMap,
    value?: DocValue | FrappeDoc[] | DocValueMap[]
  ): Promise<boolean> {
    if (typeof fieldname === 'object') {
      return await this.setMultiple(fieldname);
    }

    if (!this._canSet(fieldname, value)) {
      return false;
    }

    this._setDirty(true);
    if (typeof value === 'string') {
      value = value.trim();
    }

    if (Array.isArray(value)) {
      for (const row of value) {
        this.push(fieldname, row);
      }
    } else {
      const field = this.fieldMap[fieldname];
      await this._validateField(field, value);
      this[fieldname] = value;
    }

    // always run applyChange from the parentdoc
    if (this.schema.isChild && this.parentdoc) {
      await this._applyChange(fieldname);
      await this.parentdoc._applyChange(this.parentFieldname as string);
    } else {
      await this._applyChange(fieldname);
    }

    return true;
  }

  async setMultiple(docValueMap: DocValueMap): Promise<boolean> {
    let hasSet = false;
    for (const fieldname in docValueMap) {
      const isSet = await this.set(
        fieldname,
        docValueMap[fieldname] as DocValue | FrappeDoc[]
      );
      hasSet ||= isSet;
    }

    return hasSet;
  }

  _canSet(
    fieldname: string,
    value?: DocValue | FrappeDoc[] | DocValueMap[]
  ): boolean {
    if (value === undefined || this.fieldMap[fieldname] === undefined) {
      return false;
    }

    const currentValue = this.get(fieldname);
    if (currentValue === undefined) {
      return true;
    }

    return !areDocValuesEqual(currentValue as DocValue, value as DocValue);
  }

  /** Counts edits as they start, so a preview sent before one is dropped. */
  async _applyChange(changedFieldname: string): Promise<boolean> {
    this._edits += 1;
    await this.trigger('change', {
      doc: this,
      changed: changedFieldname,
    });

    return true;
  }

  refreshSchema(schemaName: string) {
    if (this.schemaName === schemaName) {
      const previousFields = this.fieldMap;
      this.schema = getDocType(schemaName).schema;
      this.fieldMap = getMapFromList(this.schema.fields, 'fieldname');
      // Preserve entered values when a customization changes the definition.
      this._setDefaults(
        this.schema.fields.filter((field) => !previousFields[field.fieldname])
      );
    }

    for (const field of this.tableFields) {
      const rows = (this[field.fieldname] as FrappeDoc[] | undefined) ?? [];
      for (const row of rows) {
        row.refreshSchema(schemaName);
      }
    }
  }

  _setDefaults(fields = this.schema.fields) {
    for (const field of fields) {
      let defaultValue: DocValue | FrappeDoc[] = getPreDefaultValues(
        field.fieldtype,
        this.fyo
      );

      if (field.default !== undefined) {
        defaultValue = getFieldDefault(field) as DocValue;
      }

      if (field.fieldtype === FieldTypeEnum.Currency && !isPesa(defaultValue)) {
        defaultValue = this.fyo.pesa(defaultValue as string | number);
      }

      this[field.fieldname] = defaultValue;
    }
  }

  async remove(fieldname: string, idx: number) {
    const childDocs = ((this[fieldname] ?? []) as FrappeDoc[]).filter(
      (row, i) => row.idx !== idx || i !== idx
    );

    setChildDocIdx(childDocs);
    this[fieldname] = childDocs;
    this._setDirty(true);
    return await this._applyChange(fieldname);
  }

  async append(fieldname: string, docValueMap: DocValueMap = {}) {
    this.push(fieldname, docValueMap);
    this._setDirty(true);
    return await this._applyChange(fieldname);
  }

  push(fieldname: string, docValueMap: FrappeDoc | DocValueMap = {}) {
    const childDocs = [
      (this[fieldname] ?? []) as FrappeDoc[],
      this._getChildDoc(docValueMap, fieldname),
    ].flat();

    setChildDocIdx(childDocs);
    this[fieldname] = childDocs;
  }

  /** A row of the table `fieldname`, made from its values. */
  _getChildDoc(values: FrappeDoc | DocValueMap, fieldname: string): FrappeDoc {
    if (values instanceof FrappeDoc) {
      values.parentdoc ??= this;
      return values;
    }

    const table = getDocType(this.schemaName).tables[fieldname];
    if (!table) {
      throw new ValueError(`${this.schemaName} has no table ${fieldname}`);
    }

    const row = new table.Model(
      table.schema,
      { ...values, name: values.name ?? getRandomString() },
      this.fyo
    );
    row.parentdoc = this;
    row.parentFieldname = fieldname;
    return row;
  }

  async _validateSync() {
    this._validateMandatory();
    await this._validateFields();
  }

  _validateMandatory() {
    const checkForMandatory: FrappeDoc[] = [this];
    for (const field of this.tableFields) {
      const childDocs = this.get(field.fieldname) as FrappeDoc[];
      if (!childDocs) {
        continue;
      }

      checkForMandatory.push(...childDocs);
    }

    const missingMandatoryMessage = checkForMandatory
      .map((doc) => getMissingMandatoryMessage(doc))
      .filter(Boolean);

    if (missingMandatoryMessage.length > 0) {
      const fields = missingMandatoryMessage.join('\n');
      const message = this.fyo.t`Value missing for ${fields}`;
      throw new MandatoryError(message);
    }
  }

  async _validateFields() {
    for (const field of this.schema.fields) {
      if (field.fieldtype === FieldTypeEnum.Table) {
        continue;
      }

      const value = this.get(field.fieldname) as DocValue;
      await this._validateField(field, value);
    }
  }

  async _validateField(field: Field, value: DocValue) {
    if (
      field.fieldtype === FieldTypeEnum.Select ||
      field.fieldtype === FieldTypeEnum.AutoComplete
    ) {
      validateOptions(field, value as string, this);
    }

    validateRequired(field, value, this);
    if (getIsNullOrUndef(value)) {
      return;
    }

    const validator = this.validations[field.fieldname];
    if (validator === undefined) {
      return;
    }

    await validator(value);
  }

  async load() {
    if (this.name === undefined) {
      return;
    }

    await this._setLoadedValues(await this._fetchSaved());
  }

  /** Reloads a saved, unedited doc so it shows changes made elsewhere. */
  async refresh() {
    if (!this.canRefresh) {
      return;
    }

    const data = await this._fetchSaved();
    // Edits made while fetching win.
    if (this.canRefresh) {
      await this._setLoadedValues(data);
    }
  }

  get canRefresh() {
    return !this.notInserted && !this.dirty && !this.isSyncing;
  }

  /** The saved document's values. */
  async _fetchSaved(): Promise<DocValueMap> {
    return this.toDocValues(
      await api.getDocument(this.doctype, this.frappeName)
    );
  }

  async _setLoadedValues(data: DocValueMap) {
    await this._syncValues(data);
    this._setDirty(false);
    this._notInserted = false;
    this._rememberSavedRows();
  }

  async _syncValues(
    data: DocValueMap,
    savedAction?: DocumentActionWarning['action']
  ) {
    this._clearValues();
    this._setValuesWithoutChecks(data);
    this._savedValues = data;
    this._dirty = false;
    const change = { doc: this };
    if (!savedAction) {
      this.trigger('change', change);
      return;
    }

    this._notInserted = false;
    const errors: unknown[] = [];
    try {
      await this.change(change);
    } catch (error) {
      errors.push(error);
    }
    errors.push(...(await super.triggerSafely('change', change)));
    if (errors.length) {
      this.fyo.reportDocumentActionWarning(this, savedAction, errors);
    }
  }

  _clearValues() {
    for (const { fieldname } of this.schema.fields) {
      this[fieldname] = null;
    }

    this._dirty = true;
    this._notInserted = true;
  }

  _setChildDocsIdx() {
    for (const field of this.tableFields) {
      const childDocs = (this.get(field.fieldname) as FrappeDoc[]) ?? [];
      setChildDocIdx(childDocs);
    }
  }

  async _preSync() {
    this._setChildDocsIdx();
    await this._validateSync();
    await this.trigger('validate');
  }

  /** Saves the doc; a save already in progress is returned instead of starting another. */
  async sync(): Promise<FrappeDoc> {
    this._syncPromise ??= this._sync().finally(() => {
      this._syncPromise = undefined;
    });
    return await this._syncPromise;
  }

  async _sync(): Promise<FrappeDoc> {
    await this.trigger('beforeSync');
    const doc = this.notInserted ? await this._insert() : await this._update();
    this._notInserted = false;
    await this._notifyAfterAction('sync');
    return doc;
  }

  async _insert() {
    await this._preSync();
    const { insertValues } = (this.constructor as typeof FrappeDoc)
      .presentation;
    const values = { ...insertValues, ...this.getFrappeValues() };
    // Frappe keeps a name it is sent, so only a name the user gives goes with the document.
    if (this.schema.naming !== 'manual') {
      delete values.name;
    }

    // A single always exists; a new copy of it replaces its values.
    const saved = this.schema.isSingle
      ? await api.updateDocument(this.doctype, this.frappeName, values)
      : await api.insertDocument(this.doctype, values);
    await this._setSaved(saved);
    return this;
  }

  async _update() {
    await this._preSync();
    const values = { ...this.getFrappeValues(), modified: this.modified };
    const saved = await api.updateDocument(
      this.doctype,
      this.frappeName,
      values
    );
    await this._setSaved(saved);
    return this;
  }

  async _setSaved(values: DocValues, action: 'save' | 'submit' = 'save') {
    clearTimeout(this._previewTimer);
    this._isPreviewDue = false;
    this._serverFilled.clear();
    await this._syncValues(this.toDocValues(values), action);
    this._rememberSavedRows();
  }

  _rememberSavedRows() {
    this._savedRows = new Set(
      this.tableFields.flatMap(({ fieldname }) =>
        ((this[fieldname] ?? []) as FrappeDoc[]).map((row) => row.name!)
      )
    );
  }

  async _notifyAfterAction(action: 'sync' | 'submit') {
    const errors: unknown[] = [];
    if (action === 'sync') {
      try {
        await this.afterSync();
      } catch (error) {
        errors.push(error);
      }
    }
    // Accounting hooks run on the server. These listeners update the interface.
    const event = action === 'sync' ? 'afterSync' : 'afterSubmit';
    errors.push(...(await super.triggerSafely(event)));
    errors.push(
      ...(await this.fyo.observer.triggerSafely(
        `${action}:${this.schemaName}`,
        this.name
      ))
    );
    if (errors.length) {
      this.fyo.reportDocumentActionWarning(
        this,
        action === 'sync' ? 'save' : 'submit',
        errors
      );
    }
  }

  async submit() {
    if (!this.schema.isSubmittable || this.submitted || this.cancelled) {
      return;
    }

    const document = this.getMethodDocument();
    await this._setSaved(await api.runDocMethod('submit', document), 'submit');
    await this._notifyAfterAction('submit');
  }

  /**
   * Cancels the document, after `linkedDocs` when there are some: the
   * controller's whitelisted `cancel_with_linked_docs` cancels them first.
   */
  async cancel(linkedDocs: LinkedDoc[] = []) {
    if (!this.schema.isSubmittable || !this.submitted || this.cancelled) {
      return;
    }

    const document = this.getMethodDocument();
    const cancelled = linkedDocs.length
      ? await api.runDocMethod('cancel_with_linked_docs', document, {
          linked_docs: linkedDocs,
        })
      : await api.runDocMethod('cancel', document);
    await this._syncValues(this.toDocValues(cancelled));
    this._notInserted = false;
    this._rememberSavedRows();
    this.fyo.observer.trigger(`cancel:${this.schemaName}`, this.name);
  }

  async delete() {
    if (this.notInserted) {
      forgetFrappeDoc(this);
    }

    if (!this.canDelete) {
      return;
    }

    await this.trigger('beforeDelete');
    await api.deleteDocument(this.doctype, this.name!);
    forgetFrappeDoc(this);
    await this.trigger('afterDelete');
    this.fyo.observer.trigger(`delete:${this.schemaName}`, this.name);
  }

  async trigger(event: string, params?: unknown) {
    if (this[event]) {
      await (this[event] as (args: unknown) => Promise<void>)(params);
    }

    await super.trigger(event, params);
  }

  getSum(tablefield: string, childfield: string, convertToFloat = true) {
    const childDocs = (this.get(tablefield) as FrappeDoc[]) ?? [];
    const sum = childDocs
      .map((d) => {
        const value = d.get(childfield) ?? 0;
        if (!isPesa(value)) {
          try {
            return this.fyo.pesa(value as string | number);
          } catch (err) {
            (err as Error).message += ` value: '${String(
              value
            )}' of type: ${typeof value}, fieldname: '${tablefield}', childfield: '${childfield}'`;
            throw err;
          }
        }

        return value;
      })
      .reduce((a, b) => a.add(b), this.fyo.pesa(0));

    if (convertToFloat) {
      return sum.float;
    }

    return sum;
  }

  async setAndSync(
    fieldname: string | DocValueMap,
    value?: DocValue | FrappeDoc[]
  ) {
    await this.set(fieldname, value);
    return await this.sync();
  }

  /** A new copy with unsaved edits, as Desk's Duplicate copies a document. */
  duplicate(): Promise<FrappeDoc> {
    const values = this.getDocValueCopy();
    if (this.schema.naming === 'manual') {
      values.name = `${this.name!} CPY`;
    }

    return Promise.resolve(newFrappeDoc(this.schemaName, values));
  }

  /** Values for a copy: none of the fields the DocTypes mark no_copy, in rows too. */
  getDocValueCopy(): DocValueMap {
    const noCopy = getDocType(this.schemaName)
      .meta.fields.filter((field) => field.no_copy)
      .map((field) => field.fieldname);
    const values: DocValueMap = {};
    for (const field of this.schema.fields) {
      if (
        field.meta ||
        field.fieldname === 'name' ||
        noCopy.includes(field.fieldname)
      ) {
        continue;
      }

      const value = this[field.fieldname];
      values[field.fieldname] = Array.isArray(value)
        ? (value as FrappeDoc[]).map((row) => row.getDocValueCopy())
        : (value as DocValue);
    }

    return values;
  }

  // Lifecycle hooks, which `trigger` calls by name and models override.
  // A hook that runs before an action must not save the document.

  async change({ changed }: ChangeArg) {
    if (changed) {
      this._serverFilled.delete(changed);
      const { refills } = this.constructor as typeof FrappeDoc;
      this.leaveToServer(refills[changed] ?? []);
    }

    // An unsaved document shows the name Frappe will give it.
    if (changed && changed === this.namingField && this.notInserted) {
      this.name = this[changed] as string;
    }

    this.schedulePreview();
  }

  /** A save takes the fills of the last edit, and those of missing values. */
  async beforeSync() {
    if (this.previewMethod && (this._isPreviewDue || this.hasMissingValues)) {
      await this.preview();
    }
  }

  async afterSync() {}
  async beforeDelete() {}
  async afterDelete() {}

  /** Mandatory values are missing, which a preview may fill. */
  get hasMissingValues(): boolean {
    const rows = this.tableFields.flatMap(
      ({ fieldname }) => (this[fieldname] ?? []) as FrappeDoc[]
    );
    return [this, ...rows].some((doc) => !!getMissingMandatoryMessage(doc));
  }

  /** Previews once edits pause, so filled values follow the user without a request per keystroke. */
  schedulePreview(delay = PREVIEW_DELAY) {
    clearTimeout(this._previewTimer);
    if (!this.previewMethod || !this.canEdit || !this.dirty) {
      return;
    }

    this._isPreviewDue = true;
    this._previewTimer = setTimeout(() => {
      this.preview().catch(showPreviewError);
    }, delay);
  }

  /**
   * Leaves fields to the server until the user edits one: previews send them
   * empty, so the server fills them. A document without a preview clears
   * them, so its save sends them empty.
   */
  leaveToServer(fieldnames: string[]) {
    for (const fieldname of fieldnames) {
      this._serverFilled.add(fieldname);
      if (!this.isPreviewed) {
        this[fieldname] = null;
      }
    }
  }

  /** Whether the server previews the document, or the document its row is in. */
  get isPreviewed(): boolean {
    return !!(this.previewMethod ?? this.parentdoc?.previewMethod);
  }

  /** Shows what the server would fill for the unsaved values; dropped if they changed meanwhile. */
  async preview() {
    clearTimeout(this._previewTimer);
    if (!this.previewMethod || !this.canEdit) {
      return;
    }

    const edits = this._edits;
    const document = this.getMethodDocument({
      keepRowNames: true,
      clearServerFilled: true,
    });
    const previewed = await this._fetchPreview(document);
    if (edits !== this._edits || !this.dirty) {
      return;
    }

    this._isPreviewDue = false;
    if (previewed) {
      this.applyPreview(this.toDocValues(previewed));
    }
  }

  /** The server's preview, or none for a document changed elsewhere, which only its save reports. */
  async _fetchPreview(document: DocValues): Promise<DocValues | undefined> {
    try {
      return await api.runDocMethod(this.previewMethod!, document);
    } catch (error) {
      if (error instanceof ConflictError) {
        return;
      }

      throw error;
    }
  }

  /**
   * Takes the values the server returned, and remembers the ones it filled
   * as the server's. A value the user entered and the server only corrected,
   * like a return's sign, stays the user's.
   */
  applyPreview(previewed: DocValueMap) {
    for (const field of this.schema.fields) {
      const { fieldname } = field;
      if (field.meta || fieldname === 'name') {
        continue;
      }

      if (field.fieldtype === 'Table') {
        const rows = previewed[fieldname] as DocValueMap[] | undefined;
        if (rows) {
          this._applyPreviewRows(fieldname, rows);
        }

        continue;
      }

      // Frappe leaves empty values out of the documents it sends.
      const value = previewed[fieldname] ?? toDocValue(null, field, this.fyo);
      if (!isSameValue(value as DocValue, this[fieldname] as DocValue)) {
        this._rememberFilled(fieldname);
        this[fieldname] = value;
      }
    }
  }

  /** A value the server filled: one it was sent empty. */
  _rememberFilled(fieldname: string) {
    const sent = this[fieldname] as DocValue;
    if (this._serverFilled.has(fieldname) || !isDocValueTruthy(sent)) {
      this._serverFilled.add(fieldname);
    }
  }

  /** Rows as the server returned them: sent rows by name, and any rows it added. */
  _applyPreviewRows(fieldname: string, previewedRows: DocValueMap[]) {
    const rows = (this[fieldname] ?? []) as FrappeDoc[];
    const nextRows = previewedRows.map((values) => {
      const row = rows.find(({ name }) => name === values.name);
      if (!row) {
        return this._getChildDoc({ ...values, name: undefined }, fieldname);
      }

      row.applyPreview(values);
      return row;
    });
    setChildDocIdx(nextRows);
    this[fieldname] = nextRows;
  }
}

export interface FrappeValueOptions {
  /** Sends every row's name, for a method that matches its answer to the rows sent. */
  keepRowNames?: boolean;
  /** Leaves out the values a preview filled, so the server fills them again. */
  clearServerFilled?: boolean;
}

/** Whether a previewed value is the one the document has; dates by their time. */
function isSameValue(previewed: DocValue, current: DocValue): boolean {
  if (previewed instanceof Date && current instanceof Date) {
    return previewed.getTime() === current.getTime();
  }

  return areDocValuesEqual(previewed, current);
}

async function showPreviewError(error: unknown) {
  const { showToast } = await import('src/utils/interactive');
  const message = error instanceof Error ? error.message : String(error);
  showToast({ type: 'error', message });
}
