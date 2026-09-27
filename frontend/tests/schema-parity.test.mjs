import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { getSchemas } from './helpers/fyo.mjs';

const appRoot = new URL('../../frappe_books/', import.meta.url);
const mapping = readJson(new URL('schema_mapping.json', appRoot)).doctypes;
const doctypes = readDoctypes(new URL('frappe_books/doctype/', appRoot));
// Frappe stores single values in its own Singles table.
const UNMAPPED_SCHEMAS = ['SingleValue'];
const FRAPPE_FIELD_TYPES = {
  AttachImage: ['Attach Image'],
  Attachment: ['Attach'],
  AutoComplete: ['Autocomplete'],
  DynamicLink: ['Dynamic Link'],
  Secret: ['Password'],
  Text: ['Text', 'Code'],
};

for (const countryCode of ['in', 'ch']) {
  test(`${countryCode} app schemas match the DocType fields`, () => {
    const problems = [];
    const schemas = getSchemas(countryCode, []);
    for (const [schemaName, schema] of Object.entries(schemas)) {
      if (UNMAPPED_SCHEMAS.includes(schemaName)) continue;
      problems.push(...getSchemaProblems(schemaName, schema));
    }
    assert.deepEqual(problems, []);
  });
}

function getSchemaProblems(schemaName, schema) {
  const config = mapping[schemaName];
  const doctype = doctypes[config?.doctype];
  if (!doctype) return [`${schemaName} has no mapped DocType`];

  const referenceFields = schema.fields
    .filter((field) => field.fieldtype === 'DynamicLink')
    .map((field) => field.references);
  return schema.fields
    .filter((field) => !field.meta && field.fieldname !== 'name')
    .flatMap((field) => {
      const target = config.fields[field.fieldname];
      const docfield = doctype.fields.find((df) => df.fieldname === target);
      if (!docfield) {
        return [`${schemaName}.${field.fieldname} has no DocType field`];
      }
      const isReference = referenceFields.includes(field.fieldname);
      return getFieldProblems(field, docfield, isReference).map(
        (problem) => `${schemaName}.${field.fieldname} ${problem}`
      );
    });
}

function getFieldProblems(field, docfield, isReference) {
  const fieldtypes = isReference
    ? ['Link']
    : (FRAPPE_FIELD_TYPES[field.fieldtype] ?? [field.fieldtype]);
  const problems = [];
  if (!fieldtypes.includes(docfield.fieldtype)) {
    problems.push(`is ${docfield.fieldtype}, not ${fieldtypes.join(' or ')}`);
  }
  if (docfield.reqd && !field.required) {
    problems.push('is required by the DocType');
  }
  if (field.target && docfield.options !== getDoctypeName(field.target)) {
    problems.push(`links to ${docfield.options}`);
  }
  if (field.fieldtype === 'Select' && !isReference) {
    problems.push(...getMissingOptions(field, docfield));
  }
  return problems;
}

function getMissingOptions(field, docfield) {
  const options = (docfield.options ?? '').split('\n');
  return (field.options ?? [])
    .map((option) => option.value ?? option)
    .filter((value) => value !== '' && !options.includes(value))
    .map((value) => `has no ${value} option`);
}

function getDoctypeName(schemaName) {
  return mapping[schemaName]?.doctype ?? schemaName;
}

function readDoctypes(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const folders = entries.filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('__')
  );
  return Object.fromEntries(
    folders.map(({ name }) => {
      const doctype = readJson(new URL(`${name}/${name}.json`, directory));
      return [doctype.name, doctype];
    })
  );
}

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}
