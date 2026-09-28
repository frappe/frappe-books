import { Fyo } from 'fyo';
import { Converter } from 'fyo/core/converter';
import { DocValue, DocValueMap, RawValueMap } from 'fyo/core/types';
import { MandatoryError, NotFoundError } from 'fyo/utils/errors';
import Observable from 'fyo/utils/observable';
import {
  DynamicLinkField,
  Field,
  FieldTypeEnum,
  RawValue,
  Schema,
  TargetField,
} from 'schemas/types';
import { getIsNullOrUndef, getMapFromList, getRandomString } from 'utils';
import { markRaw, reactive } from 'vue';
import { isPesa } from '../utils/index';
import {
  areDocValuesEqual,
  getFieldDefault,
  getFormulaSequence,
  getMissingMandatoryMessage,
  getPreDefaultValues,
  setChildDocIdx,
  shouldApplyFormula,
} from './helpers';
import {
  Action,
  ChangeArg,
  CurrenciesMap,
  DefaultMap,
  DocumentActionWarning,
  EmptyMessageMap,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ListViewSettings,
  ListsMap,
  ReadOnlyMap,
  RequiredMap,
  TreeViewSettings,
  ValidationMap,
} from './types';
import { validateOptions, validateRequired } from './validationFunction';

export class Doc extends Observable<DocValue | Doc[]> {
   
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

  links?: Record<string, Doc>;
  _dirty = true;
  _notInserted = true;

  _syncPromise?: Promise<Doc>;

  constructor(
    schema: Schema,
    data: DocValueMap,
    fyo: Fyo,
    convertToDocValue = true
  ) {
    super();
    this.fyo = markRaw(fyo);
    this.schema = schema;
    this.fieldMap = getMapFromList(schema.fields, 'fieldname');

    if (this.schema.isSingle) {
      this.name = this.schemaName;
    }

    this._setDefaults();
    this._setValuesWithoutChecks(data, convertToDocValue);
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
    if (this.notInserted || !this.fyo.can(this.schemaName, 'delete')) {
      return false;
    }

    if (this.schema.isSingle) {
      return false;
    }

    if (this.schema.isChild) {
      return false;
    }

    if (!this.schema.isSubmittable) {
      return true;
    }

    if (this.schema.isSubmittable && this.isCancelled) {
      return true;
    }

    if (this.schema.isSubmittable && !this.isSubmitted) {
      return true;
    }

    return false;
  }

  get canEdit(): boolean {
    if (this.schema.isSubmittable && (this.submitted || this.cancelled)) {
      return false;
    }

    return this.canWrite;
  }

  get canSave() {
    const isSubmittable = this.schema.isSubmittable;
    if (isSubmittable && !!this.submitted) {
      return false;
    }

    if (isSubmittable && !!this.cancelled) {
      return false;
    }

    if (!this.dirty) {
      return false;
    }

    if (this.schema.isChild) {
      return false;
    }

    return this.canWrite;
  }

  get canSubmit() {
    if (!this.schema.isSubmittable || !this.fyo.can(this.schemaName, 'submit')) {
      return false;
    }

    if (this.dirty) {
      return false;
    }

    if (this.notInserted) {
      return false;
    }

    if (!!this.submitted) {
      return false;
    }

    if (!!this.cancelled) {
      return false;
    }

    return true;
  }

  get canCancel() {
    if (!this.schema.isSubmittable || !this.fyo.can(this.schemaName, 'cancel')) {
      return false;
    }

    if (this.dirty) {
      return false;
    }

    if (this.notInserted) {
      return false;
    }

    if (!!this.cancelled) {
      return false;
    }

    if (!this.submitted) {
      return false;
    }

    return true;
  }

  /** Create for a new document and write for a saved one. */
  get canWrite(): boolean {
    if (this.schema.isChild) {
      // A row is saved with its parent; a detached row is never saved.
      return this.parentdoc?.canWrite ?? true;
    }

    return this.fyo.can(this.schemaName, this.notInserted ? 'create' : 'write');
  }

