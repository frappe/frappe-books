"""Accessory mode's endpoints over ERPNext: previews, mappers, linked entries, search and print options."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt, nowdate

from frappe_books.accessory import erpnext_default_company
from frappe_books.tests import needs_erpnext
from frappe_books.tests.accounting import ensure_user

NO_RIGHTS_USER = "accessory-no-rights@example.com"


def leaf(doctype):
	return frappe.db.get_value(doctype, {"is_group": 0}, "name")


def make_customer(name):
	if not frappe.db.exists("Customer", name):
		frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_group": leaf("Customer Group"),
				"territory": leaf("Territory"),
			}
		).insert()
	return name


def make_item(code, rate):
	"""A stock item whose standard rate ERPNext keeps as its Standard Selling price."""
	if not frappe.db.exists("Item", code):
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_group": leaf("Item Group"),
				"stock_uom": "Nos",
				"standard_rate": rate,
			}
		).insert()
	return code


def invoice_values(customer, item, **row):
	return {
		"doctype": "Sales Invoice",
		"__islocal": 1,
		"customer": customer,
		"items": [{"name": "row-1", "item_code": item, **row}],
	}


def make_default_sales_taxes(title):
	"""The company's default Sales Taxes and Charges Template, with one 9% row."""
	company = erpnext_default_company()
	abbr = frappe.get_cached_value("Company", company, "abbr")
	account = frappe.db.get_value("Account", {"account_name": title, "company": company})
	if not account:
		account = (
			frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": title,
					"parent_account": f"Duties and Taxes - {abbr}",
					"account_type": "Tax",
					"company": company,
				}
			)
			.insert()
			.name
		)

	row = {"charge_type": "On Net Total", "account_head": account, "rate": 9, "description": title}
	return (
		frappe.get_doc(
			{
				"doctype": "Sales Taxes and Charges Template",
				"title": title,
				"company": company,
				"is_default": 1,
				"taxes": [row],
			}
		)
		.insert()
		.name
	)


def first_row(doc):
	return frappe._dict(doc["items"][0])


