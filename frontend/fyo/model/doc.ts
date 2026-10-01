import { Fyo } from 'fyo';
import { DocValue, DocValueMap } from 'fyo/core/types';
import { MandatoryError } from 'fyo/utils/errors';
import Observable from 'fyo/utils/observable';
import type { DocPermission, DocPermissionMap } from 'fyo/utils/permissions';
import { Field, FieldTypeEnum, Schema, TargetField } from 'schemas/types';
import { getIsNullOrUndef, getMapFromList } from 'utils';
import type { LinkedDoc } from 'utils/db/types';
import { markRaw, reactive } from 'vue';
import { isPesa } from '../utils/index';
import {
  areDocValuesEqual,
  getFieldDefault,
  getMissingMandatoryMessage,
  getPreDefaultValues,
  setChildDocIdx,
} from './helpers';
import {
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
} from './types';
import { validateOptions, validateRequired } from './validationFunction';

/**
 * A document a form edits: its values, unsaved edits, rights and save
 * lifecycle. `FrappeDoc` loads and saves it through Frappe.
 */
export abstract class Doc extends Observable<DocValue | Doc[]> {
  name?: string;
  schema: Readonly<Schema>;
  fyo: Fyo;
  fieldMap: Record<string, Field>;

  /**
   * Fields below are used by child docs to maintain
   * reference w.r.t their parent doc.
   */
  idx?: number;
  parentdoc?: Doc;
  parentFieldname?: string;
  parentSchemaName?: string;

  /** The server's rights on this saved document; unset until a form loads them. */
  docPermissions?: DocPermissionMap;
  _dirty = true;
  _notInserted = true;

