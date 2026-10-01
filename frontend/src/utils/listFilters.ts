import type { Field } from 'schemas/types';
import type { Filter } from 'src/frappe/api';
import { getModel, getSchema } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { markRaw } from 'vue';
import { getFieldLabel, getFilterFields } from './filterFields';
import {
  FilterSet,
  conditionsForField,
  defaultCondition,
  isCompleteFilter,
  type FilterRow,
} from './filterQuery';

/** The editable filters of one list, shared by its filter UIs. */
export class ListFilters {
  filterSet = new FilterSet();
  /** The explicit rows of the last successful `apply`. */
  applied: FilterRow[] = [];
  error = '';
  readonly fields: Field[];
  readonly fieldOptions: { label: string; value: string }[];

  constructor(schemaName: string) {
    this.fields = markRaw(
      getFilterFields(
        getSchema(schemaName)?.fields ?? [],
        getModel(schemaName)?.getListViewSettings?.(fyo)?.columns
      )
    );
    this.fieldOptions = markRaw(
      this.fields.map((field) => ({
        label: getFieldLabel(field),
        value: field.fieldname,
      }))
    );
  }

  get explicitRows(): FilterRow[] {
    return this.filterSet.rows.filter((row) => !row.implicit);
  }

  fieldFor(row: FilterRow): Field | undefined {
    return this.fields.find((field) => field.fieldname === row.fieldname);
  }

  conditionsFor(row: FilterRow) {
    return [...conditionsForField(this.fieldFor(row))];
  }

  add(field: Field | undefined = this.fields[0]) {
    if (field) this.filterSet.add(field.fieldname, defaultCondition(field));
    this.error = '';
  }

  remove(id: number) {
    this.filterSet.remove(id);
    this.error = '';
  }

  clear() {
    this.filterSet.clear();
  }

  update<K extends 'fieldname' | 'condition' | 'value'>(
    row: FilterRow,
    key: K,
    value: FilterRow[K]
  ) {
    const previousValue = row[key];
    row[key] = value;
    this.error = '';
    if (key === 'fieldname') {
      row.value = '';
      row.condition = defaultCondition(this.fieldFor(row));
    }
    if (key === 'value' && previousValue !== value) {
      this.clearDependents(row);
    }
  }

  /** Clears dynamic link values whose target type is chosen by `row`. */
  clearDependents(row: FilterRow) {
    for (const dependent of this.filterSet.rows) {
      const field = this.fieldFor(dependent);
      if (
        !dependent.implicit &&
        field?.fieldtype === 'DynamicLink' &&
        field.references === row.fieldname
      ) {
        dependent.value = '';
      }
    }
  }

  /** Returns the filters of the complete rows, or undefined and sets `error`. */
  apply(): Filter[] | undefined {
    try {
      const filters = this.filterSet.toFilters(this.fields);
      this.filterSet.normalize();
      this.applied = this.explicitRows
        .filter(isCompleteFilter)
        .map((row) => ({ ...row }));
      this.error = '';
      return filters;
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
}
