from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate

from frappe_books.commerce.loyalty import expire_programs_and_points
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	unique_name,
)


class IntegrationTestLoyalty(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Commerce Receivable", account_type="Receivable")
		self.income = make_account("Commerce Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Commerce Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name)

	def test_loyalty_earning_redemption_and_cancel(self):
		program = self._loyalty_program()
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			loyalty_program=program.name,
		)
		invoice.submit()
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 180)

		redemption = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			loyalty_program=program.name,
			redeem_loyalty_points=1,
			loyalty_points=20,
		)
		self.assertEqual(Decimal(str(redemption.grand_total)), Decimal("170"))
		redemption.submit()
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 160)
		entries = ledger_entries(redemption.doctype, redemption.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("200"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("200"))
		redemption.cancel()
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 180)

	def test_expiry_job_disables_program_and_expires_points(self):
		program = self._loyalty_program()
		frappe.db.set_value(
			"Books Loyalty Program",
			program.name,
			{"from_date": add_days(nowdate(), -2), "to_date": add_days(nowdate(), -1)},
		)
		frappe.get_doc(
			{
				"doctype": "Books Loyalty Point Entry",
				"loyalty_program": program.name,
				"customer": self.party.name,
				"invoice": self._submitted_invoice().name,
				"loyalty_points": 50,
				"purchase_amount": 50,
				"posting_date": add_days(nowdate(), -2),
				"expiry_date": add_days(nowdate(), -1),
			}
		).insert()
		frappe.db.set_value("Books Party", self.party.name, "loyalty_points", 50)

		expire_programs_and_points()

		self.assertEqual(frappe.db.get_value("Books Loyalty Program", program.name, "is_enabled"), 0)
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 0)

	def _loyalty_program(self):
		return frappe.get_doc(
			{
				"doctype": "Books Loyalty Program",
				"name": unique_name("Rewards"),
				"from_date": add_days(nowdate(), -1),
				"to_date": add_days(nowdate(), 30),
				"conversion_factor": 0.5,
				"expiry_duration": 30,
				"expense_account": self.expense.name,
				"collection_rules": [{"tier_name": "Base", "collection_factor": 1, "minimum_total_spent": 0}],
			}
		).insert()

	def _submitted_invoice(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.submit()
		return invoice
