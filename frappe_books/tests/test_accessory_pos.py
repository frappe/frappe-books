"""POS in accessory mode: ERPNext POS entries, POS invoices, prices, preferences and stock checks."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, flt, now_datetime, nowdate

from frappe_books.accessory import erpnext_default_company
from frappe_books.tests import needs_erpnext
from frappe_books.tests.accounting import ensure_user
from frappe_books.tests.test_accessory_erpnext import (
	NO_RIGHTS_USER,
	leaf,
	make_customer,
	make_item,
	make_print_format,
)

CASHIER = "accessory-pos-cashier@example.com"
# Modules that read the accessory company themselves
ACCESSORY_MODULES = ("accessory", "accessory.ui_settings", "inventory.availability", "permissions")


def make_pos_profile(name, company, **values):
	"""A POS Profile with Cash as its mode of payment, open to the test cashier."""
	if frappe.db.exists("POS Profile", name):
		return frappe.get_doc("POS Profile", name)

	cash_account, cost_center, write_off = frappe.db.get_value(
		"Company", company, ["default_cash_account", "cost_center", "write_off_account"]
	)
	mode = frappe.get_doc("Mode of Payment", "Cash")
	if not any(row.company == company for row in mode.accounts):
		mode.append("accounts", {"company": company, "default_account": cash_account})
		mode.save()
	return frappe.get_doc(
		{
			"doctype": "POS Profile",
			"__newname": name,
			"company": company,
			"warehouse": frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}),
			"selling_price_list": "Standard Selling",
			"currency": frappe.db.get_value("Company", company, "default_currency"),
			"write_off_account": write_off,
			"write_off_cost_center": cost_center,
			"cost_center": cost_center,
			"write_off_limit": 1,
			"update_stock": 0,
			# Tests pay their invoices in part
			"allow_partial_payment": 1,
			"payments": [{"mode_of_payment": "Cash", "default": 1}],
			"applicable_for_users": [{"user": CASHIER}],
			**values,
		}
	).insert()


def make_pos_invoice(profile, customer, item, **values):
	"""A submitted POS invoice of the profile, paid in cash by `paid`."""
	paid = values.pop("paid", 0)
	invoice = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"company": profile.company,
			"customer": customer,
			"is_pos": 1,
			"pos_profile": profile.name,
			"due_date": nowdate(),
			"items": [{"item_code": item, "qty": 1}],
			"payments": [{"mode_of_payment": "Cash", "amount": paid}],
			**values,
		}
	).insert()
	invoice.submit()
	return invoice


@needs_erpnext
class IntegrationTestAccessoryPOS(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.preview import preview

		self.preview = preview
		self.company = erpnext_default_company()
		for module in ACCESSORY_MODULES:
			accessory = patch(f"frappe_books.{module}.accessory_company", return_value=self.company)
			accessory.start()
			self.addCleanup(accessory.stop)
		ensure_user(CASHIER, "Accounts User", "Sales Manager")
		ensure_user(NO_RIGHTS_USER)
		self.profile = make_pos_profile("Accessory POS Counter", self.company)
		self.customer = make_customer("Accessory POS Customer")
		self.item = make_item("ACC-POS-PEN", 20)

	def test_a_new_profile_lists_its_modes_on_the_opening_entry(self):
		values = {"doctype": "POS Opening Entry", "__islocal": 1, "pos_profile": self.profile.name}

		opened = self.preview(values, {"doc": ["pos_profile"]})
		kept = self.preview({**values, "balance_details": []}, {"doc": ["period_start_date"]})

		self.assertEqual([row["mode_of_payment"] for row in opened["balance_details"]], ["Cash"])
		self.assertEqual(opened["user"], frappe.session.user)
		self.assertFalse(kept["balance_details"])

	def test_a_pos_invoice_keeps_its_tendered_payments(self):
		values = {
			"doctype": "Sales Invoice",
			"__islocal": 1,
			"is_pos": 1,
			"pos_profile": self.profile.name,
			"customer": self.customer,
			"items": [{"name": "row-1", "item_code": self.item, "qty": 2}],
			"payments": [{"name": "pay-1", "mode_of_payment": "Cash", "amount": 15}],
		}

		doc = self.preview(values, {"rows": {"row-1": ["item_code"]}})

		self.assertEqual([(row["mode_of_payment"], row["amount"]) for row in doc["payments"]], [("Cash", 15)])
		self.assertEqual(doc["paid_amount"], 15)

	def test_the_coupon_check_refuses_an_expired_coupon(self):
		coupon = self.make_expired_coupon()
		values = {
			"doctype": "Sales Invoice",
			"__islocal": 1,
			"customer": self.customer,
			"coupon_code": coupon,
			"items": [{"name": "row-1", "item_code": self.item, "qty": 1}],
		}

		self.preview(values, {})
		with self.assertRaises(frappe.ValidationError):
			self.preview(values, {}, check_coupons=True)

	def open_shift(self):
		"""A submitted POS Opening Entry of the user with 100 in cash, the profile's and user's only open one."""
		# ERPNext opens one shift per profile and per user; earlier tests of the class leave theirs open.
		for fieldname, value in (("pos_profile", self.profile.name), ("user", frappe.session.user)):
			frappe.db.set_value("POS Opening Entry", {fieldname: value, "status": "Open"}, "status", "Closed")
		opening = frappe.get_doc(
			{
				"doctype": "POS Opening Entry",
				"company": self.company,
				"pos_profile": self.profile.name,
				"user": frappe.session.user,
				"period_start_date": now_datetime(),
				"posting_date": nowdate(),
				"balance_details": [{"mode_of_payment": "Cash", "opening_amount": 100}],
			}
		)
		opening.submit()
		return opening

	def test_the_closing_entry_expects_the_opening_amounts_plus_the_shift_payments(self):
		opening = self.open_shift()
		invoice = make_pos_invoice(self.profile, self.customer, self.item, is_created_using_pos=1, paid=23.6)

		closing = self.preview(
			{"doctype": "POS Closing Entry", "__islocal": 1, "pos_opening_entry": opening.name},
			{"doc": ["pos_opening_entry"]},
		)

		row = closing["payment_reconciliation"][0]
		self.assertEqual(closing["pos_profile"], self.profile.name)
		self.assertEqual([r["sales_invoice"] for r in closing["sales_invoices"]], [invoice.name])
		self.assertEqual(row["opening_amount"], 100)
		self.assertEqual(row["expected_amount"], flt(100 + invoice.paid_amount))
		self.assertEqual(row["closing_amount"], row["expected_amount"])

	def test_a_new_closing_entry_closes_the_users_open_shift(self):
		opening = self.open_shift()

		closing = self.preview({"doctype": "POS Closing Entry", "__islocal": 1}, {})

		self.assertEqual(closing["pos_opening_entry"], opening.name)
		self.assertEqual(closing["payment_reconciliation"][0]["expected_amount"], 100)

	def test_a_submitted_pos_invoice_is_paid_with_payment_entries(self):
		from frappe_books.accessory.pos import pay_pos_invoice

		invoice = make_pos_invoice(self.profile, self.customer, self.item, paid=5)

		names = pay_pos_invoice(invoice.name, [{"mode_of_payment": "Cash", "amount": 1000}])

		payment = frappe.get_doc("Payment Entry", names[0])
		self.assertEqual(payment.docstatus, 1)
		self.assertEqual(payment.mode_of_payment, "Cash")
		self.assertEqual(payment.paid_amount, invoice.outstanding_amount)
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice.name, "outstanding_amount"), 0)

	def test_cashiers_read_the_profile_prices_without_item_price_rights(self):
		from frappe_books.accessory.pos import get_selling_rates

		with self.set_user(CASHIER):
			rates = get_selling_rates(self.profile.name)
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			get_selling_rates(self.profile.name)

		self.assertEqual(rates[self.item], 20)

	def test_erpnext_users_read_the_pos_preferences(self):
		from frappe_books.accessory.pos import get_pos_preferences

		with self.set_user(CASHIER):
			preferences = get_pos_preferences()
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			get_pos_preferences()

		self.assertIn("pay_button_colour", preferences)
		self.assertIsInstance(preferences["pos_cash_denominations"], list)

	def test_sale_shortfalls_read_erpnext_stock_at_the_rows_warehouse(self):
		from frappe_books.inventory.availability import get_sale_shortfalls

		warehouse = self.profile.warehouse
		service = make_item("ACC-POS-SERVICE", 10)
		frappe.db.set_value("Item", service, "is_stock_item", 0)
		rows = [
			{"item_code": self.item, "stock_qty": 1_000_000},
			{"item_code": service, "stock_qty": 5, "warehouse": warehouse},
		]

		shortfalls = get_sale_shortfalls(rows, warehouse=warehouse)

		self.assertEqual(
			[(row["item_code"], row["warehouse"]) for row in shortfalls], [(self.item, warehouse)]
		)

	def test_a_pos_invoice_prints_with_its_profile_format_first(self):
		from frappe_books.accessory.printing import get_print_options

		receipt = make_print_format("Accessory POS Receipt")
		self.profile.db_set("print_format", receipt)
		invoice = make_pos_invoice(self.profile, self.customer, self.item, paid=0)

		with patch("frappe_books.accessory.printing.accessory_company", return_value=self.company):
			formats = get_print_options("Sales Invoice", invoice.name)["print_formats"]

		self.assertEqual(formats[0], receipt)

	def make_expired_coupon(self):
		name = "ACC-POS-EXPIRED"
		if not frappe.db.exists("Coupon Code", name):
			rule = frappe.get_doc(
				{
					"doctype": "Pricing Rule",
					"title": "Accessory POS coupon rule",
					"apply_on": "Item Group",
					"item_groups": [{"item_group": leaf("Item Group")}],
					"selling": 1,
					"company": self.company,
					"coupon_code_based": 1,
					"rate_or_discount": "Discount Percentage",
					"discount_percentage": 10,
				}
			).insert()
			frappe.get_doc(
				{
					"doctype": "Coupon Code",
					"coupon_name": name,
					"coupon_code": name,
					"coupon_type": "Promotional",
					"pricing_rule": rule.name,
					"valid_upto": add_days(nowdate(), -1),
				}
			).insert()
		return name