@needs_erpnext
class IntegrationTestAccessoryPreview(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.preview import preview

		self.preview = preview
		self.customer = make_customer("Accessory Preview Customer")
		self.pen = make_item("ACC-PREVIEW-PEN", 20)
		self.book = make_item("ACC-PREVIEW-BOOK", 60)

	def test_a_new_invoice_takes_erpnext_defaults_prices_and_totals_without_a_write(self):
		count = frappe.db.count("Sales Invoice")
		doc = self.preview(invoice_values(self.customer, self.pen, qty=3), {"rows": {"row-1": ["item_code"]}})

		self.assertTrue(doc["company"])
		self.assertTrue(doc["naming_series"])
		self.assertEqual(str(doc["posting_date"]), nowdate())
		self.assertEqual(first_row(doc).rate, 20)
		self.assertEqual(doc["net_total"], 60)
		self.assertEqual(frappe.db.count("Sales Invoice"), count)

	def test_a_typed_rate_stays_as_a_discount(self):
		doc = self.preview(invoice_values(self.customer, self.pen, qty=1), {"rows": {"row-1": ["item_code"]}})
		doc["items"][0]["rate"] = 15
		doc = self.preview({**doc, "__islocal": 1}, {"rows": {"row-1": ["rate"]}})
		doc = self.preview({**doc, "__islocal": 1}, {})

		self.assertEqual(first_row(doc).rate, 15)
		self.assertEqual(first_row(doc).discount_amount, 5)

	def test_a_new_item_refreshes_its_row(self):
		doc = self.preview(invoice_values(self.customer, self.pen, qty=2), {"rows": {"row-1": ["item_code"]}})
		doc["items"][0]["item_code"] = self.book
		doc = self.preview({**doc, "__islocal": 1}, {"rows": {"row-1": ["item_code"]}})

		row = first_row(doc)
		self.assertEqual(row.item_name, self.book)
		self.assertEqual((row.qty, row.rate, row.amount), (2, 60, 120))

	def test_a_new_party_takes_its_details(self):
		other = make_customer("Accessory Preview Other")
		doc = self.preview(invoice_values(self.customer, self.pen, qty=1), {"doc": ["customer"]})
		doc["customer"] = other
		doc = self.preview({**doc, "__islocal": 1}, {"doc": ["customer"]})

		self.assertEqual(doc["customer_name"], other)

	def test_a_default_tax_template_stays_on_later_previews_with_its_rows(self):
		template = make_default_sales_taxes("Accessory Preview GST")
		doc = self.preview(invoice_values(self.customer, self.pen, qty=1), {})
		doc["taxes"][0]["rate"] = 5
		# The client sends the template it was given empty.
		doc = self.preview({**doc, "__islocal": 1, "taxes_and_charges": None}, {"doc": ["customer"]})

		self.assertEqual(doc["taxes_and_charges"], template)
		self.assertEqual([row["rate"] for row in doc["taxes"]], [5])

	def test_a_preview_drops_what_its_rolled_back_steps_announced(self):
		frappe.clear_messages()
		with patch("frappe_books.accessory.preview.fill", lambda *args: frappe.msgprint("Added", alert=True)):
			self.preview(invoice_values(self.customer, self.pen, qty=1), {"doc": ["customer"]})

		self.assertFalse(frappe.get_message_log())

	def test_an_untouched_new_payment_previews_without_erpnext_refusals(self):
		frappe.clear_messages()
		doc = self.preview({"doctype": "Payment Entry", "__islocal": 1}, {})

		self.assertTrue(doc["naming_series"])
		self.assertEqual(doc["payment_type"], "Receive")
		self.assertFalse(frappe.get_message_log())

	def test_an_edited_new_payment_previews_with_erpnext_refusals(self):
		values = {"doctype": "Payment Entry", "__islocal": 1, "paid_amount": 10}
		with self.assertRaisesRegex(frappe.ValidationError, "is mandatory"):
			self.preview(values, {"doc": ["paid_amount"]})

	def test_a_new_payment_of_a_party_type_takes_its_payment_type(self):
		doc = self.preview({"doctype": "Payment Entry", "__islocal": 1, "party_type": "Supplier"}, {})

		self.assertEqual((doc["payment_type"], doc["party_type"]), ("Pay", "Supplier"))

	def test_a_new_payment_of_a_payment_type_takes_its_party_type(self):
		doc = self.preview({"doctype": "Payment Entry", "__islocal": 1, "payment_type": "Pay"}, {})

		self.assertEqual((doc["payment_type"], doc["party_type"]), ("Pay", "Supplier"))

	def test_a_preview_needs_the_right_to_make_the_document(self):
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			self.preview(invoice_values(self.customer, self.pen), {})


def submitted_invoice(customer, item, qty):
	invoice = frappe.get_doc(
		{"doctype": "Sales Invoice", "customer": customer, "items": [{"item_code": item, "qty": qty}]}
	)
	return invoice.insert().submit()


def cash_account():
	"""The Cash mode of payment's account for the company, which the setup wizard may not have set."""
	company = erpnext_default_company()
	account = frappe.db.get_value("Company", company, "default_cash_account")
	mode = frappe.get_doc("Mode of Payment", "Cash")
	if not any(row.company == company for row in mode.accounts):
		mode.append("accounts", {"company": company, "default_account": account})
		mode.save()
	return frappe.db.get_value(
		"Mode of Payment Account", {"parent": "Cash", "company": company}, "default_account"
	)


def payment_values(customer, paid_amount=0, **reference):
	values = {
		"doctype": "Payment Entry",
		"__islocal": 1,
		"party_type": "Customer",
		"party": customer,
		"paid_amount": paid_amount,
	}
	if reference:
		values["references"] = [{"name": "ref-1", "reference_doctype": "Sales Invoice", **reference}]
	return values


@needs_erpnext
class IntegrationTestAccessoryFormFills(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.preview import preview

		self.preview = preview
		self.customer = make_customer("Accessory Preview Customer")
		self.pen = make_item("ACC-PREVIEW-PEN", 20)

	def test_a_mode_of_payment_fills_its_cash_account(self):
		account = cash_account()
		values = {**payment_values(self.customer), "mode_of_payment": "Cash"}
		doc = self.preview(values, {"doc": ["mode_of_payment"]})

		self.assertEqual(doc["paid_to"], account)

	def test_a_chosen_reference_takes_what_is_left_of_the_payment(self):
		invoice = submitted_invoice(self.customer, self.pen, 3)
		doc = self.preview(
			payment_values(self.customer, 30, reference_name=invoice.name), {"doc": ["paid_amount"]}
		)

		self.assertEqual(doc["references"][0]["allocated_amount"], 30)

	def test_a_payment_with_no_amount_takes_the_outstanding_amount(self):
		invoice = submitted_invoice(self.customer, self.pen, 3)
		doc = self.preview(payment_values(self.customer, reference_name=invoice.name), {"doc": ["party"]})

		self.assertEqual((doc["paid_amount"], doc["references"][0]["allocated_amount"]), (60, 60))

	def test_a_new_amount_is_allocated_again(self):
		invoice = submitted_invoice(self.customer, self.pen, 3)
		values = payment_values(self.customer, 20, reference_name=invoice.name, allocated_amount=60)
		doc = self.preview(values, {"doc": ["paid_amount"]})

		self.assertEqual(doc["references"][0]["allocated_amount"], 20)

	def test_a_transfer_receives_what_it_pays(self):
		values = {
			"doctype": "Payment Entry",
			"__islocal": 1,
			"payment_type": "Internal Transfer",
			"paid_from": cash_account(),
			"paid_to": cash_account(),
			"paid_amount": 25,
		}
		doc = self.preview(values, {"doc": ["paid_amount"]})

		self.assertEqual(doc["received_amount"], 25)

	def test_a_stock_entry_takes_its_purpose_and_its_rows_their_item_details(self):
		warehouse = frappe.db.get_value("Warehouse", {"is_group": 0, "company": erpnext_default_company()})
		values = {
			"doctype": "Stock Entry",
			"__islocal": 1,
			"stock_entry_type": "Material Receipt",
			"items": [
				{"name": "row-1", "item_code": self.pen, "qty": 2, "t_warehouse": warehouse},
				{"name": "row-2"},
			],
		}
		doc = self.preview(values, {"doc": ["stock_entry_type"], "rows": {"row-1": ["item_code"]}})

		row, blank = (frappe._dict(row) for row in doc["items"])
		self.assertEqual(doc["purpose"], "Material Receipt")
		self.assertEqual((row.uom, row.conversion_factor, row.transfer_qty), ("Nos", 1, 2))
		self.assertFalse(blank.item_code)


@needs_erpnext
class IntegrationTestAccessoryMappers(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.mappers import make_mapped_doc

		self.make_mapped_doc = make_mapped_doc
		self.customer = make_customer("Accessory Mapper Customer")
		self.item = make_item("ACC-MAPPER-PEN", 20)

	def make_quotation(self):
		quotation = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": self.customer,
				"items": [{"item_code": self.item, "qty": 2}],
			}
		)
		quotation.insert()
		quotation.submit()
		return quotation

	def test_a_quotation_is_invoiced_by_erpnext_mapper(self):
		quotation = self.make_quotation()
		invoice = self.make_mapped_doc("Quotation", quotation.name, "make_sales_invoice")

		self.assertEqual(invoice["doctype"], "Sales Invoice")
		self.assertEqual(invoice["customer"], self.customer)
		self.assertEqual(invoice["items"][0]["item_code"], self.item)

	def test_a_customer_invoice_is_a_new_invoice_for_the_customer(self):
		invoice = self.make_mapped_doc("Customer", self.customer, "make_sales_invoice")
		self.assertEqual((invoice["doctype"], invoice["customer"]), ("Sales Invoice", self.customer))

	def test_an_unmapped_action_is_refused(self):
		with self.assertRaisesRegex(frappe.ValidationError, "not available in accessory mode"):
			self.make_mapped_doc("Customer", self.customer, "make_payment")

	def test_a_mapper_needs_the_right_to_read_the_source(self):
		quotation = self.make_quotation()
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			self.make_mapped_doc("Quotation", quotation.name, "make_sales_invoice")


@needs_erpnext
class IntegrationTestAccessoryLinkedEntriesAndSearch(IntegrationTestCase):
	def test_linked_entries_list_the_erpnext_documents_that_link(self):
		from frappe_books.linked_entries import get_linked_entries

		customer = make_customer("Accessory Linked Customer")
		item = make_item("ACC-LINKED-PEN", 20)
		invoice = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"customer": customer,
				"due_date": nowdate(),
				"items": [{"item_code": item, "qty": 1}],
			}
		).insert()

		with patch("frappe_books.linked_entries.accessory_company", return_value=invoice.company):
			linked = get_linked_entries("Customer", customer)

		self.assertEqual(linked["Sales Invoice"], [invoice.name])

	def test_search_indexes_the_erpnext_twins_in_accessory_mode(self):
		from frappe_books.search import _get_search_doctypes

		doctypes = _get_search_doctypes(True)
		self.assertIn("Sales Invoice", doctypes)
		self.assertIn("Customer", doctypes)
		self.assertNotIn("Books Sales Invoice", doctypes)
		self.assertIn("Books Sales Invoice", _get_search_doctypes(False))


