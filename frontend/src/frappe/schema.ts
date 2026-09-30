import { getFieldProperties } from 'schemas/fieldProperties';
import type { Field, Naming, Schema } from 'schemas/types';
import type { DocField, DocTypeMeta } from './meta';

/** What a Frappe-backed model shows that its DocType has no property for. */
export interface Presentation {
  label: string;
  quickEditFields?: string[];
  /** The field that asks for a document's name when its DocType names by prompt. */
  nameField?: { label: string; placeholder?: string };
  /** Labels of Select option values, by fieldname, e.g. `SalesInvoice` as `Sales Invoice`. */
  optionLabels?: Record<string, Record<string, string>>;
  /** False when the list offers no new document, e.g. accounts made in the Chart of Accounts. */
  create?: boolean;
  /**
   * DocType fields /books neither shows nor saves: fields the server owns,
   * like a tree's nested set, or fields of a Frappe doctype Books does not use.
   */
  omitFields?: string[];
  /** Values of omitted fields that each document /books creates gets, e.g. an enabled Currency. */
  insertValues?: Record<string, unknown>;
}

/** The tab and section a Books Custom Form puts each custom field in, by fieldname. */
export type Placements = Record<string, { section?: string; tab?: string }>;

export interface SchemaContext {
  /** Books schema names by doctype; link and table targets use them. */
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
  const fields = [
    ...getNameFields(
      meta,
      presentation,
      getDocFields(meta, context, presentation)
    ),
    ...getMetaFields(meta),
  ].map((field) => ({ ...field, schemaName: name }) as Field);

  return {
    name,
    label: presentation.label,
    create: presentation.create,
    fields,
    naming: getNaming(meta.autoname),
    titleField: meta.title_field || getNamingField(meta) || 'name',
    quickEditFields: presentation.quickEditFields,
    tableFields: meta.fields
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
    optionLabels: presentation.optionLabels ?? {},
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
  const optionLabels = context.optionLabels[fieldname];
  const properties = getFieldProperties(
    { fieldname, optionLabels } as Field,
    docfield
  ) as Partial<Field> & { target?: string };
  const { levels, schemaNames } = context;
  const level = docfield.permlevel ?? 0;
  const field = {
    ...properties,
    fieldname,
    // The naming field is set once: changing it later would not rename the document.
    setOnlyOnce: properties.setOnlyOnce || fieldname === context.namingField,
    label: docfield.label ?? docfield.fieldname,
    placeholder: docfield.placeholder,
    isCustom: !!docfield.is_custom_field,
    required: docfield.reqd ? true : undefined,
    readOnly: docfield.read_only || !levels.write.has(level) ? true : undefined,
    hidden: docfield.hidden || !levels.read.has(level) ? true : undefined,
  } as Field & { target?: string; create?: boolean };

  if (properties.target) {
    field.target = schemaNames[properties.target] ?? properties.target;
  }

  if (docfield.fieldtype === 'Link') {
    field.create = !docfield.only_select;
  }

  return field;
}

/** A prompt-named doctype asks for the name first, after an image that heads the form. */
function getNameFields(
  meta: DocTypeMeta,
  presentation: Presentation,
  fields: Field[]
): Field[] {
  if (meta.autoname?.toLowerCase() !== 'prompt') {
    const namingField = getNamingField(meta);
    const label = fields.find(
      ({ fieldname }) => fieldname === namingField
    )?.label;
    const idField = {
      fieldname: 'name',
      label: label ?? 'ID',
      fieldtype: 'Data',
    };
    return [...fields, { ...idField, meta: true } as Field];
  }

  const nameField = {
    fieldname: 'name',
    fieldtype: 'Data',
    label: presentation.nameField?.label ?? 'Name',
    placeholder: presentation.nameField?.placeholder,
    required: true,
    section: fields[0]?.section ?? DEFAULT_SECTION,
    tab: fields[0]?.tab,
  } as Field;
  const index = fields[0]?.fieldtype === 'AttachImage' ? 1 : 0;
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

function getNaming(autoname = ''): Naming {
  const rule = autoname.toLowerCase();
  if (rule === 'prompt' || rule.startsWith('field:')) {
    return 'manual';
  }

  if (rule === 'autoincrement') {
    return 'autoincrement';
  }

  return !rule || rule === 'hash' ? 'random' : 'numberSeries';
}

type Permlevels = { read: Set<number>; write: Set<number> };

/** What converting a DocField needs to know about its DocType and presentation. */
interface FieldContext {
  schemaNames: SchemaContext['schemaNames'];
  levels: Permlevels;
  namingField?: string;
  optionLabels: NonNullable<Presentation['optionLabels']>;
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
