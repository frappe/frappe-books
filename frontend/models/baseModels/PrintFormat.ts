import { Fyo } from 'fyo';
import { ListViewSettings, ReadOnlyMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { getSchema, toSchemaName } from 'src/frappe/registry';
import { getPrintHTML, previewPrintHTML } from 'src/utils/printFormatApi';
import {
  defaultPageSize,
  getPageCSS,
  type PrintHTML,
} from 'src/utils/printFormats';

// The doctypes /books prints, as the Template Type offers them.
const PRINTED_DOCTYPES = [
  { value: 'Books Sales Invoice', label: 'Sales Invoice' },
  { value: 'Books Sales Quote', label: 'Quote' },
  { value: 'Books Purchase Invoice', label: 'Purchase Invoice' },
  { value: 'Books Journal Entry', label: 'Journal Entry' },
  { value: 'Books Payment', label: 'Payment' },
  { value: 'Books Shipment', label: 'Shipment' },
  { value: 'Books Purchase Receipt', label: 'Purchase Receipt' },
  { value: 'Books Stock Movement', label: 'Stock Movement' },
];

/** Frappe's Print Format. /books edits the ones with custom HTML that no app ships. */
export class PrintFormat extends FrappeDoc {
  static override doctype = 'Print Format';
  static override presentation = {
    label: 'Print Template',
    nameField: { label: 'Template Name' },
    fields: {
      doc_type: {
        label: 'Template Type',
        fieldtype: 'AutoComplete' as const,
        options: PRINTED_DOCTYPES,
        default: PRINTED_DOCTYPES[0].value,
      },
      html: { label: 'Template' },
      css: { label: 'Page Setup', default: getPageCSS(defaultPageSize) },
      custom_format: { default: true },
    },
    // Frappe's own print format builder and settings, which /books does not use.
    omitFields: [
      'module',
      'print_format_type',
      'raw_printing',
      'raw_commands',
      'align_labels_right',
      'show_section_headings',
      'line_breaks',
      'default_print_language',
      'font',
      'label_color',
      'value_color',
      'custom_html_help',
      'print_format_help',
      'format_data',
      'classic_format_data',
      'print_format_builder',
      'absolute_value',
      'print_format_builder_beta',
      'margin_top',
      'margin_bottom',
      'margin_left',
      'margin_right',
      'font_size',
      'page_number',
      'show_label_colon',
      'pdf_generator',
      'print_format_for',
      'report',
      'draft_data',
    ],
  };

  declare doc_type?: string;
  declare html?: string;
  declare css?: string;
  declare standard?: 'Yes' | 'No';
  declare custom_format?: boolean;
  declare disabled?: boolean;

  get isEditable(): boolean {
    return this.standard !== 'Yes' && !!this.custom_format;
  }

  get canEditTemplate(): boolean {
    return this.isEditable && this.canEdit;
  }

  /** A document printed with the template: with its edits for an editor, else as saved. */
  async getPrint(name: string): Promise<PrintHTML | null> {
    if (!this.canEditTemplate) {
      return await getPrintHTML(this.doc_type!, name, this.name!);
    }

    if (!this.html) {
      return null;
    }

    return await previewPrintHTML(this.doc_type!, name, this.html, this.css);
  }

  override get canDelete(): boolean {
    return this.standard !== 'Yes' && super.canDelete;
  }

  /** The schema of the documents the template prints. */
  get printedSchemaName(): string | undefined {
    return this.doc_type ? toSchemaName(this.doc_type) : undefined;
  }

  static getListViewSettings(fyo: Fyo): ListViewSettings {
    return {
      formRoute: (name) => `/template-builder/${name}`,
      columns: [
        'name',
        {
          label: fyo.t`Type`,
          fieldtype: 'AutoComplete',
          fieldname: 'doc_type',
          display(value) {
            const schemaName = toSchemaName(value as string);
            return (schemaName && getSchema(schemaName)?.label) ?? '';
          },
        },
        {
          label: fyo.t`Is Custom`,
          fieldtype: 'Check',
          fieldname: 'standard',
          display(value) {
            return fyo.format(value !== 'Yes', 'Check');
          },
        },
      ],
    };
  }

  readOnly: ReadOnlyMap = {
    name: () => !this.isEditable,
    doc_type: () => !this.isEditable,
    html: () => !this.isEditable,
  };
}
