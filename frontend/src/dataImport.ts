import { upload } from 'frappe-ui';
import { t } from 'fyo';
import { call } from 'src/web/api';

const DATA_IMPORT = 'Data Import';
const METHODS = 'frappe.core.doctype.data_import.data_import';
const FINISHED = ['Success', 'Partial Success', 'Error', 'Timed Out'];
const POLL_INTERVAL = 1000;

/** A file value Frappe could not find the linked record of. */
export interface MissingLink {
  doctype: string;
  name: string;
}

export interface ImportProgress {
  processed: number;
  total: number;
}

/** How Frappe's Data Import saved one document. */
export interface ImportLog {
  docname: string | null;
  message: string;
  /** The document's file rows, the header being row 1. */
  rows: number[];
}

interface RawImportLog {
  docname: string | null;
  messages: string;
  exception: string | null;
  row_indexes: string;
}

interface ImportWarning {
  type?: string;
  message: string;
}

interface ValueMapping {
  fieldtype: string;
  link_doctype: string | null;
  source_value: string;
}

interface ImportStatus {
  status: string;
  total_records?: number;
  processed_records?: number;
}

/**
 * One run of Frappe's Data Import, which checks, saves and logs the rows on
 * the server. Frappe checks the import right when the Data Import is saved.
 */
export class DataImport {
  name: string;
  /** Whether Frappe submits what it imports. It is set once, on insert. */
  submit: boolean;
  missingLinks: MissingLink[] = [];

  constructor(name: string, submit: boolean) {
    this.name = name;
    this.submit = submit;
  }

  static async insert(doctype: string, submit: boolean): Promise<DataImport> {
    const { name } = await call<{ name: string }>('frappe.client.insert', {
      doc: {
        doctype: DATA_IMPORT,
        reference_doctype: doctype,
        import_type: 'Insert New Records',
        submit_after_import: Number(submit),
      },
    });
    return new DataImport(name, submit);
  }

  /** Attaches `csv` as the file to import, in place of any earlier one. */
  async setFile(csv: string, fileName: string): Promise<void> {
    const file = await upload(new File([csv], fileName, { type: 'text/csv' }), {
      doctype: DATA_IMPORT,
      docname: this.name,
      fieldname: 'import_file',
      private: true,
    });
    const { value_mappings } = await call<{ value_mappings: ValueMapping[] }>(
      'frappe.client.set_value',
      {
        doctype: DATA_IMPORT,
        name: this.name,
        fieldname: 'import_file',
        value: file.file_url,
      }
    );
    this.missingLinks = value_mappings
      .filter(({ fieldtype }) => fieldtype === 'Link')
      .map(({ link_doctype, source_value }) => ({
        doctype: link_doctype ?? '',
        name: source_value,
      }));
  }

  /** Messages of the problems in the file that stop the import, other than missing links. */
  async getWarnings(): Promise<string[]> {
    const { warnings } = await call<{ warnings: ImportWarning[] }>(
      `${METHODS}.get_preview_from_template`,
      { data_import: this.name }
    );
    return warnings
      .filter(({ type }) => type !== 'info' && type !== 'value_mapping')
      .map(({ message }) => message);
  }

  /**
   * Imports the file and waits until Frappe is done. Frappe runs the import
   * in a background job, or in the request in developer mode. Returns the
   * problems that stopped it, if Frappe refused the file.
   */
  async run(onProgress: (progress: ImportProgress) => void): Promise<string[]> {
    await call(`${METHODS}.form_start_import`, { data_import: this.name });
    return await this.waitUntilFinished(onProgress);
  }

  async waitUntilFinished(
    onProgress: (progress: ImportProgress) => void
  ): Promise<string[]> {
    for (;;) {
      const status = await call<ImportStatus>(`${METHODS}.get_import_status`, {
        data_import_name: this.name,
      });
      if (FINISHED.includes(status.status)) {
        throwIfStopped(status);
        return [];
      }

      const blocking = await this.getBlockingWarnings(status);
      if (blocking.length) {
        return blocking;
      }

      onProgress({
        processed: status.processed_records ?? 0,
        total: status.total_records ?? 0,
      });
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  /** Frappe puts a refused import back to Pending, with the reasons as template warnings. */
  async getBlockingWarnings({ status }: ImportStatus): Promise<string[]> {
    if (status !== 'Pending') {
      return [];
    }

    const { template_warnings } = await call<{ template_warnings?: string }>(
      'frappe.client.get_value',
      {
        doctype: DATA_IMPORT,
        filters: { name: this.name },
        fieldname: 'template_warnings',
      }
    );
    const warnings = JSON.parse(template_warnings || '[]') as ImportWarning[];
    return warnings.map(({ message }) => message);
  }

  async getLogs(status: 'success' | 'failed'): Promise<ImportLog[]> {
    const logs = await call<RawImportLog[]>(`${METHODS}.get_import_logs`, {
      data_import: this.name,
      status,
    });
    return logs.map((log) => ({
      docname: log.docname,
      message: status === 'failed' ? getLogMessage(log) : '',
      rows: JSON.parse(log.row_indexes) as number[],
    }));
  }
}

/** An import that failed before any row, such as a crashed job, has no row logs to show. */
function throwIfStopped({ status, processed_records }: ImportStatus): void {
  if (!processed_records && (status === 'Error' || status === 'Timed Out')) {
    throw new Error(
      t`The import stopped: ${status}. The Error Log has the details.`
    );
  }
}

/** A failed row's messages, or the last line of its traceback. */
function getLogMessage({ messages, exception }: RawImportLog): string {
  const texts = (JSON.parse(messages || '[]') as { message?: string }[])
    .map(({ message }) => message)
    .filter(Boolean);
  if (texts.length) {
    return texts.join('\n');
  }

  return exception?.trim().split('\n').at(-1) ?? '';
}