@needs_erpnext
class IntegrationTestAccessoryFieldPicks(IntegrationTestCase):
	def setUp(self):
		from frappe_books.frappe_books.doctype.books_field_pick.books_field_pick import save_field_picks

		self.save = save_field_picks

	def picks(self):
		doc = frappe.get_doc("Books Field Pick", "Sales Invoice")
		return [(row.table_fieldname or "", row.fieldname) for row in doc.fields]

	def test_a_save_replaces_the_picks_of_a_form(self):
		self.save(
			"Sales Invoice", [{"fieldname": "po_no"}, {"table_fieldname": "items", "fieldname": "brand"}]
		)
		self.save("Sales Invoice", [{"table_fieldname": "", "fieldname": "po_date"}])

		self.assertEqual(self.picks(), [("", "po_date")])

	def test_a_pick_of_a_field_erpnext_lacks_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.save("Sales Invoice", [{"table_fieldname": "items", "fieldname": "no_such_field"}])

	def test_only_system_managers_save_picks(self):
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			self.save("Sales Invoice", [{"fieldname": "po_no"}])


@needs_erpnext
class IntegrationTestAccessoryScreens(IntegrationTestCase):
	def setUp(self):
		self.company = erpnext_default_company()
		for module in ("accessory", "accessory.ui_settings", "permissions"):
			accessory = patch(f"frappe_books.{module}.accessory_company", return_value=self.company)
			accessory.start()
			self.addCleanup(accessory.stop)

	def test_erpnext_users_read_the_ui_settings(self):
		from frappe_books.accessory.ui_settings import get_ui_settings

		user = ensure_user("accessory-accounts-user@example.com", "Accounts User")
		with self.set_user(user):
			settings = get_ui_settings()
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			get_ui_settings()

		self.assertEqual(set(settings), {"Books System Settings", "Books Misc", "Books Print Settings"})

	def test_the_dashboard_totals_erpnext_invoices(self):
		from frappe_books.reports.dashboard import get_invoice_summary

		before = get_invoice_summary("Sales Invoice", "This Month")
		invoice = self.submit_invoice()

		after = get_invoice_summary("Sales Invoice", "This Month")
		self.assertEqual(after["unpaid"] - before["unpaid"], invoice.outstanding_amount)
		self.assertEqual(after["unpaid_count"], before["unpaid_count"] + 1)

	def test_account_balances_total_the_erpnext_ledger_of_the_company(self):
		from frappe_books.reports.financial_statements import get_account_balances

		before = get_account_balances()["balances"]
		invoice = self.submit_invoice()

		after = get_account_balances()["balances"]
		debtors = invoice.debit_to
		self.assertEqual(flt(after[debtors] - before.get(debtors, 0)), invoice.outstanding_amount)

	def submit_invoice(self):
		invoice = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": self.company,
				"customer": make_customer("Accessory Screens Customer"),
				"due_date": nowdate(),
				"items": [{"item_code": make_item("ACC-SCREENS-PEN", 20), "qty": 2}],
			}
		).insert()
		invoice.submit()
		return invoice


