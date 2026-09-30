import { getFieldProperties, isReferenceField } from 'schemas/fieldProperties';
import type { Field, Naming, OptionField, Schema } from 'schemas/types';
import type { DocField, DocTypeMeta } from './meta';

/** What a Frappe-backed model shows that its DocType has no property for. */
export interface Presentation {
  label: string;
  quickEditFields?: string[];
  /** The name field: asked for when the DocType names by prompt, else shown read only, or only in lists when hidden. */
  nameField?: { label: string; placeholder?: string; hidden?: boolean };
  /** Properties a field shows with that its DocField has none for, like option labels or a link's grouping. */
  fields?: Record<string, Partial<Field>>;
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
      getDocFields(meta, context, presentation.fields ?? {})
    ),
    ...getMetaFields(meta),
  ].map((field) => ({ ...field, schemaName: name }) as Field);

  return {
    name,
    label: presentation.label,
    fields,
    naming: getNaming(meta),
    titleField: meta.title_field || 'name',
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

/** Fields in DocType order; custom fields placed by a Books Custom Form come last, as Books adds them. */
function getDocFields(
  meta: DocTypeMeta,
  context: SchemaContext,
  presented: Record<string, Partial<Field>>
): Field[] {
  const levels = getPermlevels(meta, context.roles);
  const fields: Field[] = [];
  const placed: Field[] = [];
  let tab: string | undefined;
  let section = DEFAULT_SECTION;
  for (const docfield of meta.fields) {
    if (docfield.fieldtype === 'Tab Break') {
      tab = docfield.label;
      section = DEFAULT_SECTION;
    } else if (docfield.fieldtype === 'Section Break') {
      section = docfield.label || DEFAULT_SECTION;
    } else if (!LAYOUT_FIELDTYPES.includes(docfield.fieldtype)) {
      const field = toField(
        docfield,
        context.schemaNames,
        levels,
        presented[docfield.fieldname]
      );
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
function toField(
  docfield: DocField,
  schemaNames: SchemaContext['schemaNames'],
  levels: Permlevels,
  presented: Partial<Field> = {}
): Field {
  const properties = getFieldProperties(
    { ...presented, fieldname: docfield.fieldname } as Field,
    docfield
  ) as Partial<Field> & { target?: string };
  const level = docfield.permlevel ?? 0;
  const field = {
    ...properties,
    ...(isReferenceField(docfield) && getReferenceProperties(schemaNames)),
    fieldname: docfield.fieldname,
    label: docfield.label ?? docfield.fieldname,
    placeholder: docfield.placeholder,
    isCustom: !!docfield.is_custom_field,
    required: docfield.reqd ? true : undefined,
    readOnly: docfield.read_only || !levels.write.has(level) ? true : undefined,
    hidden: docfield.hidden || !levels.read.has(level) ? true : undefined,
    ...presented,
  } as Field & { target?: string; create?: boolean };

  if (properties.target) {
    field.target = schemaNames[properties.target] ?? properties.target;
  }

  if (docfield.fieldtype === 'Link') {
    field.create = !docfield.only_select;
  }

  return field;
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
 * the form. A server-named one shows it there, read only, when the model labels it.
 */
function getNameFields(
  meta: DocTypeMeta,
  presentation: Presentation,
  fields: Field[]
): Field[] {
  const isPrompt = meta.autoname?.toLowerCase() === 'prompt';
  if (!isPrompt && !presentation.nameField) {
    const idField = { fieldname: 'name', label: 'ID', fieldtype: 'Data' };
    return [...fields, { ...idField, meta: true } as Field];
  }

  const nameField = {
    fieldname: 'name',
    fieldtype: 'Data',
    label: presentation.nameField?.label ?? 'Name',
    placeholder: presentation.nameField?.placeholder,
    required: true,
    readOnly: isPrompt ? undefined : true,
    hidden: presentation.nameField?.hidden,
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

/** How /books names a new document; a controller that names by script numbers it as a series. */
function getNaming({ autoname = '', naming_rule }: DocTypeMeta): Naming {
  const rule = autoname.toLowerCase();
  if (rule === 'prompt') {
    return 'manual';
  }

  if (rule === 'autoincrement') {
    return 'autoincrement';
  }

  if (!rule && naming_rule === 'By script') {
    return 'numberSeries';
  }

  return !rule || rule === 'hash' ? 'random' : 'numberSeries';
}

type Permlevels = { read: Set<number>; write: Set<number> };

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
