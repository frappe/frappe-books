from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import (
	make_account,
	make_customer,
	make_item,
	make_supplier,
	make_tax,
	unique_name,
)

NO_FOLLOW_UPS = {"make_auto_payment": 0, "make_auto_stock_transfer": 0}


class IntegrationTestInvoiceTaxes(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Receivable", account_type="Receivable").name
		self.income = make_account("Sales", root_type="Income", account_type="Income Account").name
		self.expense = make_account("Purchases", root_type="Expense", account_type="Expense Account").name
		self.vat = make_account("VAT", root_type="Liability", account_type="Tax").name
		self.freight = make_account("Freight", root_type="Expense", account_type="Expense Account").name
		self.customer = make_customer(self.receivable).name
		# 400 at an item template of 5%, 250 without one.
		self.taxed_item = make_item(self.income, self.expense, make_tax(self.vat, 5).name, standard_rate=400)
		self.item = make_item(self.income, self.expense, standard_rate=250)
		# Tests in a class share a transaction, and one of them makes a default template.
		frappe.db.set_value("Books Sales Taxes and Charges Template", {"is_default": 1}, "is_default", 0)

	def test_a_template_fills_the_rows_and_an_item_template_overrides_their_rate(self):
		template = self.make_template(
			[
				{"charge_type": "On Net Total", "account_head": self.vat, "rate": 10},
				{"charge_type": "Actual", "account_head": self.freight, "tax_amount": 25},
				{"charge_type": "On Previous Row Total", "account_head": self.freight, "rate": 1},
			]
		)
		invoice = self.make_invoice(taxes_and_charges=template)
		# 800 at 5% and 250 at 10% is 65; freight 25 is shared 800:250; 1% of each running total.
		self.assertEqual(
			[(tax.charge_type, tax.tax_amount, tax.total, tax.row_id) for tax in invoice.taxes],
			[
				("On Net Total", Decimal("65"), Decimal("1115"), None),
				("Actual", Decimal("25"), Decimal("1140"), None),
				("On Previous Row Total", Decimal("11.4"), Decimal("1151.4"), "2"),
			],
		)
		self.assertEqual(invoice.total_taxes_and_charges, Decimal("101.4"))
		self.assertEqual(invoice.grand_total, Decimal("1151.4"))

	def test_rows_the_item_templates_add_tax_only_their_items(self):
		invoice = self.make_invoice()
		[tax] = invoice.taxes
		self.assertEqual(
			(tax.charge_type, tax.account_head, tax.rate, tax.set_by_item_tax_template),
			("On Net Total", self.vat, 5, 1),
		)
		self.assertEqual(tax.tax_amount, Decimal("40"))
		details = {(row.item_row, row.rate, row.amount) for row in invoice.item_wise_tax_details}
		self.assertEqual(details, {(invoice.items[0].name, 5, 40)})

	def test_a_previous_row_charge_refers_to_the_row_before_unless_told(self):
		rows = [
			{"charge_type": "Actual", "account_head": self.freight, "tax_amount": 100},
			{"charge_type": "On Previous Row Amount", "account_head": self.vat, "rate": 10},
		]
		invoice = self.make_invoice(taxes_and_charges=self.make_template(rows), items=[self.row(self.item)])
		self.assertEqual(invoice.taxes[1].row_id, "1")
		self.assertEqual(invoice.taxes[1].tax_amount, Decimal("10"))

		first = [{"charge_type": "On Previous Row Total", "account_head": self.vat, "rate": 10}]
		with self.assertRaises(frappe.ValidationError):
			self.make_template(first)
		late = [{**rows[0]}, {**rows[1], "row_id": "2"}]
		with self.assertRaises(frappe.ValidationError):
			self.make_template(late)

	def test_a_changed_template_replaces_the_rows_and_a_new_invoice_starts_with_the_default(self):
		default = self.make_template(
			[{"charge_type": "Actual", "account_head": self.freight, "tax_amount": 25}], is_default=1
		)
		other = self.make_template([{"charge_type": "On Net Total", "account_head": self.vat, "rate": 10}])
		invoice = self.make_invoice(items=[self.row(self.item)])
		self.assertEqual(invoice.taxes_and_charges, default)
		self.assertEqual([tax.account_head for tax in invoice.taxes], [self.freight])

		invoice.taxes_and_charges = other
		invoice.save()
		self.assertEqual([(tax.account_head, tax.tax_amount) for tax in invoice.taxes], [(self.vat, 25)])

	def test_a_return_gives_back_its_actual_charges(self):
		template = self.make_template(
			[{"charge_type": "Actual", "account_head": self.freight, "tax_amount": 25}]
		)
		invoice = self.make_invoice(taxes_and_charges=template, items=[self.row(self.item)]).submit()
		credit_note = map_return(invoice.doctype, invoice.name).update(NO_FOLLOW_UPS).insert()
		self.assertEqual(credit_note.is_return, 1)
		self.assertEqual(credit_note.taxes[0].tax_amount, Decimal("-25"))
		self.assertEqual(credit_note.grand_total, Decimal("-275"))

	def test_purchase_rows_add_to_the_total(self):
		payable = make_account("Payable", root_type="Liability", account_type="Payable").name
		invoice = frappe.get_doc(
			{
				"doctype": "Books Purchase Invoice",
				"supplier": make_supplier(payable).name,
				"items": [self.row(self.taxed_item)],
				**NO_FOLLOW_UPS,
			}
		).insert()
		self.assertEqual((invoice.taxes[0].category, invoice.taxes[0].add_deduct_tax), ("Total", "Add"))
		invoice.taxes[0].add_deduct_tax = "Deduct"
		with self.assertRaises(frappe.ValidationError):
			invoice.save()

	def make_invoice(self, **values):
		values.setdefault("items", [self.row(self.taxed_item, 2), self.row(self.item)])
		return frappe.get_doc(
			{"doctype": "Books Sales Invoice", "customer": self.customer, **NO_FOLLOW_UPS, **values}
		).insert()

	def make_template(self, taxes, **values):
		return (
			frappe.get_doc(
				{
					"doctype": "Books Sales Taxes and Charges Template",
					"title": unique_name("Taxes"),
					"taxes": taxes,
					**values,
				}
			)
			.insert()
			.name
		)

	@staticmethod
	def row(item, qty=1):
		return {"item_code": item.name, "qty": qty}