  _syncPromise?: Promise<Doc>;

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
    return reactive(this) as Doc;
  }

  get schemaName(): string {
    return this.schema.name;
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

  _setValuesWithoutChecks(data: DocValueMap) {
    for (const field of this.schema.fields) {
      const { fieldname, fieldtype } = field;
      const value = data[field.fieldname];

      if (Array.isArray(value)) {
        for (const row of value) {
          this.push(fieldname, row as Doc | DocValueMap);
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
    value?: DocValue | Doc[] | DocValueMap[]
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
        docValueMap[fieldname] as DocValue | Doc[]
      );
      hasSet ||= isSet;
    }

    return hasSet;
  }

  _canSet(
    fieldname: string,
    value?: DocValue | Doc[] | DocValueMap[]
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

  async _applyChange(changedFieldname: string): Promise<boolean> {
    await this.trigger('change', {
      doc: this,
      changed: changedFieldname,
    });

    return true;
  }

  refreshSchema(schemaName: string) {
    if (this.schemaName === schemaName) {
      const previousFields = this.fieldMap;
      this.schema = this._getSchema(schemaName) ?? this.schema;
      this.fieldMap = getMapFromList(this.schema.fields, 'fieldname');
      // Preserve entered values when a customization changes the definition.
      this._setDefaults(
        this.schema.fields.filter((field) => !previousFields[field.fieldname])
      );
    }

    for (const field of this.tableFields) {
      for (const row of (this[field.fieldname] as Doc[] | undefined) ?? []) {
        row.refreshSchema(schemaName);
      }
    }
  }

  abstract _getSchema(schemaName: string): Schema | undefined;

  /** Whether the doctype's own rules make a field hidden, read only or required. */
  abstract hasFieldRule(
    fieldname: string,
    rule: 'hidden' | 'readOnly' | 'required'
  ): boolean;

  _setDefaults(fields = this.schema.fields) {
    for (const field of fields) {
      let defaultValue: DocValue | Doc[] = getPreDefaultValues(
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
    const childDocs = ((this[fieldname] ?? []) as Doc[]).filter(
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

  push(fieldname: string, docValueMap: Doc | DocValueMap = {}) {
    const childDocs = [
      (this[fieldname] ?? []) as Doc[],
      this._getChildDoc(docValueMap, fieldname),
    ].flat();

    setChildDocIdx(childDocs);
    this[fieldname] = childDocs;
  }

  /** A row of the table `fieldname`, made from its values. */
  abstract _getChildDoc(values: Doc | DocValueMap, fieldname: string): Doc;

  async _validateSync() {
    this._validateMandatory();
    await this._validateFields();
  }

  _validateMandatory() {
    const checkForMandatory: Doc[] = [this];
    for (const field of this.tableFields) {
      const childDocs = this.get(field.fieldname) as Doc[];
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
  abstract _fetchSaved(): Promise<DocValueMap>;

  async _setLoadedValues(data: DocValueMap) {
    await this._syncValues(data);
    this._setDirty(false);
    this._notInserted = false;
  }

  async _syncValues(
    data: DocValueMap,
    savedAction?: DocumentActionWarning['action']
  ) {
    this._clearValues();
    this._setValuesWithoutChecks(data);
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
      const childDocs = (this.get(field.fieldname) as Doc[]) ?? [];
      setChildDocIdx(childDocs);
    }
  }

  async _preSync() {
    this._setChildDocsIdx();
    await this._validateSync();
    await this.trigger('validate');
  }

  abstract _insert(): Promise<Doc>;

  abstract _update(): Promise<Doc>;

  /** Saves the doc; a save already in progress is returned instead of starting another. */
  async sync(): Promise<Doc> {
    this._syncPromise ??= this._sync().finally(() => {
      this._syncPromise = undefined;
    });
    return await this._syncPromise;
  }

  async _sync(): Promise<Doc> {
    await this.trigger('beforeSync');
    const doc = this.notInserted ? await this._insert() : await this._update();
    this._notInserted = false;
    await this._notifyAfterAction('sync');
    return doc;
  }

  abstract delete(): Promise<void>;

  abstract submit(): Promise<void>;

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

  /** Cancels the doc after `linkedDocs`, the submitted documents that link to it. */
  abstract cancel(linkedDocs?: LinkedDoc[]): Promise<void>;

  async trigger(event: string, params?: unknown) {
    if (this[event]) {
      await (this[event] as (args: unknown) => Promise<void>)(params);
    }

    await super.trigger(event, params);
  }

  getSum(tablefield: string, childfield: string, convertToFloat = true) {
    const childDocs = (this.get(tablefield) as Doc[]) ?? [];
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

  async setAndSync(fieldname: string | DocValueMap, value?: DocValue | Doc[]) {
    await this.set(fieldname, value);
    return await this.sync();
  }

  /** A new copy of the doc, unsaved edits included, without the values Frappe marks no_copy. */
  abstract duplicate(): Promise<Doc>;

  /**
   * Lifecycle Methods
   *
   * Abstractish methods that are called using `this.trigger`.
   * These are to be overridden if required when subclassing.
   *
   * Refrain from running methods that call `this.sync`
   * in the `beforeLifecycle` methods.
   *
   * This may cause the lifecycle function to execute incorrectly.
   */

  /* eslint-disable @typescript-eslint/no-unused-vars */
  async change(ch: ChangeArg) {}
  async validate() {}
  async beforeSync() {}
  async afterSync() {}
  async beforeSubmit() {}
  async afterSubmit() {}
  async beforeCancel() {}
  async afterCancel() {}
  async beforeDelete() {}
  async afterDelete() {}

  validations: ValidationMap = {};
  required: RequiredMap = {};
  hidden: HiddenMap = {};
  readOnly: ReadOnlyMap = {};
  getCurrencies: CurrenciesMap = {};

  static lists: ListsMap = {};
  static filters: FiltersMap = {};
  static createFilters: FiltersMap = {}; // Used by the *Create* dropdown option
  static emptyMessages: EmptyMessageMap = {};

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {};
  }

  static getTreeSettings(fyo: Fyo): TreeViewSettings | void {
    return;
  }

  static getActions(fyo: Fyo): Action[] {
    return [];
  }
}
