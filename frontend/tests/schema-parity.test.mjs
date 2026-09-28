import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dataProperties,
  FieldTypeEnum,
  fieldProperties,
  getSchemas,
  isReferenceField,
} from './helpers/fyo.mjs';
import { doctypes, mapping } from './helpers/doctypes.mjs';

// Frappe stores single values in its own Singles table.
const UNMAPPED_SCHEMAS = ['SingleValue'];
// Frappe's own DocTypes, whose files these tests cannot read.
const CORE_SCHEMAS = Object.keys(mapping).filter(
  (schemaName) =>
    !doctypes.some(({ name }) => name === mapping[schemaName].doctype)
);

for (const countryCode of ['-', 'in', 'ch']) {
  test(`${countryCode} schema files leave data properties to the DocTypes`, () => {
    const schemas = getSchemas(countryCode, [], {});
    const problems = getFields(schemas).flatMap(
      ([schemaName, field, docfield]) =>
        getFileProblems(field, docfield).map(
          (problem) => `${schemaName}.${field.fieldname} ${problem}`
        )
    );
    assert.deepEqual(problems, []);
  });

  test(`${countryCode} schemas built with DocType properties are complete`, () => {
    const schemas = getSchemas(countryCode, []);
    const problems = getFields(schemas)
      .filter(([, , docfield]) => docfield)
      .flatMap(([schemaName, field]) =>
        getBuiltFieldProblems(schemas, field).map(
          (problem) => `${schemaName}.${field.fieldname} ${problem}`
        )
      );
    assert.deepEqual(problems, []);
  });
}

function getFields(schemas) {
  return Object.entries(schemas)
    .filter(
      ([schemaName]) =>
        !UNMAPPED_SCHEMAS.includes(schemaName) &&
        !CORE_SCHEMAS.includes(schemaName)
    )
    .flatMap(([schemaName, schema]) =>
      schema.fields
        .filter((field) => !field.meta)
        .map((field) => [
          schemaName,
          field,
          fieldProperties[schemaName]?.[field.fieldname],
        ])
    );
}

function getFileProblems(field, docfield) {
  if (!docfield) {
    // The primary key is a DocType field only when it is renamed.
    return field.fieldname === 'name' ? [] : ['has no DocType field'];
  }

  return getOwnedProperties(field, docfield).map(
    (property) => `sets ${property}, which the DocType owns`
  );
}

function getOwnedProperties(field, docfield) {
  if (field.computed) {
    return [];
  }

  // The DocType stores a doctype name; the Books app picks from its own list.
  const kept = isReferenceField(docfield) ? ['fieldtype', 'options'] : [];
  // Frappe Color fields have no palette.
  if (docfield.fieldtype === 'Color') {
    kept.push('options');
  }

  return dataProperties.filter(
    (property) => field[property] !== undefined && !kept.includes(property)
  );
}

function getBuiltFieldProblems(schemas, field) {
  const problems = [];
  if (!Object.values(FieldTypeEnum).includes(field.fieldtype)) {
    problems.push(`has no Books field type for ${field.fieldtype}`);
  }
  if (['Link', 'Table'].includes(field.fieldtype) && !schemas[field.target]) {
    problems.push(`links to ${field.target}, which is not a Books schema`);
  }
  const values = (field.options ?? []).map((option) => option.value);
  for (const value of Object.keys(field.optionLabels ?? {})) {
    if (!values.includes(value)) {
      problems.push(`labels ${value}, which is not a DocType option`);
    }
  }
  return problems;
}