  _setValuesWithoutChecks(data: DocValueMap, convertToDocValue: boolean) {
    for (const field of this.schema.fields) {
      const { fieldname, fieldtype } = field;
      const value = data[field.fieldname];

      if (Array.isArray(value)) {
        for (const row of value) {
          this.push(fieldname, row, convertToDocValue);
        }
      } else if (
        fieldtype === FieldTypeEnum.Currency &&
        typeof value === 'number'
      ) {
        this[fieldname] = this.fyo.pesa(value);
      } else if (value !== undefined && !convertToDocValue) {
        this[fieldname] = value;
      } else if (value !== undefined) {
        this[fieldname] = Converter.toDocValue(
          value as RawValue,
          field,
          this.fyo
        );
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
    value?: DocValue | Doc[] | DocValueMap[],
    retriggerChildDocApplyChange = false
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
      await this._applyChange(fieldname, retriggerChildDocApplyChange);
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
    if (fieldname === 'numberSeries' && !this.notInserted) {
      return false;
    }

    if (value === undefined) {
      return false;
    }

    if (this.fieldMap[fieldname] === undefined) {
      return false;
    }

    const currentValue = this.get(fieldname);
    if (currentValue === undefined) {
      return true;
    }

    return !areDocValuesEqual(currentValue as DocValue, value as DocValue);
  }

  async _applyChange(
    changedFieldname: string,
    retriggerChildDocApplyChange?: boolean
  ): Promise<boolean> {
    await this._applyFormula(changedFieldname, retriggerChildDocApplyChange);
    await this.trigger('change', {
      doc: this,
      changed: changedFieldname,
    });

    return true;
  }

  refreshSchema(schemaName: string) {
    if (this.schemaName === schemaName) {
      const previousFields = this.fieldMap;
      this.schema = this.fyo.schemaMap[schemaName] ?? this.schema;
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

  _setDefaults(fields = this.schema.fields) {
    for (const field of fields) {
      let defaultValue: DocValue | Doc[] = getPreDefaultValues(
        field.fieldtype,
        this.fyo
      );

      const defaultFunction =
        this.fyo.models[this.schemaName]?.defaults?.[field.fieldname];
      if (defaultFunction !== undefined) {
        defaultValue = defaultFunction(this);
      } else if (field.default !== undefined) {
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

  push(
    fieldname: string,
    docValueMap: Doc | DocValueMap | RawValueMap = {},
    convertToDocValue = false
  ) {
    const childDocs = [
      (this[fieldname] ?? []) as Doc[],
      this._getChildDoc(docValueMap, fieldname, convertToDocValue),
    ].flat();

    setChildDocIdx(childDocs);
    this[fieldname] = childDocs;
  }

  _setChildDocsParent() {
    for (const { fieldname } of this.tableFields) {
      const value = this.get(fieldname);
      if (!Array.isArray(value)) {
        continue;
      }

      for (const childDoc of value) {
        if (childDoc.parent) {
          continue;
        }

        childDoc.parent = this.name;
      }
    }
  }

  _getChildDoc(
    docValueMap: Doc | DocValueMap | RawValueMap,
    fieldname: string,
    convertToDocValue = false
  ): Doc {
    if (!this.name && this.schema.naming !== 'manual') {
      this.name = this.fyo.doc.getTemporaryName(this.schema);
    }

    docValueMap.name ??= getRandomString();

    // Child Meta Fields
    docValueMap.parent ??= this.name;
    docValueMap.parentSchemaName ??= this.schemaName;
    docValueMap.parentFieldname ??= fieldname;

    if (docValueMap instanceof Doc) {
      docValueMap.parentdoc ??= this;
      return docValueMap;
    }

    const childSchemaName = (this.fieldMap[fieldname] as TargetField).target;
    const childDoc = this.fyo.doc.getNewDoc(
      childSchemaName,
      docValueMap,
      false,
      undefined,
      undefined,
      convertToDocValue
    );
    childDoc.parentdoc = this;
    return childDoc;
  }

  async _validateSync() {
    this._validateMandatory();
    await this._validateFields();
  }

  _validateMandatory() {
    const checkForMandatory: Doc[] = [this];
    const tableFields = this.schema.fields.filter(
      (f) => f.fieldtype === FieldTypeEnum.Table
    ) as TargetField[];

    for (const field of tableFields) {
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
    const fields = this.schema.fields;
    for (const field of fields) {
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

  getValidDict(filterMeta = false, filterComputed = false): DocValueMap {
    let fields = this.schema.fields;
    if (filterMeta) {
      fields = this.schema.fields.filter((f) => !f.meta);
    }

    if (filterComputed) {
      fields = fields.filter((f) => !f.computed);
    }

    const data: DocValueMap = {};
    for (const field of fields) {
      let value = this[field.fieldname] as DocValue | DocValueMap[];

      if (Array.isArray(value)) {
        value = value.map((doc) =>
          (doc as Doc).getValidDict(filterMeta, filterComputed)
        );
      }

      if (isPesa(value)) {
        value = value.copy();
      }

      if (value === null && this.schema.isSingle) {
        continue;
      }

      data[field.fieldname] = value;
    }
    return data;
  }

  _setBaseMetaValues() {
    if (this.schema.isSubmittable) {
      this.submitted = false;
      this.cancelled = false;
    }
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

  async _fetchSaved(): Promise<DocValueMap> {
    const data = await this.fyo.db.get(this.schemaName, this.name!);
    if (this.schema.isSingle && !data?.name) {
      data.name = this.name!;
    }

    if (!data?.name) {
      throw new NotFoundError(`Not Found: ${this.schemaName} ${this.name}`);
    }

    return data;
  }

  async _setLoadedValues(data: DocValueMap) {
    await this._syncValues(data);
    this._setDirty(false);
    this._notInserted = false;
  }

  /** Loads every linked doc; `loadAndGetLink` loads one. */
  async loadLinks() {
    const linkFields = this.schema.fields.filter(
      ({ fieldtype }) =>
        fieldtype === FieldTypeEnum.Link ||
        fieldtype === FieldTypeEnum.DynamicLink
    );

    for (const field of linkFields) {
      await this._loadLink(field);
    }
  }

  async _loadLink(field: Field) {
    if (field.fieldtype === FieldTypeEnum.Link) {
      return await this._loadLinkField(field);
    }

    if (field.fieldtype === FieldTypeEnum.DynamicLink) {
      return await this._loadDynamicLinkField(field);
    }
  }

  async _loadLinkField(field: TargetField) {
    const { fieldname, target } = field;
    const value = this.get(fieldname) as string | undefined;
    if (!value || !target) {
      return;
    }

    await this._loadLinkDoc(fieldname, target, value);
  }

  async _loadDynamicLinkField(field: DynamicLinkField) {
    const { fieldname, references } = field;
    const value = this.get(fieldname) as string | undefined;
    const reference = this.get(references) as string | undefined;
    if (!value || !reference) {
      return;
    }

    await this._loadLinkDoc(fieldname, reference, value);
  }

  async _loadLinkDoc(fieldname: string, schemaName: string, name: string) {
    const linkDoc = await this.fyo.doc.getDoc(schemaName, name);
    this.links ??= {};
    this.links[fieldname] = linkDoc;
  }

  async loadAndGetLink(fieldname: string): Promise<Doc | null> {
    if (!this?.[fieldname]) {
      return null;
    }

    if (this.links?.[fieldname]?.name !== this[fieldname]) {
      await this._loadLink(this.fieldMap[fieldname]);
    }

    return this.links?.[fieldname] ?? null;
  }

  async _syncValues(
    data: DocValueMap,
    savedAction?: DocumentActionWarning['action']
  ) {
    this._clearValues();
    this._setValuesWithoutChecks(data, false);
    const errors: unknown[] = [];
    try {
      await this._setComputedValuesFromFormulas();
    } catch (error) {
      if (!savedAction) {
        throw error;
      }
      errors.push(error);
    }
    this._dirty = false;
    const change = { doc: this };
    if (!savedAction) {
      this.trigger('change', change);
      return;
    }

    this._notInserted = false;
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

  async _setComputedValuesFromFormulas() {
    for (const field of this.schema.fields) {
      await this._setComputedValuesForChildren(field);
      if (!field.computed) {
        continue;
      }

      const value = await this._getValueFromFormula(field, this);
      this[field.fieldname] = value ?? null;
    }
  }

  async _setComputedValuesForChildren(field: Field) {
    if (field.fieldtype !== 'Table') {
      return;
    }

    const childDocs: Doc[] = (this[field.fieldname] as Doc[]) ?? [];
    for (const doc of childDocs) {
      await doc._setComputedValuesFromFormulas();
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
    const childFields = this.schema.fields.filter(
      (f) => f.fieldtype === FieldTypeEnum.Table
    ) as TargetField[];

    for (const field of childFields) {
      const childDocs = (this.get(field.fieldname) as Doc[]) ?? [];
      setChildDocIdx(childDocs);
    }
  }

  async runFormulas() {
    await this._applyFormula();
  }

  async _applyFormula(
    changedFieldname?: string,
    retriggerChildDocApplyChange?: boolean
  ): Promise<boolean> {
    let changed = await this._callAllTableFieldsApplyFormula(changedFieldname);
    changed =
      (await this._applyFormulaForFields(this, changedFieldname)) || changed;

    if (changed && retriggerChildDocApplyChange) {
      await this._callAllTableFieldsApplyFormula(changedFieldname);
      await this._applyFormulaForFields(this, changedFieldname);
    }

    return changed;
  }

  async _callAllTableFieldsApplyFormula(
    changedFieldname?: string
  ): Promise<boolean> {
    let changed = false;

    for (const { fieldname } of this.tableFields) {
      const childDocs = this.get(fieldname) as Doc[];
      if (!childDocs) {
        continue;
      }

      changed =
        (await this._callChildDocApplyFormula(childDocs, changedFieldname)) ||
        changed;
    }

    return changed;
  }

  async _callChildDocApplyFormula(
    childDocs: Doc[],
    fieldname?: string
  ): Promise<boolean> {
    let changed = false;
    for (const childDoc of childDocs) {
      if (!childDoc._applyFormula) {
        continue;
      }

      changed = (await childDoc._applyFormula(fieldname)) || changed;
    }

    return changed;
  }

  async _applyFormulaForFields(doc: Doc, fieldname?: string) {
    const formulaFields = getFormulaSequence(this.formulas)
      .map((f) => this.fyo.getField(this.schemaName, f))
      .filter(Boolean);

    let changed = false;
    for (const field of formulaFields) {
      const shouldApply = shouldApplyFormula(field, doc, fieldname);
      if (!shouldApply) {
        continue;
      }

      const newVal = await this._getValueFromFormula(field, doc, fieldname);
      const previousVal = doc.get(field.fieldname);
      const isSame = areDocValuesEqual(newVal as DocValue, previousVal);
      if (newVal === undefined || isSame) {
        continue;
      }

      doc[field.fieldname] = newVal;
      changed ||= true;
    }

    return changed;
  }

  async _getValueFromFormula(field: Field, doc: Doc, fieldname?: string) {
    const { formula } = doc.formulas[field.fieldname] ?? {};
    if (formula === undefined) {
      return;
    }

    let value = await formula(fieldname);

    if (Array.isArray(value) && field.fieldtype === FieldTypeEnum.Table) {
      value = value.map((row) => this._getChildDoc(row, field.fieldname));
    }

    return value;
  }

  async _preSync() {
    this._setChildDocsIdx();
    this._setChildDocsParent();
    await this._applyFormula();
    await this._validateSync();
    await this.trigger('validate');
  }

  async _insert() {
    this._setBaseMetaValues();
    await this._preSync();

    const validDict = this.getValidDict(false, true);
    const data = await this.fyo.db.insert(this.schemaName, validDict);
    await this._syncValues(data, 'save');

    return this;
  }

  async _update() {
    const expectedModified = this.modified;
    await this._preSync();

    let data = this.getValidDict(false, true);
    data = await this.fyo.db.update(
      this.schemaName,
      data,
      expectedModified instanceof Date ? expectedModified : undefined
    );
    await this._syncValues(data, 'save');

    return this;
  }

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

  async delete() {
    if (this.notInserted && this.name) {
      this.fyo.doc.removeFromCache(this.schemaName, this.name);
    }

    if (!this.canDelete) {
      return;
    }

    await this.trigger('beforeDelete');
    await this.fyo.db.delete(this.schemaName, this.name!);
    await this.trigger('afterDelete');

    this.fyo.doc.observer.trigger(`delete:${this.schemaName}`, this.name);
  }

  async submit() {
    if (!this.schema.isSubmittable || this.submitted || this.cancelled) {
      return;
    }

    const data = await this.fyo.db.runLifecycleAction(
      'submit',
      this.schemaName,
      this.name!
    );
    await this._syncValues(data, 'submit');
    this._notInserted = false;
    await this._notifyAfterAction('submit');
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
      ...(await this.fyo.doc.observer.triggerSafely(
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

  async cancel() {
    if (!this.schema.isSubmittable || !this.submitted || this.cancelled) {
      return;
    }

    const data = await this.fyo.db.runLifecycleAction(
      'cancel',
      this.schemaName,
      this.name!
    );
    await this._syncValues(data);
    this._notInserted = false;
    this.fyo.doc.observer.trigger(`cancel:${this.schemaName}`, this.name);
  }

  async rename(newName: string) {
    if (this.submitted) {
      return;
    }

    const oldName = this.name;
    await this.trigger('beforeRename', { oldName, newName });
    await this.fyo.db.rename(this.schemaName, this.name!, newName);
    this.name = newName;
    await this.trigger('afterRename', { oldName, newName });
    this.fyo.doc.observer.trigger(`rename:${this.schemaName}`, this.name);
  }

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

  duplicate(): Doc {
    const updateMap = this.getValidDict(true, true);
    for (const field in updateMap) {
      const value = updateMap[field];
      if (!Array.isArray(value)) {
        continue;
      }

      for (const row of value) {
        delete row.name;
      }
    }

    if (this.numberSeries) {
      delete updateMap.name;
    } else {
      updateMap.name = String(updateMap.name) + ' CPY';
    }

    const rawUpdateMap = this.fyo.db.converter.toRawValueMap(
      this.schemaName,
      updateMap
    ) as RawValueMap;

    return this.fyo.doc.getNewDoc(this.schemaName, rawUpdateMap, true);
  }

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
  async beforeRename() {}
  async afterRename() {}
  async beforeCancel() {}
  async afterCancel() {}
  async beforeDelete() {}
  async afterDelete() {}

  formulas: FormulaMap = {};
  validations: ValidationMap = {};
  required: RequiredMap = {};
  hidden: HiddenMap = {};
  readOnly: ReadOnlyMap = {};
  getCurrencies: CurrenciesMap = {};

  static lists: ListsMap = {};
  static filters: FiltersMap = {};
  static createFilters: FiltersMap = {}; // Used by the *Create* dropdown option
  static defaults: DefaultMap = {};
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
