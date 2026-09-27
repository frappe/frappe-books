import { Fyo, t } from 'fyo';
import { Converter } from 'fyo/core/converter';
import { DocValue, DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { getEmptyValuesByFieldTypes } from 'fyo/utils';
import { ValidationError } from 'fyo/utils/errors';
import {
  Field,
  FieldType,
  FieldTypeEnum,
  OptionField,
  RawValue,
  Schema,
  TargetField,
} from 'schemas/types';
import { generateCSV, parseCSV } from 'utils/csvParser';
import { getValueMapFromList } from 'utils/index';

export type TemplateField = Field & TemplateFieldProps;

export interface ImportResults {
  success: string[];
  successOldName: string[];
  failed: { name: string; message: string }[];
}

type TemplateFieldProps = {
  schemaName: string;
  schemaLabel: string;
  fieldKey: string;
  parentSchemaChildField?: TargetField;
};

type ValueMatrixItem =
  | {
      value: DocValue;
      rawValue?: RawValue;
      error?: boolean;
    }
  | { value?: DocValue; rawValue: RawValue; error?: boolean };

type ValueMatrix = ValueMatrixItem[][];

/** Child rows by doc name, child schema name and child row name. */
type ChildTableMap = Record<string, Record<string, Map<string, DocValueMap>>>;

const skippedFieldsTypes: FieldType[] = [
  FieldTypeEnum.AttachImage,
  FieldTypeEnum.Attachment,
  FieldTypeEnum.Table,
];

/**
 * Tool that
 * - Can make bulk entries for any kind of Doc
 * - Takes in unstructured CSV data, converts it into Docs
 * - Saves and or Submits the converted Docs
 */
export class Importer {
  schemaName: string;
  fyo: Fyo;

  /**
   * List of template fields that have been assigned a column, in
   * the order they have been assigned.
   */
  assignedTemplateFields: (string | null)[];

  /**
   * Map of all the template fields that can be imported.
   */
  templateFieldsMap: Map<string, TemplateField>;

  /**
   * Maps user-facing CSV headers to their template field keys.
   */
  templateFieldKeysByHeader: Map<string, string>;

  /**
   * Maps template field keys to the headers used in generated CSV files.
   */
  templateHeadersByFieldKey: Map<string, string>;

  /**
   * Map of Fields that have been picked, i.e.
   * - Fields which will be included in the template
   * - Fields for which values will be provided
   */
  templateFieldsPicked: Map<string, boolean>;

  /**
   * Matrix containing the raw values which will be converted to
   * doc values before importing.
   */
  valueMatrix: ValueMatrix;

  /**
   * Data from the valueMatrix rows will be converted into Docs
   * which will be stored in this array.
   */
  docs: Doc[];

  /**
   * Used if an options field is imported where the import data
   * provided maybe the label and not the value
   */
  optionsMap: {
    values: Record<string, Set<string>>;
    labelValueMap: Record<string, Record<string, string>>;
  };

  constructor(schemaName: string, fyo: Fyo) {
    if (!fyo.schemaMap[schemaName]) {
      throw new ValidationError(
        `Invalid schemaName ${schemaName} found in importer`
      );
    }

    this.schemaName = schemaName;
    this.fyo = fyo;
    this.docs = [];
    this.valueMatrix = [];
    this.optionsMap = {
      values: {},
      labelValueMap: {},
    };

    const templateFields = getTemplateFields(schemaName, fyo);
    this.assignedTemplateFields = templateFields.map((f) => f.fieldKey);
    this.templateFieldsMap = new Map();
    this.templateFieldsPicked = new Map();

    templateFields.forEach((f) => {
      this.templateFieldsMap.set(f.fieldKey, f);
      this.templateFieldsPicked.set(f.fieldKey, true);
    });

    const { fieldKeysByHeader, headersByFieldKey } =
      getTemplateHeaderMaps(templateFields);
    this.templateFieldKeysByHeader = fieldKeysByHeader;
    this.templateHeadersByFieldKey = headersByFieldKey;
  }

  selectFile(data: string): boolean {
    try {
      const parsed = parseCSV(data);
      this.selectParsed(parsed);
    } catch {
      return false;
    }

    return true;
  }

  async checkLinks() {
    const doesNotExist = [];
    for (const [target, values] of this.getLinkValues()) {
      for (const name of await this.getMissingNames(target, values)) {
        doesNotExist.push({
          schemaName: target,
          schemaLabel: this.fyo.schemaMap[target]?.label,
          name,
        });
      }
    }

    return doesNotExist;
  }

  /** Values of the picked Link columns, grouped by linked schema. */
  getLinkValues(): Map<string, Set<string>> {
    const linkColumns = this.assignedTemplateFields
      .map((key, index) => ({
        index,
        tf: this.templateFieldsMap.get(key ?? ''),
      }))
      .filter(({ tf }) => tf?.fieldtype === FieldTypeEnum.Link) as {
      index: number;
      tf: TargetField;
    }[];

    const linkValues: Map<string, Set<string>> = new Map();
    for (const row of this.valueMatrix) {
      for (const { tf, index } of linkColumns) {
        const value = row[index]?.value;
        if (typeof value !== 'string' || !value) {
          continue;
        }

        if (!linkValues.has(tf.target)) {
          linkValues.set(tf.target, new Set());
        }

        linkValues.get(tf.target)!.add(value);
      }
    }

    return linkValues;
  }

  async getMissingNames(target: string, names: Set<string>) {
    const existing = await this.fyo.db.getAll(target, {
      fields: ['name'],
      filters: { name: ['in', [...names]] },
    });
    const existingNames = new Set(existing.map(({ name }) => name));
    return [...names].filter((name) => !existingNames.has(name));
  }

  /** Labels of the template fields assigned to more than one column. */
  getDuplicateColumns(): string[] {
    const assigned = new Set<string>();
    const duplicates = new Set<string>();
    for (const key of this.assignedTemplateFields) {
      const tf = this.templateFieldsMap.get(key ?? '');
      if (!key || !tf) {
        continue;
      }

      if (assigned.has(key)) {
        duplicates.add(getColumnLabel(tf));
      }

      assigned.add(key);
    }

    return [...duplicates];
  }

  /** Labels of the required template fields no column is assigned to. */
  getMissingRequiredColumns(): string[] {
    const assigned = new Set(this.assignedTemplateFields);
    return [...this.templateFieldsMap.values()]
      .filter((tf) => tf.required && !assigned.has(tf.fieldKey))
      .map(getColumnLabel);
  }

  /** Includes or leaves out a template field; leaving one out frees its column. */
  pickColumn(fieldKey: string, picked: boolean) {
    this.templateFieldsPicked.set(fieldKey, picked);
    const index = this.assignedTemplateFields.indexOf(fieldKey);
    if (picked || index < 0) {
      return;
    }

    this.assignedTemplateFields[index] = null;
    this.reassignTemplateFields();
  }

  /** Assigns the picked fields to the columns in order, until data is loaded. */
  reassignTemplateFields() {
    if (this.valueMatrix.length) {
      return;
    }

    const picked = [...this.templateFieldsPicked]
      .filter(([, isPicked]) => isPicked)
      .map(([key]) => key);
    this.assignedTemplateFields = this.assignedTemplateFields.map(
      (_, index) => picked[index] ?? null
    );
  }

  /** Leaves only the rows whose name is not among the imported names. */
  keepRowsNotImported(importedNames: string[]) {
    const nameIndex = this.assignedTemplateFields.indexOf(
      `${this.schemaName}.name`
    );
    this.valueMatrix = this.valueMatrix.filter((row) => {
      const name = row[nameIndex].value;
      return typeof name === 'string' && !importedNames.includes(name);
    });
  }

  checkCellErrors() {
    const assigned = this.assignedTemplateFields
      .map((key, index) => ({
        key,
        index,
        tf: this.templateFieldsMap.get(key ?? ''),
      }))
      .filter(({ key, tf }) => !!key && !!tf) as {
      key: string;
      index: number;
      tf: TemplateField;
    }[];

    const cellErrors = [];
    for (let i = 0; i < this.valueMatrix.length; i++) {
      const row = this.valueMatrix[i];
      for (const { tf, index } of assigned) {
        if (!row[index]?.error) {
          continue;
        }

        const rowLabel = this.fyo.t`Row ${i + 1}`;
        const columnLabel = getColumnLabel(tf);
        cellErrors.push(`(${rowLabel}, ${columnLabel})`);
      }
    }

    return cellErrors;
  }

  populateDocs() {
    const { dataMap, childTableMap } =
      this.getDataAndChildTableMapFromValueMatrix();

    const schema = this.fyo.schemaMap[this.schemaName];
    const targetFieldnameMap = schema?.fields
      .filter((f) => f.fieldtype === FieldTypeEnum.Table)
      .reduce((acc, f) => {
        const { target, fieldname } = f as TargetField;
        acc[target] = fieldname;
        return acc;
      }, {} as Record<string, string>);

    for (const [name, data] of dataMap.entries()) {
      const doc = this.fyo.doc.getNewDoc(this.schemaName, data, false);
      for (const schemaName in targetFieldnameMap) {
        const fieldname = targetFieldnameMap[schemaName];
        const childTable = childTableMap[name]?.[schemaName];
        if (!childTable) {
          continue;
        }

        for (const childData of childTable.values()) {
          doc.push(fieldname, childData);
        }
      }

      this.docs.push(doc);
    }
  }

  /** Parent values by doc name, and child rows by doc name and child schema. */
  getDataAndChildTableMapFromValueMatrix() {
    const dataMap: Map<string, DocValueMap> = new Map();
    const childTableMap: ChildTableMap = {};
    const nameIndices = this.getNameIndices();
    const nameIndex = nameIndices[this.schemaName];

    for (const [rowIndex, row] of this.valueMatrix.entries()) {
      const name = row[nameIndex]?.value;
      if (typeof name !== 'string') {
        continue;
      }

      for (const [column, vmi] of row.entries()) {
        const tf = this.templateFieldsMap.get(
          this.assignedTemplateFields[column] ?? ''
        );
        if (!tf || vmi.value == null) {
          continue;
        }

        const values = this.fyo.schemaMap[tf.schemaName]?.isChild
          ? getChildValues(
              childTableMap,
              name,
              tf.schemaName,
              getChildName(row, nameIndices[tf.schemaName], tf, rowIndex)
            )
          : getOrSet(dataMap, name, {});
        values[tf.fieldname] = vmi.value;
      }
    }

    return { dataMap, childTableMap };
  }

  /** The column of each schema's name field. */
  getNameIndices(): Record<string, number> {
    const nameIndices: Record<string, number> = {};
    for (const [index, key] of this.assignedTemplateFields.entries()) {
      if (key?.endsWith('.name')) {
        nameIndices[key.split('.')[0]] = index;
      }
    }

    return nameIndices;
  }

  selectParsed(parsed: string[][]): void {
    if (!parsed?.length) {
      return;
    }

    let startIndex = -1;
    let templateFieldsAssigned;

    for (let i = 3; i >= 0; i--) {
      const row = parsed[i];
      if (!row?.length) {
        continue;
      }

      templateFieldsAssigned = this.assignTemplateFieldsFromParsedRow(row);
      if (templateFieldsAssigned) {
        startIndex = i + 1;
        break;
      }
    }

    if (!templateFieldsAssigned) {
      this.clearAndResizeAssignedTemplateFields(parsed[0].length);
    }

    if (startIndex === -1) {
      startIndex = 0;
    }

    this.assignValueMatrixFromParsed(parsed.slice(startIndex));
  }

  clearAndResizeAssignedTemplateFields(size: number) {
    for (let i = 0; i < size; i++) {
      if (i >= this.assignedTemplateFields.length) {
        this.assignedTemplateFields.push(null);
      } else {
        this.assignedTemplateFields[i] = null;
      }
    }
  }

  assignValueMatrixFromParsed(parsed: string[][]) {
    if (!parsed?.length) {
      return;
    }

    for (const row of parsed) {
      this.pushToValueMatrixFromParsedRow(row);
    }
  }

  pushToValueMatrixFromParsedRow(row: string[]) {
    const vmRow: ValueMatrix[number] = [];
    for (let i = 0; i < row.length; i++) {
      const rawValue = row[i];
      const index = Number(i);

      if (index >= this.assignedTemplateFields.length) {
        this.assignedTemplateFields.push(null);
      }

      vmRow.push(this.getValueMatrixItem(index, rawValue));
    }

    this.valueMatrix.push(vmRow);
  }

  setTemplateField(index: number, key: string | null) {
    if (index >= this.assignedTemplateFields.length) {
      this.assignedTemplateFields.push(key);
    } else {
      this.assignedTemplateFields[index] = key;
    }

    this.updateValueMatrixColumn(index);
  }

  updateValueMatrixColumn(index: number) {
    for (const row of this.valueMatrix) {
      const vmi = this.getValueMatrixItem(index, row[index].rawValue ?? null);

      if (index >= row.length) {
        row.push(vmi);
      } else {
        row[index] = vmi;
      }
    }
  }

  getValueMatrixItem(index: number, rawValue: RawValue) {
    const vmi: ValueMatrixItem = { rawValue };
    const key = this.assignedTemplateFields[index];
    if (!key) {
      return vmi;
    }

    const tf = this.templateFieldsMap.get(key);
    if (!tf) {
      return vmi;
    }

    if (vmi.rawValue === '') {
      vmi.value = null;
      return vmi;
    }

    if ('options' in tf && typeof vmi.rawValue === 'string') {
      return this.getOptionFieldVmi(vmi, tf);
    }

    try {
      vmi.value = Converter.toDocValue(rawValue, tf, this.fyo);
    } catch {
      vmi.error = true;
    }

    return vmi;
  }

  getOptionFieldVmi(
    { rawValue }: ValueMatrixItem,
    tf: OptionField & TemplateFieldProps
  ): ValueMatrixItem {
    if (typeof rawValue !== 'string') {
      return { error: true, value: null, rawValue };
    }

    if (!tf?.options.length) {
      return { value: null, rawValue };
    }

    if (!this.optionsMap.labelValueMap[tf.fieldKey]) {
      const values = new Set(tf.options.map(({ value }) => value));
      const labelValueMap = getValueMapFromList(tf.options, 'label', 'value');

      this.optionsMap.labelValueMap[tf.fieldKey] = labelValueMap;
      this.optionsMap.values[tf.fieldKey] = values;
    }

    const hasValue = this.optionsMap.values[tf.fieldKey].has(rawValue);
    if (hasValue) {
      return { value: rawValue, rawValue };
    }

    const value = this.optionsMap.labelValueMap[tf.fieldKey][rawValue];
    if (value) {
      return { value, rawValue };
    }

    return { error: true, value: null, rawValue };
  }

  /** Assigns the columns a header row names; false when the row is not a header row. */
  assignTemplateFieldsFromParsedRow(row: string[]): boolean {
    if (!this.isHeaderRow(row)) {
      return false;
    }

    for (const [index, value] of row.entries()) {
      this.assignedTemplateFields[index] = this.getPickedFieldKey(value);
    }

    return true;
  }

  isHeaderRow(row: string[]): boolean {
    const values = row.filter(Boolean);
    return (
      row.some((value) => this.templateFieldsMap.has(value)) ||
      (values.length > 0 &&
        values.every((value) => this.templateFieldKeysByHeader.has(value)))
    );
  }

  /** The picked template field that a field key or header names. */
  getPickedFieldKey(value: string): string | null {
    const key = this.templateFieldsMap.has(value)
      ? value
      : this.templateFieldKeysByHeader.get(value);
    return key && this.templateFieldsPicked.get(key) ? key : null;
  }

  addRow() {
    const valueRow: ValueMatrix[number] = this.assignedTemplateFields.map(
      (key) => {
        key ??= '';
        const { fieldtype } = this.templateFieldsMap.get(key) ?? {};
        let value = null;
        if (fieldtype) {
          value = getEmptyValuesByFieldTypes(fieldtype, this.fyo);
        }

        return { value };
      }
    );

    this.valueMatrix.push(valueRow);
  }

  removeRow(index: number) {
    this.valueMatrix = this.valueMatrix.filter((_, i) => i !== index);
  }

  getCSVTemplate(): string {
    const headers: string[] = [];

    for (const [fieldKey, picked] of this.templateFieldsPicked.entries()) {
      if (!picked) {
        continue;
      }

      const header = this.templateHeadersByFieldKey.get(fieldKey);
      if (!header) {
        continue;
      }

      headers.push(header);
    }

    return generateCSV([headers]);
  }
}

function getChildName(
  row: ValueMatrix[number],
  nameIndex: number | undefined,
  tf: TemplateField,
  rowIndex: number
): string {
  const childName = nameIndex === undefined ? null : row[nameIndex]?.value;
  return typeof childName === 'string' ? childName : `${tf.schemaName}-${rowIndex}`;
}

function getChildValues(
  childTableMap: ChildTableMap,
  name: string,
  schemaName: string,
  childName: string
): DocValueMap {
  childTableMap[name] ??= {};
  childTableMap[name][schemaName] ??= new Map();
  return getOrSet(childTableMap[name][schemaName], childName, {});
}

function getOrSet<K, V>(map: Map<K, V>, key: K, value: V): V {
  if (!map.has(key)) {
    map.set(key, value);
  }

  return map.get(key)!;
}

function getTemplateHeaderMaps(fields: TemplateField[]) {
  const headerCounts = new Map<string, number>();
  for (const field of fields) {
    const header = getColumnLabel(field);
    headerCounts.set(header, (headerCounts.get(header) ?? 0) + 1);
  }

  const fieldKeysByHeader = new Map<string, string>();
  const headersByFieldKey = new Map<string, string>();
  for (const field of fields) {
    const baseHeader = getColumnLabel(field);
    let header = baseHeader;
    if ((headerCounts.get(baseHeader) ?? 0) > 1) {
      header = `${baseHeader} (${field.schemaLabel})`;
    }

    if (fieldKeysByHeader.has(header)) {
      header = `${baseHeader} [${field.fieldKey}]`;
    }

    fieldKeysByHeader.set(header, field.fieldKey);
    headersByFieldKey.set(field.fieldKey, header);
  }

  return { fieldKeysByHeader, headersByFieldKey };
}

function getTemplateFields(schemaName: string, fyo: Fyo): TemplateField[] {
  const fields: TemplateField[] = [];
  const schemas: { schema: Schema; parentSchemaChildField?: TargetField }[] = [
    { schema: fyo.schemaMap[schemaName]! },
  ];
  while (schemas.length) {
    const { schema, parentSchemaChildField } = schemas.pop()!;
    for (const field of schema.fields) {
      if (shouldSkipField(field, schema)) {
        continue;
      }

      if (field.fieldtype === FieldTypeEnum.Table) {
        schemas.push({
          schema: fyo.schemaMap[field.target]!,
          parentSchemaChildField: field,
        });
      }

      if (!skippedFieldsTypes.includes(field.fieldtype)) {
        fields.push(getTemplateField(field, schema, parentSchemaChildField));
      }
    }
  }

  return fields;
}

/** An editable copy of the field. Child rows are checked on save, so none is required here. */
function getTemplateField(
  field: Field,
  schema: Schema,
  parentSchemaChildField?: TargetField
): TemplateField {
  return {
    ...field,
    readOnly: false,
    required: schema.isChild ? false : field.required,
    schemaName: schema.name,
    schemaLabel: schema.label,
    fieldKey: `${schema.name}.${field.fieldname}`,
    parentSchemaChildField,
  };
}

export function getColumnLabel(field: TemplateField): string {
  if (field.parentSchemaChildField) {
    return `${field.label} (${field.parentSchemaChildField.label})`;
  }

  return field.label;
}

function shouldSkipField(field: Field, schema: Schema): boolean {
  if (field.computed || field.meta) {
    return true;
  }

  if (schema.naming === 'numberSeries' && field.fieldname === 'name') {
    return false;
  }

  if (field.hidden) {
    return true;
  }

  if (field.readOnly && !field.required) {
    return true;
  }

  return false;
}

/** Save `doc`, then submit it if asked, and record the outcome in `results`. */
export async function importDoc(
  doc: Doc,
  shouldSubmit: boolean,
  results: ImportResults
): Promise<void> {
  const oldName = doc.name ?? '';
  try {
    await doc.sync();
  } catch (error) {
    results.failed.push({ name: doc.name!, message: getMessage(error) });
    return;
  }

  // A saved draft must not be imported again by Fix Failed.
  results.successOldName.push(oldName);
  try {
    if (shouldSubmit) {
      await doc.submit();
    }
  } catch (error) {
    const message = getMessage(error);
    results.failed.push({
      name: doc.name!,
      message: t`Saved as draft, but submit failed: ${message}`,
    });
    return;
  }

  results.success.push(doc.name!);
}

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
