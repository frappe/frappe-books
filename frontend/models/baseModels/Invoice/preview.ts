import { DocValue, DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { areDocValuesEqual, setChildDocIdx } from 'fyo/model/helpers';
import { FieldTypeEnum } from 'schemas/types';

/**
 * Set the values the server changed from the `sent` ones. Values the client
 * changed after sending, and rows it removed or added, are left alone.
 */
export function applyPreview(
  doc: Doc,
  sent: DocValueMap,
  previewed: DocValueMap
) {
  for (const field of doc.schema.fields) {
    const { fieldname } = field;
    if (field.meta || fieldname === 'name' || !(fieldname in previewed)) {
      continue;
    }

    if (field.fieldtype === FieldTypeEnum.Table) {
      applyRows(
        doc,
        fieldname,
        (sent[fieldname] ?? []) as DocValueMap[],
        previewed[fieldname] as DocValueMap[]
      );
    } else if (
      !areDocValuesEqual(
        previewed[fieldname] as DocValue,
        sent[fieldname] as DocValue
      )
    ) {
      doc[fieldname] = previewed[fieldname];
    }
  }
}

function applyRows(
  doc: Doc,
  fieldname: string,
  sentRows: DocValueMap[],
  previewedRows: DocValueMap[]
) {
  const rows = (doc[fieldname] ?? []) as Doc[];
  const sentRowsByName = new Map(sentRows.map((row) => [row.name, row]));
  const nextRows: Doc[] = [];
  for (const values of previewedRows) {
    const row = rows.find(({ name }) => name === values.name);
    if (row) {
      applyPreview(row, sentRowsByName.get(row.name) ?? {}, values);
      nextRows.push(row);
    } else if (!sentRowsByName.has(values.name)) {
      nextRows.push(
        doc._getChildDoc({ ...values, name: undefined }, fieldname)
      );
    }
  }

  nextRows.push(...rows.filter(({ name }) => !sentRowsByName.has(name)));
  setChildDocIdx(nextRows);
  doc[fieldname] = nextRows;
}
