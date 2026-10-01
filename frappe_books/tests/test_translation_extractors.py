import io
import json

from frappe.tests import IntegrationTestCase, UnitTestCase
from frappe.translate import get_boot_translations

from frappe_books.coa import STANDARD_CHART
from frappe_books.translation_extractors import (
	extract_chart_names,
	extract_doctype_messages,
	extract_model_strings,
	extract_print_format_messages,
	extract_template_strings,
)


class UnitTestTranslationExtractors(UnitTestCase):
	def test_template_tags_become_frappe_messages(self):
		code = """
		const a = t`Hello ${user.name}, you have ${count} items`;
		const b = this.fyo.t`Nested ${flag ? t`Yes` : '}'} value`;
		const c = t`Line one
			line two`;
		const d = format`Not a message`;
		const e = t`Quote \\` and ${"a}b"} end`;
		"""
		self.assertEqual(
			messages(extract_template_strings, code),
			[
				"Hello {0}, you have {1} items",
				"Nested {0} value",
				"Yes",
				"Line one line two",
				"Quote ` and {0} end",
			],
		)

	def test_template_messages_keep_their_lines(self):
		lines = [line for line, *_ in extract_template_strings(to_file("\n\nt`Save`"), None, None, None)]
		self.assertEqual(lines, [3])

	def test_doctypes_give_frappes_messages_and_field_placeholders(self):
		doctype = {
			"name": "Books Thing",
			"fields": [
				{"fieldname": "rate", "fieldtype": "Currency", "label": "Rate", "placeholder": "0.00"},
				{"fieldname": "note", "fieldtype": "Data", "label": "Note"},
			],
		}
		self.assertEqual(
			messages(extract_doctype_messages, json.dumps(doctype)), ["Books Thing", "Rate", "Note", "0.00"]
		)

	def test_print_formats_give_the_messages_of_their_html(self):
		print_format = {
			"html": '<th>{{ _("Grand Total") }}</th>{% if doc.terms %}{{ _("Notes") }}{% endif %}'
		}
		self.assertEqual(
			messages(extract_print_format_messages, json.dumps(print_format)), ["Grand Total", "Notes"]
		)

	def test_models_give_the_labels_their_presentation_shows(self):
		code = """
		static override presentation = {
			label: 'Quote',
			nameField: { label: 'Form Type', placeholder: 'Pick one' },
			fields: { kind: { optionLabels: { Datetime: 'Date Time', DynamicLink: 'Dynamic Link' } } },
		};
		message = t`Saved`;
		"""
		self.assertEqual(
			messages(extract_model_strings, code),
			["Saved", "Quote", "Form Type", "Pick one", "Date Time", "Dynamic Link"],
		)

	def test_chart_names_and_standard_account_names_are_messages(self):
		country_chart = {"name": "India - Chart of Accounts", "tree": {"Assets": {"rootType": "Asset"}}}
		standard_chart = {"Assets": {"rootType": "Asset", " Cash ": {"accountType": "Cash"}}}
		self.assertEqual(
			messages(extract_chart_names, json.dumps(country_chart)), ["India - Chart of Accounts"]
		)
		self.assertEqual(
			messages(extract_chart_names, json.dumps(standard_chart)), [STANDARD_CHART, "Assets", "Cash"]
		)


def messages(extractor, text):
	return [message for _line, _function, message, _comments in extractor(to_file(text), [], [], {})]


def to_file(text):
	return io.BytesIO(text.encode())


class IntegrationTestBooksTranslations(IntegrationTestCase):
	def test_boot_translations_include_the_books_catalog(self):
		translations = get_boot_translations("de")
		self.assertEqual(translations["Set up your organization"], "Ihr Unternehmen einrichten")
		self.assertEqual(translations["Cash In Hand"], "Kassenbestand")
