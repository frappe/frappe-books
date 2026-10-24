import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime, nowdate

from frappe_books.accounting.returns import map_return
from frappe_books.inventory.returns import map_transfer_return
from frappe_books.settings import FEATURES
from frappe_books.tests.accounting import (
	enable_features,
	make_account,
	make_customer,
	make_invoice,
	make_item,
	set_company_value,
	unique_name,
)

OFF = "is turned off in"


class IntegrationTestFeatureSwitches(IntegrationTestCase):
	"""A feature the Books app hides while switched off is refused over REST too."""

	def setUp(self):
		enable_features()
		self.receivable = make_account("Receivable", account_type="Receivable")
		self.income = make_account("Sales", root_type="Income")
		self.expense = make_account("Expense", root_type="Expense")
		set_company_value("default_discount_account", self.expense.name)
		self.party = make_customer(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name)

	def switch_off(self, feature):
		frappe.db.set_single_value(FEATURES[feature], feature, 0)

	def invoice(self, **values):
		return make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			**values,
		)

	def test_discounts_need_discounting(self):
		self.switch_off("enable_discounting")
		with self.assertRaisesRegex(frappe.ValidationError, f"Discount Accounting {OFF}"):
			self.invoice()

	def test_returns_need_invoice_returns(self):
		invoice = self.invoice()
		invoice.submit()
		credit_note = map_return(invoice.doctype, invoice.name)
		self.switch_off("enable_invoice_returns")

		with self.assertRaisesRegex(frappe.ValidationError, f"Invoice Returns {OFF}"):
			map_return(invoice.doctype, invoice.name)
		with self.assertRaisesRegex(frappe.ValidationError, f"Invoice Returns {OFF}"):
			credit_note.insert()
		with self.assertRaisesRegex(frappe.ValidationError, f"Invoice Returns {OFF}"):
			map_transfer_return("Books Delivery Note", "any shipment")

	def test_coupons_need_coupon_codes(self):
		coupon = self.coupon()
		self.switch_off("enable_coupon_code")

		with self.assertRaisesRegex(frappe.ValidationError, f"Coupon Code {OFF}"):
			self.coupon()
		with self.assertRaisesRegex(frappe.ValidationError, f"Coupon Code {OFF}"):
			self.invoice(coupon_code=coupon.name)

	def test_pos_invoices_need_point_of_sale(self):
		self.switch_off("enable_point_of_sale")
		with self.assertRaisesRegex(frappe.ValidationError, f"Point of Sale {OFF}"):
			self.invoice(is_pos=1)

	def test_leads_need_the_lead_feature(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "lead_name": unique_name("Lead")}).insert()
		self.switch_off("enable_lead")

		with self.assertRaisesRegex(frappe.ValidationError, f"Lead {OFF}"):
			frappe.get_doc({"doctype": "Books Lead", "lead_name": unique_name("Lead")}).insert()
		with self.assertRaisesRegex(frappe.ValidationError, f"Lead {OFF}"):
			make_invoice(
				"Books Quotation",
				lead.name,
				None,
				self.item.name,
				self.income.name,
				quotation_to="Books Lead",
			)

	def test_loyalty_programs_need_the_loyalty_feature(self):
		program = self.loyalty_program()
		self.switch_off("enable_loyalty_program")

		with self.assertRaisesRegex(frappe.ValidationError, f"Loyalty Program {OFF}"):
			self.loyalty_program()
		self.party.loyalty_program = program.name
		with self.assertRaisesRegex(frappe.ValidationError, f"Loyalty Program {OFF}"):
			self.party.save()

	def test_stock_entrys_need_inventory(self):
		self.switch_off("enable_inventory")
		movement = frappe.get_doc(
			{"doctype": "Books Stock Entry", "movement_type": "MaterialReceipt", "date": now_datetime()}
		)
		with self.assertRaisesRegex(frappe.ValidationError, f"Inventory {OFF}"):
			movement.insert()

	def test_item_fields_need_their_features(self):
		received = make_account("Received", root_type="Liability").name
		group = (
			frappe.get_doc({"doctype": "Books Item Group", "item_group_name": unique_name("Group")})
			.insert()
			.name
		)
		for feature, values in (
			("enable_inventory", {"is_stock_item": 1}),
			("enable_batches", {"has_batch_no": 1}),
			("enable_serial_number", {"is_stock_item": 1, "has_serial_no": 1}),
			("enable_uom_conversions", {"uoms": [{"uom": "Kg", "conversion_factor": 2}]}),
			("enableitem_group", {"item_group": group}),
		):
			with self.subTest(feature=feature):
				enable_features()
				self.switch_off(feature)
				with self.assertRaisesRegex(frappe.ValidationError, OFF):
					make_item(self.income.name, received, **values)

	def test_only_tracked_products_have_stock_settings(self):
		received = make_account("Received", root_type="Liability").name
		with self.assertRaisesRegex(frappe.ValidationError, "Only products can track inventory"):
			make_item(self.income.name, received, item_type="Service", is_stock_item=1)
		with self.assertRaisesRegex(frappe.ValidationError, "Only items that track inventory"):
			make_item(self.income.name, self.expense.name, has_serial_no=1)
		with self.assertRaisesRegex(frappe.ValidationError, "Only items that track inventory"):
			make_item(self.income.name, self.expense.name, has_batch_no=1)

	def coupon(self):
		rule = frappe.get_doc(
			{
				"doctype": "Books Pricing Rule",
				"title": unique_name("Promotion"),
				"applied_items": [{"item": self.item.name}],
				"discount_type": "Price Discount",
				"price_discount_type": "amount",
				"discount_amount": 10,
				"is_coupon_code_based": 1,
			}
		).insert()
		return frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				"coupon_name": unique_name("Coupon"),
				"pricing_rule": rule.name,
				"valid_from": nowdate(),
				"valid_to": add_days(nowdate(), 1),
			}
		).insert()

	def loyalty_program(self):
		return frappe.get_doc(
			{
				"doctype": "Books Loyalty Program",
				"name": unique_name("Rewards"),
				"from_date": add_days(nowdate(), -1),
				"to_date": add_days(nowdate(), 30),
				"expense_account": self.expense.name,
			}
		).insert()
