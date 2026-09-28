import io
import json

from frappe.tests import IntegrationTestCase, UnitTestCase
from frappe.translate import get_boot_translations

from frappe_books.coa import STANDARD_CHART
from frappe_books.translation_extractors import (
	extract_chart_names,
	extract_schema_labels,
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

	def test_schema_labels_are_messages(self):
		schema = {"label": "Item", "fields": [{"label": "Rate", "placeholder": "Rate", "fieldname": "rate"}]}
		self.assertEqual(messages(extract_schema_labels, json.dumps(schema)), ["Item", "Rate", "Rate"])

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
	return [message for _line, _function, message, _comments in extractor(to_file(text), None, None, None)]


def to_file(text):
	return io.BytesIO(text.encode())


class IntegrationTestBooksTranslations(IntegrationTestCase):
	def test_boot_translations_include_the_books_catalog(self):
		translations = get_boot_translations("de")
		self.assertEqual(translations["Set up your organization"], "Ihr Unternehmen einrichten")
		self.assertEqual(translations["Cash In Hand"], "Kassenbestand")
