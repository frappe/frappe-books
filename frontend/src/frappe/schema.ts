import { getFieldProperties, isReferenceField } from './fieldProperties';
import type { Field, Naming, OptionField, Schema } from 'schemas/types';
import type { Filter } from './api';
import type { DocField, DocTypeMeta } from './meta';

/** What a Frappe-backed model shows that its DocType has no property for. */
export interface Presentation {
  label: string;
  quickEditFields?: string[];
  /** The name field: asked for when the DocType names by prompt, else shown read only, or only in lists when hidden. */
  nameField?: {
    label: string;
    placeholder?: string;
    /** An AutoComplete offers the names the model's `lists.name` gives. */
    fieldtype?: 'Data' | 'AutoComplete';
    hidden?: boolean;
  };
  /** How fields show what their DocFields cannot say, by fieldname. */
  fields?: Record<string, FieldPresentation>;
  /** False when the list offers no new document, e.g. accounts made in the Chart of Accounts. */
  create?: boolean;
  /**
   * DocType fields /books neither shows nor saves: fields the server owns,
   * like a tree's nested set, or fields of a Frappe doctype Books does not use.
   */
  omitFields?: string[];
  /** Values of omitted fields that each document /books creates gets, e.g. an enabled Currency. */
  insertValues?: Record<string, unknown>;
  /** The field a link to the doctype shows instead of the name. */
  linkDisplayField?: string;
  /** Table columns, where /books orders them unlike the DocType's in_list_view fields. */
  tableFields?: string[];
  /**
   * The fields of list exports, import templates and quick views, in Books'
   * order, where it differs from the DocType's; fields the server fills are
   * left out.
   */
  fileFields?: string[];
  /** The search fields the search palette shows and matches, where they are fewer than the DocType's. */
  paletteFields?: string[];
}

/**
 * Field properties that no DocField property says, like Select option labels,
 * the doctypes a DocType reference offers (`options`), whether an Autocomplete
 * takes values that are not options, a link's grouping, a table whose rows
 * open in the row editor (`edit`), and a Link that offers no Create (`create:
 * false`). A Link offers Create unless its presentation says not.
 */
export type FieldPresentation = Partial<Field> &
  Pick<OptionField, 'optionLabels' | 'allowCustom'> & {
    create?: boolean;
    edit?: boolean;
  };

/** Presentations of Links that offer no Create, by fieldname. */
export function withoutCreate(
  fieldnames: string[]
): Record<string, FieldPresentation> {
  return Object.fromEntries(
    fieldnames.map((fieldname) => [fieldname, { create: false }])
  );
}

/**
 * The tab and section a Books Custom Form puts each custom field in, by
 * fieldname, and the row's own fieldname, which export files key it by.
 */
export type Placements = Record<
  string,
  { section?: string; tab?: string; books_fieldname?: string }
>;

export interface SchemaContext {
  /** Books schema names by doctype; link targets use them. */
  schemaNames: Record<string, string | undefined>;
  /** The user's roles, which decide the permission levels they can read and write. */
  roles: string[];
  placements: Placements;
}

const LAYOUT_FIELDTYPES = ['Section Break', 'Column Break', 'Tab Break'];
const DEFAULT_SECTION = 'Default';

// Standard columns, labelled as the list filters show them.
const STANDARD_FIELDS = [
  { fieldname: 'owner', label: 'Created By', fieldtype: 'Data' },
  { fieldname: 'modified_by', label: 'Modified By', fieldtype: 'Data' },
  { fieldname: 'creation', label: 'Created', fieldtype: 'Datetime' },
  { fieldname: 'modified', label: 'Modified', fieldtype: 'Datetime' },
];

/**
 * The schema /books forms, tables and lists render for a Frappe DocType.
 * Its fields keep their Frappe fieldnames; breaks become Books tabs and sections.
 */
export function toSchema(
  meta: DocTypeMeta,
  name: string,
  presentation: Presentation,
  context: SchemaContext
): Schema {
  const docFields = getDocFields(meta, context, presentation);
  const fields = [
    ...getNameFields(meta, presentation, docFields),
    ...getMetaFields(meta),
  ].map((field) => ({ ...field, schemaName: name }) as Field);

  return {
    name,
    label: presentation.label,
    fields,
    naming: getNaming(meta),
    titleField: meta.title_field || getNamingField(meta) || 'name',
    quickEditFields: presentation.quickEditFields,
    linkDisplayField: presentation.linkDisplayField,
    create: presentation.create,
    fileFields: presentation.fileFields,
    tableFields:
      presentation.tableFields ??
      meta.fields
        .filter((field) => field.in_list_view)
        .map((field) => field.fieldname),
    isChild: !!meta.istable,
    isSingle: !!meta.issingle,
    isSubmittable: !!meta.is_submittable,
    isTree: !!meta.is_tree,
  };
}

