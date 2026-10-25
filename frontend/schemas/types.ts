import type { Filter } from 'src/frappe/api';
import { PropertyEnum } from 'utils/types';

export type FieldType =
  | 'Data'
  | 'Select'
  | 'Link'
  | 'Date'
  | 'Datetime'
  | 'Table'
  | 'AutoComplete'
  | 'Check'
  | 'AttachImage'
  | 'DynamicLink'
  | 'Int'
  | 'Float'
  | 'Currency'
  | 'Text'
  | 'Color'
  | 'Button'
  | 'Attachment';

export const FieldTypeEnum: PropertyEnum<Record<FieldType, FieldType>> = {
  Data: 'Data',
  Select: 'Select',
  Link: 'Link',
  Date: 'Date',
  Datetime: 'Datetime',
  Table: 'Table',
  AutoComplete: 'AutoComplete',
  Check: 'Check',
  AttachImage: 'AttachImage',
  DynamicLink: 'DynamicLink',
  Int: 'Int',
  Float: 'Float',
  Currency: 'Currency',
  Text: 'Text',
  Color: 'Color',
  Button: 'Button',
  Attachment: 'Attachment',
};

type OptionFieldType = 'Select' | 'AutoComplete' | 'Color';
type TargetFieldType = 'Table' | 'Link';
type NumberFieldType = 'Int' | 'Float' | 'Currency';
type DynamicLinkFieldType = 'DynamicLink';
type BaseFieldType = Exclude<
  FieldType,
  TargetFieldType | DynamicLinkFieldType | OptionFieldType | NumberFieldType
>;

export type RawValue = string | number | boolean | null;

export interface BaseField {
  fieldname: string; // The DocType's fieldname
  fieldtype: BaseFieldType; // UI Descriptive field types that map to column types
  label: string; // Translateable UI facing name
  schemaName?: string; // Convenient access to schemaName incase just the field is passed
  required?: boolean; // Implies Not Null
  hidden?: boolean; // UI Facing config, whether field is shown in a form
  invisible?: boolean; // UI Facing config, whether field is invisible but occupies space
  readOnly?: boolean; // UI Facing config, whether field is editable
  setOnlyOnce?: boolean; // Read only once the document is saved
  description?: string; // UI Facing, translateable, used for inline documentation
  default?: RawValue; // Default value of a field, should match the db type
  placeholder?: string; // UI Facing config, form field placeholder
  groupBy?: string; // UI Facing used in dropdowns fields
  meta?: boolean; // Field is a meta field, i.e. only for the db, not UI
  filter?: boolean; // UI Facing config, whether to be used to filter the List.
  computed?: boolean; // Computed values are not stored in the database.
  insertOnly?: boolean; // A quick-entry value only a new document is saved with; its DocType does not hold it
  clientOnly?: boolean; // A value only the form shows; its model keeps it in DocType fields
  companyTable?: string; // A client field's per-company table, whose current company's row holds the field of the same name
  section?: string; // UI Facing config, for grouping by sections
  tab?: string; // UI Facing config, for grouping by tabs
  isCustom?: boolean; // Whether the field is a custom field
  bold?: boolean; // UI Facing config, whether to make the label bold
  sub_label?: string;
  filters?: Filter[]; // A Link's own search filters
  linkFilters?: Filter[]; // A Link's search filters, from its DocField's link_filters
  getOptions?: () => Promise<{ label: string; value: string }[]>;
  moreDetails?: 'picked' | 'ifMissing'; // Accessory mode: an ERPNext field with no Books position, in More details when picked or while mandatory and empty
  appTab?: string; // Accessory mode: the end tab of a custom field, `custom`, `other` or its app's title
  rows?: number; // UI Facing config, number of rows for Text field (default 3)
  narrow?: boolean; // UI Facing: a desktop form caps the field at max-w-xs (320px), like a tax template above its table
  control?: FieldControl; // The control an ERPNext field type shows in accessory mode; the fieldtype still holds the value
}

export type FieldControl =
  | 'TextEditor'
  | 'TableMultiSelect'
  | 'MultiSelectList'
  | 'Time'
  | 'Percent'
  | 'ReadOnly';

export type SelectOption = { value: string; label: string };
export interface OptionField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: OptionFieldType;
  options: SelectOption[];
  optionLabels?: Record<string, string>; // Labels of option values that need one
  states?: Record<string, string>; // DocType state colour by `status` option value
  allowCustom?: boolean;
  allowEmpty?: boolean; // Whether an empty line of the options offers no value, as in Frappe
}

export interface TargetField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: TargetFieldType;
  target: string; // Name of the table or group of tables to fetch values
  create?: boolean; // Whether to show Create in the dropdown
  card?: boolean; // Whether a form shows the linked record as a card
  edit?: boolean; // Whether the Table has quick editable columns
  emptyMessage?: string; // What a Table without rows says
  tableFields?: string[]; // A Table's own columns, where it shows other columns of its rows than their schema does, like a tax template's rows without amounts
  mobileTableFields?: string[]; // A Table's own phone row fields, with its own `tableFields`
}

export interface DynamicLinkField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: DynamicLinkFieldType;
  references: string; // Reference to an option field that links to schema
}

export interface NumberField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: NumberFieldType;
  minvalue?: number; // UI Facing used to restrict lower bound
  maxvalue?: number; // UI Facing used to restrict upper bound
  negativeInRed?: boolean; // UI Facing: a negative read-only value shows in red ink
  precision?: number; // A Percent's decimal places, from its DocField
}

export type Field =
  BaseField | OptionField | TargetField | DynamicLinkField | NumberField;

/** A phone table row as a block: titled by `title`, two `fields` side by side, and a `result` line under them. */
export interface MobileBlock {
  title: string;
  fields: [string, string];
  result: string;
}

export type Naming = 'autoincrement' | 'random' | 'numberSeries' | 'manual';

export interface Schema {
  name: string; // Schema name, e.g. SalesInvoice
  label: string; // Translateable UI facing name
  fields: Field[]; // Maps to database columns
  isTree?: boolean; // Used for nested set, eg for Chart of Accounts
  isChild?: boolean; // Indicates a child table, i.e table with "parent" FK column
  isSingle?: boolean; // A single, like a settings DocType
  tableFields?: string[]; // Used for displaying childTableFields
  mobileTableFields?: string[]; // A phone row's title, meta and amount fields, where they differ from tableFields
  mobileRowDetail?: string; // The field a phone row shows under its amount
  mobileLabelledFields?: string[]; // Phone row fields shown with their labels; the amount's label goes under it
  formColumns?: 3; // A desktop form's field columns, where it has three instead of two
  mobileFieldPairs?: [string, string][]; // Fields a phone form shows side by side, like a party's type and name
  mobileBlock?: MobileBlock; // A phone table's rows as blocks of fields instead of list rows
  isSubmittable?: boolean; // For transactional types, values considered only after submit
  quickEditFields?: string[]; // Used to get fields for the quickEditForm
  fileFields?: string[]; // Fields of export and import files, in order
  linkDisplayField?: string; // Display field if inline editable
  create?: boolean; // Whether the user can create an entry from the ListView
  naming?: Naming; // Used for assigning name, default is 'random' else 'numberSeries' if present
  titleField?: string; // Main display field
}
