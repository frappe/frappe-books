import { serverHtmlToText } from 'src/utils/serverHtml';
import type { ServerMessage } from 'src/web/api';
import { getDocType } from './doctypes';
import type { FrappeDoc } from './document';

/** A field a server message says is missing: of the document, or of one of its rows. */
export interface MissingField {
  doc: FrappeDoc;
  fieldname: string;
}

// Frappe's `_get_missing_mandatory_fields` messages, without their markup.
const DOC_MISSING = /Value missing for (.+?): (.+)$/;
const ROW_MISSING = /^Error: (.+?) Row #(\d+): Value missing for: (.+)$/;

/** The fields Frappe's mandatory messages name, as far as the document has them. */
export function getMissingFieldsOf(
  doc: FrappeDoc,
  messages: ServerMessage[]
): MissingField[] {
  return messages
    .map(({ message }) => toMissingField(doc, serverHtmlToText(message)))
    .filter((missing): missing is MissingField => !!missing);
}

function toMissingField(
  doc: FrappeDoc,
  text: string
): MissingField | undefined {
  const row = text.match(ROW_MISSING);
  if (row) {
    const [, doctype, idx, label] = row;
    const shown = getRow(doc, doctype, Number(idx));
    return shown && withFieldname(shown, label);
  }

  const own = text.match(DOC_MISSING);
  return own && own[1] === doc.doctype ? withFieldname(doc, own[2]) : undefined;
}

function getRow(
  doc: FrappeDoc,
  doctype: string,
  idx: number
): FrappeDoc | undefined {
  for (const { fieldname } of doc.tableFields) {
    const rows = (doc.get(fieldname) ?? []) as FrappeDoc[];
    if (rows[0]?.doctype === doctype) {
      return rows[idx - 1];
    }
  }
}

/** The DocField a message labels; messages use the DocType's labels, not Books'. */
function withFieldname(
  doc: FrappeDoc,
  label: string
): MissingField | undefined {
  const { meta } = getDocType(doc.schemaName);
  const docfield = meta.fields.find((field) => field.label === label.trim());
  return docfield && { doc, fieldname: docfield.fieldname };
}
