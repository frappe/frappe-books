import frappe
from frappe.model.document import Document
from frappe.search.sqlite_search import SQLiteSearch, SQLiteSearchIndexMissingError, build_index
from frappe.utils.caching import site_cache

MODULE = "Frappe Books"


class BooksSearch(SQLiteSearch):
	"""The /books search palette's index of Books documents.

	A document's title is its doctype's label and its name, and its content its DocType's search
	fields and its tables' search fields. So "Karen invoice" finds Karen's invoices, and Frappe's
	title boost ranks them above payments whose rows name an invoice.
	"""

	INDEX_NAME = "books_search.db"
	# Spelling correction reads words from the last full build, so it would turn a name typed
	# since then, such as a new customer's, into an older one.
	BUILD_VOCABULARY = False

	def __init__(self, doctypes: list[str] | None = None, db_name: str | None = None):
		self.doctypes = doctypes
		self.table_rows = {}
		self.INDEX_SCHEMA = {}
		self.INDEXABLE_DOCTYPES = {
			doctype: {"fields": ["modified", *config["fields"], {"title": "name", "content": "name"}]}
			for doctype, config in get_search_doctypes().items()
		}
		super().__init__(db_name)

	def get_search_filters(self) -> dict:
		"""The requested indexed doctypes the user can read."""
		readable = [
			doctype
			for doctype in self.doctypes or self.INDEXABLE_DOCTYPES
			if doctype in self.INDEXABLE_DOCTYPES and frappe.has_permission(doctype, "read")
		]
		return {"doctype": readable}

	def get_documents_paginated(self, doctype, *args, **kwargs):
		documents = super().get_documents_paginated(doctype, *args, **kwargs)
		self.load_table_rows(doctype, [document.name for document in documents])
		return documents

	def index_documents_by_name(self, doctype, names: list[str]):
		self.load_table_rows(doctype, names)
		super().index_documents_by_name(doctype, names)

	def load_table_rows(self, doctype: str, names: list[str]):
		"""The searched table rows of a batch read without its tables, one query per table."""
		self.table_rows = {}
		for fieldname, table in get_search_doctypes()[doctype]["tables"].items():
			rows = frappe.get_all(
				table["doctype"],
				filters={"parent": ["in", names], "parenttype": doctype, "parentfield": fieldname},
				fields=["parent", *table["fields"]],
			)
			for row in rows:
				self.table_rows.setdefault((row.parent, fieldname), []).append(row)

	def prepare_document(self, doc):
		document = super().prepare_document(doc)
		if document:
			document["title"] = self._process_content(f"{doc.doctype.removeprefix('Books ')} {doc.name}")
			document["content"] = self._process_content(" ".join(self.get_content_values(doc)))
		return document

	def get_content_values(self, doc) -> list[str]:
		"""The search field values of a document and of its table rows."""
		config = get_search_doctypes()[doc.doctype]
		values = [doc.get(field) for field in config["fields"]]
		for fieldname, table in config["tables"].items():
			# A queued document is a full Document; a build reads rows without their tables.
			rows = (
				doc.get(fieldname)
				if isinstance(doc, Document)
				else self.table_rows.get((doc.name, fieldname), [])
			)
			values.extend(row.get(field) for row in rows for field in table["fields"])
		return [str(value) for value in values if value]


@site_cache()
def get_search_doctypes() -> dict[str, dict]:
	"""Books doctypes the palette finds, with their search fields and their tables' search fields.

	A doctype is found when its DocType names search fields or shows its name in search.
	"""
	doctypes = {}
	for doctype in frappe.get_all(
		"DocType", filters={"module": MODULE, "istable": 0, "issingle": 0}, pluck="name"
	):
		meta = frappe.get_meta(doctype)
		if meta.search_fields or meta.show_name_in_global_search:
			doctypes[doctype] = {"fields": get_search_fields(meta), "tables": get_table_search_fields(meta)}
	return doctypes


def get_search_fields(meta) -> list[str]:
	return [fieldname for fieldname in meta.get_search_fields() if fieldname != "name"]


def get_table_search_fields(meta) -> dict[str, dict]:
	"""Search fields of the tables whose DocType names any, by table fieldname."""
	tables = {}
	for field in meta.get_table_fields():
		table_meta = frappe.get_meta(field.options)
		if table_meta.search_fields:
			tables[field.fieldname] = {"doctype": field.options, "fields": get_search_fields(table_meta)}
	return tables


@frappe.whitelist()
def search(text: str, doctypes: list[str]) -> list[dict]:
	"""Documents of `doctypes` that match `text`, best first, cancelled ones last.

	Rows are read again with the user's permissions, with the search fields the palette shows.
	"""
	try:
		results = BooksSearch(doctypes).search(text)["results"]
	except SQLiteSearchIndexMissingError:
		frappe.enqueue(build_search_index, queue="long", job_id="build_books_search_index", deduplicate=True)
		return []

	rows = get_rows(results)
	found = [rows[key] for key in ((result["doctype"], result["name"]) for result in results) if key in rows]
	return sorted(found, key=lambda row: row["docstatus"] == 2)


def get_rows(results: list[dict]) -> dict[tuple[str, str], dict]:
	"""The results' rows the user may read, one query per doctype, by doctype and name."""
	names = {}
	for result in results:
		names.setdefault(result["doctype"], []).append(result["name"])

	rows = {}
	for doctype, doctype_names in names.items():
		fields = ["name", "docstatus", *get_search_doctypes()[doctype]["fields"]]
		found = frappe.get_list(
			doctype, filters={"name": ["in", doctype_names]}, fields=fields, limit=len(doctype_names)
		)
		for row in found:
			rows[(doctype, row.name)] = {"doctype": doctype, **row}
	return rows


def build_search_index():
	"""Builds the palette's index, so a new site searches before Frappe's scheduler builds it."""
	build_index(BooksSearch)