def make_print_format(name, **values):
	if not frappe.db.exists("Print Format", name):
		frappe.get_doc(
			{
				"doctype": "Print Format",
				"name": name,
				"doc_type": "Sales Invoice",
				"module": "Accounts",
				"standard": "No",
				"custom_format": 1,
				"print_format_type": "Jinja",
				"html": "<p>{{ doc.name }}</p>",
				**values,
			}
		).insert()
	return name


def make_letter_head(name, **values):
	if not frappe.db.exists("Letter Head", name):
		frappe.get_doc(
			{"doctype": "Letter Head", "letter_head_name": name, "source": "HTML", "content": name, **values}
		).insert()
	return name


@needs_erpnext
class IntegrationTestAccessoryPrintOptions(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.printing import get_print_options

		self.get_print_options = get_print_options
		self.company = erpnext_default_company()
		accessory = patch("frappe_books.accessory.printing.accessory_company", return_value=self.company)
		accessory.start()
		self.addCleanup(accessory.stop)

	def test_print_formats_are_desks_with_the_default_first(self):
		from frappe_books.printing import set_default_print_format

		default = make_print_format("Accessory Print Default")
		other = make_print_format("Accessory Print Other")
		disabled = make_print_format("Accessory Print Disabled", disabled=1)
		set_default_print_format("Sales Invoice", default)
		user = ensure_user("accessory-accounts-user@example.com", "Accounts User")

		with self.set_user(user):
			formats = self.get_print_options("Sales Invoice")["print_formats"]

		self.assertEqual(formats[0], default)
		self.assertIn("Standard", formats)
		self.assertIn(other, formats)
		self.assertNotIn(disabled, formats)

	def test_the_company_letter_head_is_the_default(self):
		company_default = make_letter_head("Accessory Company Letter Head")
		make_letter_head("Accessory Marked Letter Head", is_default=1)
		disabled = make_letter_head("Accessory Disabled Letter Head", disabled=1)
		frappe.db.set_value("Company", self.company, "default_letter_head", company_default)

		options = self.get_print_options("Sales Invoice")

		self.assertEqual(options["default_letter_head"], company_default)
		self.assertNotIn(disabled, options["letter_heads"])

	def test_print_options_need_the_right_to_read_the_doctype(self):
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			self.get_print_options("Sales Invoice")


@needs_erpnext
class IntegrationTestAccessoryLeadAddress(IntegrationTestCase):
	def test_a_lead_saved_with_address_values_makes_its_address(self):
		lead = frappe.get_doc(
			{
				"doctype": "Lead",
				"first_name": "Pepper",
				"company_name": "Stark Industries",
				"address_line1": "1 Main Road",
				"city": "Pune",
			}
		).insert()
		[name] = frappe.get_all(
			"Dynamic Link",
			filters={"parenttype": "Address", "link_doctype": "Lead", "link_name": lead.name},
			pluck="parent",
		)

		self.assertEqual(
			frappe.db.get_value("Address", name, ["address_title", "city"]), ("Stark Industries", "Pune")
		)

	def test_a_lead_with_only_its_own_city_makes_no_address(self):
		"""Desk fills a lead's city; only the quick-entry values /books sends make an Address."""
		lead = frappe.get_doc({"doctype": "Lead", "first_name": "Happy", "city": "Pune"}).insert()

		self.assertFalse(frappe.db.exists("Dynamic Link", {"parenttype": "Address", "link_name": lead.name}))