/** The field that names a document of a DocType named `field:<fieldname>`. */
export function getNamingField(meta: DocTypeMeta): string | undefined {
  const [rule, fieldname] = (meta.autoname ?? '').split(':');
  return rule.toLowerCase() === 'field' ? fieldname : undefined;
}

/** Fields in DocType order; custom fields placed by a Books Custom Form come last, as Books adds them. */
function getDocFields(
  meta: DocTypeMeta,
  context: SchemaContext,
  presentation: Presentation
): Field[] {
  const fieldContext: FieldContext = {
    schemaNames: context.schemaNames,
    levels: getPermlevels(meta, context.roles),
    namingField: getNamingField(meta),
    fields: presentation.fields ?? {},
    states: getStates(meta),
  };
  const fields: Field[] = [];
  const placed: Field[] = [];
  let tab: string | undefined;
  let section = DEFAULT_SECTION;
  const omitted = presentation.omitFields ?? [];
  for (const docfield of meta.fields) {
    if (omitted.includes(docfield.fieldname)) {
      continue;
    }

    if (docfield.fieldtype === 'Tab Break') {
      tab = docfield.label;
      section = DEFAULT_SECTION;
    } else if (docfield.fieldtype === 'Section Break') {
      section = docfield.label || DEFAULT_SECTION;
    } else if (!LAYOUT_FIELDTYPES.includes(docfield.fieldtype)) {
      const field = toField(docfield, fieldContext);
      const placement = context.placements[docfield.fieldname];
      if (placement) {
        placed.push({
          ...field,
          section: placement.section || DEFAULT_SECTION,
          tab: placement.tab || undefined,
        });
      } else {
        fields.push({ ...field, section, tab });
      }
    }
  }

  // In the order of the Books Custom Form's rows.
  const order = Object.keys(context.placements);
  placed.sort(
    (a, b) => order.indexOf(a.fieldname) - order.indexOf(b.fieldname)
  );
  return [...fields, ...placed];
}

/**
 * Dynamic properties (depends_on and the like) stay unset, so a doc's own
 * rules decide them; see `FrappeDoc`.
 */
function toField(docfield: DocField, context: FieldContext): Field {
  const { fieldname } = docfield;
  const shown = context.fields[fieldname] ?? {};
  // Frappe colours a document's `status` by the DocType state of the same title.
  const states = fieldname === 'status' ? context.states : undefined;
  const properties = getFieldProperties(
    { fieldname, optionLabels: shown.optionLabels } as Field,
    { ...docfield, states }
  ) as Partial<Field> & { target?: string };
  const { levels, schemaNames } = context;
  const level = docfield.permlevel ?? 0;
  const field = {
    ...properties,
    ...(isReferenceField(docfield) && getReferenceProperties(schemaNames)),
    fieldname,
    // The naming field is set once: changing it later would not rename the document.
    setOnlyOnce: properties.setOnlyOnce || fieldname === context.namingField,
    label: docfield.label ?? docfield.fieldname,
    placeholder: docfield.placeholder,
    sub_label: docfield.description,
    isCustom: !!docfield.is_custom_field,
    required: docfield.reqd ? true : undefined,
    readOnly: docfield.read_only || !levels.write.has(level) ? true : undefined,
    hidden: docfield.hidden || !levels.read.has(level) ? true : undefined,
    create: isLink(docfield) || undefined,
    linkFilters: getLinkFilters(docfield),
    ...shown,
  } as Field & { target?: string; create?: boolean; allowCustom?: boolean };

  if (docfield.fieldtype === 'Table') {
    field.target = getTableSchemaName(docfield.options!);
  } else if (properties.target) {
    field.target = schemaNames[properties.target] ?? properties.target;
  }

  return field;
}

/** The Custom Field that holds a Books custom field, as `frappe_books.customization` names it. */
export function getCustomFieldname(fieldname: string): string {
  return `custom_books_${fieldname.replace(/[ -]/g, '_').toLowerCase()}`;
}

/** The schema of a table's rows: its DocType without `Books ` and spaces, e.g. `SalesInvoiceItem`. */
export function getTableSchemaName(doctype: string): string {
  return doctype.replace(/^Books /, '').replaceAll(' ', '');
}

