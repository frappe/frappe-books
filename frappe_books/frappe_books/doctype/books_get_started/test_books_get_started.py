# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party


class IntegrationTestBooksGetStarted(IntegrationTestCase):
	def test_record_tasks_are_checked_when_read(self):
		income = make_account("Get Started Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Get Started Expense", root_type="Expense", account_type="Expense Account")
		make_item(income.name, expense.name, item_usage="Both")
		make_party(make_account("Get Started Receivable", account_type="Receivable").name, role="Customer")

		checks = frappe.get_single("Books Get Started").as_dict()

		self.assertEqual(
			(checks.sales_item_created, checks.purchase_item_created, checks.customer_created), (1, 1, 1)
		)

	def test_saving_a_task_keeps_the_record_checks_computed(self):
		make_party(make_account("Get Started Payable", account_type="Payable").name, role="Supplier")

		checks = frappe.get_single("Books Get Started")
		checks.update({"print_setup": 1, "supplier_created": 0})
		checks.save()

		self.assertEqual((checks.print_setup, checks.supplier_created), (1, 1))

	def test_tasks_are_complete_once_every_task_is_done(self):
		income = make_account("Done Sales", root_type="Income", account_type="Income Account").name
		expense = make_account("Done Expense", root_type="Expense", account_type="Expense Account").name
		receivable = make_account("Done Receivable", account_type="Receivable").name
		payable = make_account("Done Payable", account_type="Payable").name
		item = make_item(income, expense, item_usage="Both").name
		party = make_party(receivable, role="Both").name
		make_invoice("Books Sales Invoice", party, receivable, item, income)
		make_invoice("Books Purchase Invoice", party, payable, item, expense)
		checks = frappe.get_single("Books Get Started")
		stored = [df.fieldname for df in checks.meta.fields if not df.is_virtual]
		checks.update(dict.fromkeys(stored, 1) | {"onboarding_complete": 0, "taxes_added": 0})
		checks.save()
		self.assertEqual(checks.as_dict().tasks_complete, 0)

		checks.taxes_added = 1
		checks.save()

		self.assertEqual(frappe.get_single("Books Get Started").as_dict().tasks_complete, 1)
