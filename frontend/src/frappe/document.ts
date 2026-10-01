import type { DocValue, DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  areDocValuesEqual,
  getMissingMandatoryMessage,
  isDocValueTruthy,
  setChildDocIdx,
} from 'fyo/model/helpers';
import type { ChangeArg } from 'fyo/model/types';
import { ConflictError, ValueError } from 'fyo/utils/errors';
import type { Field, Schema } from 'schemas/types';
import { getRandomString } from 'utils';
import type { LinkedDoc } from 'utils/db/types';
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
 * A document Frappe serves directly. Its fields are the DocType's, it loads
 * and saves the whole document over /api/v2, and the server fills and checks
 * its values. A model that extends it only adds how /books presents it.
 */
export class FrappeDoc extends Doc {
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

  /** Rows the server holds; other rows are new and saved without their client names. */
  _savedRows = new Set<string>();
  /** Fields the last preview filled; the next preview fills them again until the user edits one. */
  _serverFilled = new Set<string>();
  _previewTimer?: ReturnType<typeof setTimeout>;
  /** An edit's fills are not back from the server yet. */
  _isPreviewDue = false;
  _edits = 0;

  get doctype(): string {
    return getDocType(this.schemaName).doctype;
  }

  /** The name Frappe knows the document by; a single's is its doctype. */
  get frappeName(): string {
    return this.schema.isSingle ? this.doctype : this.name!;
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

  /** Whether the DocField's depends_on, read_only_depends_on or mandatory_depends_on applies. */
  override hasFieldRule(fieldname: string, rule: FieldRule): boolean {
    const docfield = getDocType(this.schemaName).meta.fields.find(
      (field) => field.fieldname === fieldname
    );
    const condition = docfield && ruleConditions[rule](docfield);
    if (!condition) {
      return false;
    }

    const parent = (this.parentdoc as FrappeDoc | undefined)?.getEvalDoc();
    const isMet = evaluateCondition(condition, this.getEvalDoc(), parent);
    return rule === 'hidden' ? !isMet : isMet;
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

  override _getSchema(schemaName: string): Schema {
    return getDocType(schemaName).schema;
  }

  toDocValues(values: DocValues): DocValueMap {
    return toDocValues(this.schema, values, this.fyo, (target) => {
      return getDocType(target).schema;
    });
  }

  override async _fetchSaved(): Promise<DocValueMap> {
    return this.toDocValues(
      await api.getDocument(this.doctype, this.frappeName)
    );
  }

  override async _setLoadedValues(data: DocValueMap) {
    await super._setLoadedValues(data);
    this._rememberSavedRows();
  }

  /** A save takes the fills of the last edit, and those of missing values. */
  override async beforeSync() {
    await super.beforeSync();
    if (this.previewMethod && (this._isPreviewDue || this.hasMissingValues)) {
      await this.preview();
    }
  }

  /** Mandatory values are missing, which a preview may fill. */
  get hasMissingValues(): boolean {
    const rows = this.tableFields.flatMap(
      ({ fieldname }) => (this[fieldname] ?? []) as Doc[]
    );
    return [this, ...rows].some((doc) => !!getMissingMandatoryMessage(doc));
  }

  override async _insert() {
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

  override async _update() {
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
        ((this[fieldname] ?? []) as Doc[]).map((row) => row.name!)
      )
    );
  }

  override async submit() {
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
  override async cancel(linkedDocs: LinkedDoc[] = []) {
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

  override async delete() {
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

  /** A new copy with unsaved edits, without the fields the DocType marks no_copy. */
  override duplicate(): Promise<Doc> {
    const noCopy = getDocType(this.schemaName).meta.fields.filter(
      (field) => field.no_copy
    );
    const values = this.getDocValueCopy(noCopy.map((field) => field.fieldname));
    if (this.schema.naming === 'manual') {
      values.name = `${this.name!} CPY`;
    }

    return Promise.resolve(newFrappeDoc(this.schemaName, values));
  }

  getDocValueCopy(skipped: string[]): DocValueMap {
    const values: DocValueMap = {};
    for (const field of this.schema.fields) {
      if (
        field.meta ||
        field.fieldname === 'name' ||
        skipped.includes(field.fieldname)
      ) {
        continue;
      }

      const value = this[field.fieldname];
      values[field.fieldname] = Array.isArray(value)
        ? (value as FrappeDoc[]).map((row) => row.getDocValueCopy([]))
        : (value as DocValue);
    }

    return values;
  }

  override _getChildDoc(values: Doc | DocValueMap, fieldname: string): Doc {
    if (values instanceof Doc) {
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
    row.parentSchemaName = this.schemaName;
    return row;
  }

  /** Counts edits as they start, so a preview sent before one is dropped. */
  override async _applyChange(fieldname: string) {
    this._edits += 1;
    return await super._applyChange(fieldname);
  }

  override async change({ changed }: ChangeArg) {
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
    const parent = this.parentdoc as FrappeDoc | undefined;
    return !!(this.previewMethod ?? parent?.previewMethod);
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