/** A DocField's link_filters as list filters; `eval:` values need Desk's form script, so they are left out. */
function getLinkFilters({ link_filters }: DocField): Filter[] | undefined {
  if (!link_filters) {
    return undefined;
  }

  type LinkFilter = [string, string, string, unknown];
  return (JSON.parse(link_filters) as LinkFilter[])
    .filter(([, , , value]) => !String(value).startsWith('eval:'))
    .map(([, fieldname, operator, value]) => [fieldname, operator, value]);
}

function isLink({ fieldtype }: DocField): boolean {
  return fieldtype === 'Link' || fieldtype === 'Dynamic Link';
}

/** A field that holds a doctype offers the Books doctypes, shown by their schema names. */
function getReferenceProperties(
  schemaNames: SchemaContext['schemaNames']
): Partial<OptionField> {
  const options = Object.entries(schemaNames).map(([doctype, schemaName]) => ({
    value: doctype,
    label: schemaName ?? doctype,
  }));
  return { fieldtype: 'Select', options };
}

/**
 * A prompt-named doctype asks for the name first, after an image that heads
 * the form. Another doctype shows its name read only, first, when the model
 * labels it; otherwise the name is a meta field. A single has no ID.
 */
function getNameFields(
  meta: DocTypeMeta,
  presentation: Presentation,
  fields: Field[]
): Field[] {
  if (meta.issingle) {
    return fields;
  }

  const isPrompt = meta.autoname?.toLowerCase() === 'prompt';
  if (!isPrompt && (!presentation.nameField || presentation.nameField.hidden)) {
    const namingField = getNamingField(meta);
    const label = fields.find(
      ({ fieldname }) => fieldname === namingField
    )?.label;
    const idField = {
      fieldname: 'name',
      label: presentation.nameField?.label ?? label ?? 'ID',
      fieldtype: 'Data',
    };
    return [...fields, { ...idField, meta: true } as Field];
  }

  const nameField = {
    fieldname: 'name',
    fieldtype: presentation.nameField?.fieldtype ?? 'Data',
    label: presentation.nameField?.label ?? 'Name',
    placeholder: presentation.nameField?.placeholder,
    required: true,
    readOnly: isPrompt ? undefined : true,
    section: fields[0]?.section ?? DEFAULT_SECTION,
    tab: fields[0]?.tab,
  } as Field;
  const index = isPrompt && fields[0]?.fieldtype === 'AttachImage' ? 1 : 0;
  return [...fields.slice(0, index), nameField, ...fields.slice(index)];
}

function getMetaFields(meta: DocTypeMeta): Field[] {
  if (meta.istable) {
    return [];
  }

  const fields = [...STANDARD_FIELDS];
  if (meta.is_submittable) {
    fields.push({ fieldname: 'docstatus', label: 'Status', fieldtype: 'Int' });
  }

  return fields.map((field) => ({ ...field, meta: true }) as Field);
}

/** How /books names a new document; a controller that names by script numbers it as a series. */
function getNaming(meta: DocTypeMeta): Naming {
  const rule = (meta.autoname ?? '').toLowerCase();
  if (rule === 'prompt' || rule.startsWith('field:')) {
    return 'manual';
  }

  if (rule === 'autoincrement') {
    return 'autoincrement';
  }

  // Books names these by script from their number series; see SeriesNamingMixin.
  const hasSeries = meta.fields.some(
    ({ fieldname }) => fieldname === 'number_series'
  );
  if (hasSeries || (!rule && meta.naming_rule === 'By script')) {
    return 'numberSeries';
  }

  return !rule || rule === 'hash' ? 'random' : 'numberSeries';
}

type Permlevels = { read: Set<number>; write: Set<number> };

/** What converting a DocField needs to know about its DocType and presentation. */
interface FieldContext {
  schemaNames: SchemaContext['schemaNames'];
  levels: Permlevels;
  namingField?: string;
  fields: NonNullable<Presentation['fields']>;
  states?: Record<string, string>;
}

/** The colours of the DocType's states, by title. */
function getStates(meta: DocTypeMeta): Record<string, string> | undefined {
  if (!meta.states?.length) {
    return undefined;
  }

  return Object.fromEntries(
    meta.states.map(({ title, color }) => [title, color])
  );
}

/** The permission levels the user's roles can read and write; level 0 is the document's own. */
function getPermlevels(meta: DocTypeMeta, roles: string[]): Permlevels {
  const levels: Permlevels = { read: new Set([0]), write: new Set([0]) };
  for (const perm of meta.permissions ?? []) {
    if (!roles.includes(perm.role)) {
      continue;
    }

    const level = perm.permlevel ?? 0;
    if (perm.read || perm.write) {
      levels.read.add(level);
    }

    if (perm.write) {
      levels.write.add(level);
    }
  }

  return levels;
}
