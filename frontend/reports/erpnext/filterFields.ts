import type { Field, SelectOption } from 'schemas/types';
import { evaluateCondition } from 'src/frappe/dependsOn';
import { toSchemaName } from 'src/frappe/registry';
import { resolveOptions } from './defaults';
import type { ERPNextFilter, FilterValues, SelectOptions } from './types';

/** Whether ERPNext's report would show the filter: Books' own hidden ones and unmet depends_on are left out. */
export function isShown(filter: ERPNextFilter, values: FilterValues): boolean {
  return !filter.hidden && evaluateCondition(filter.depends_on, values);
}

/** The filter as a Books field, with the options and search filters the other filters' values give. */
export function toFilterField(
  filter: ERPNextFilter,
  values: FilterValues
): Field {
  const base = {
    fieldname: filter.fieldname,
    label: filter.label,
    placeholder: filter.label,
    required: isRequired(filter, values),
  };
  switch (filter.fieldtype) {
    case 'Link':
      return {
        ...base,
        fieldtype: 'Link',
        target: getTarget(filter, values),
        filters: getLinkFilters(filter, values),
      } as Field;
    case 'MultiSelectList':
      return {
        ...base,
        fieldtype: 'Data',
        control: 'MultiSelectList',
        target: getTarget(filter, values),
        linkFilters: getLinkFilters(filter, values),
      } as Field;
    case 'Select':
    case 'Autocomplete':
      return toOptionField(filter, base);
    default:
      return { ...base, fieldtype: filter.fieldtype } as Field;
  }
}

function isRequired(filter: ERPNextFilter, values: FilterValues): boolean {
  return (
    !!filter.reqd ||
    (!!filter.mandatory_depends_on &&
      evaluateCondition(filter.mandatory_depends_on, values, undefined, false))
  );
}

/** A doctype, or the value of the filter that names one, like `party_type`. */
function getTarget(filter: ERPNextFilter, values: FilterValues): string {
  const options = String(filter.options ?? '');
  const doctype = options in values ? String(values[options] ?? '') : options;
  return toSchemaName(doctype) ?? doctype;
}

function getLinkFilters(filter: ERPNextFilter, values: FilterValues) {
  const filters = filter.linkFilters?.(values) ?? {};
  return Object.entries(filters).map(([fieldname, value]) => [
    fieldname,
    '=',
    value,
  ]) as Field['filters'];
}

function toOptionField(filter: ERPNextFilter, base: object): Field {
  const options = toOptions(filter.options ?? []);
  return {
    ...base,
    // A Select picks from its options; an Autocomplete's take a Clear.
    fieldtype: filter.fieldtype === 'Select' ? 'Select' : 'AutoComplete',
    options: options.filter(({ value }) => value !== ''),
    allowEmpty: options.some(({ value }) => value === ''),
  } as Field;
}

/** ERPNext's Select options: lines, a list of values and {label, value}, or an option token. */
function toOptions(options: SelectOptions): SelectOption[] {
  const list =
    typeof options !== 'string'
      ? options
      : options.startsWith('@')
        ? resolveOptions(options)
        : options.split('\n');
  return list.map((option) =>
    typeof option === 'string' ? { label: option, value: option } : option
  );
}
