"""Invoice calculations, validation, posting, and cancellation behavior."""

import frappe
from frappe import _
from frappe.desk.form import linked_with
from frappe.model.document import Document

from frappe_books.accounting import returns
from frappe_books.accounting.accounts import (
	latest_ledger_account,
	validate_account,
	validate_item_usage,
	validate_party_role,
)
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, company_currency, rounded, sum_decimal
from frappe_books.accounting.outstanding import update_party_outstanding
from frappe_books.accounting.payment import default_payment_account, map_invoice_payment
from frappe_books.commerce import loyalty, pricing
from frappe_books.commerce.pos import pos_customer
from frappe_books.currency import get_exchange_rate
from frappe_books.inventory.auto_transfer import cancel_auto_transfer, create_auto_transfer, default_location
from frappe_books.inventory.availability import validate_sale_batch_stock
from frappe_books.inventory.invoice_balance import (
	store_pending_quantities,
	update_billed_status,
	validate_billed_quantities,
)
from frappe_books.inventory.stock import create_series_batches, validate_batches
from frappe_books.inventory.units import populate_units
from frappe_books.permissions import check_preview_permission
from frappe_books.series import SeriesNamingMixin
from frappe_books.settings import require_feature, require_features, set_default_terms
from frappe_books.status import StatusMixin


class InvoiceController(StatusMixin, SeriesNamingMixin, Document):
	"""Totals and validation shared by quotes and invoices."""

	transaction_type: str

	def before_validate(self):
		set_default_terms(self)
		self.calculate()

	def calculate(self):
		"""Fill defaults, apply pricing and set the totals, without writing anything."""
		returns.set_quantity_signs(self.items, bool(self.get("return_against")))
		pricing.reset_pricing(self)
		_populate_invoice_defaults(self)
		pricing.apply_pricing(self)
		_populate_invoice_defaults(self)
		calculate_invoice(self)
		loyalty.set_available_points(self)

	def validate(self):
		validate_invoice(self)
		loyalty.validate_invoice_loyalty(self)

	@property
	def total_discount(self):
		"""Item discounts, as a virtual field."""
		return sum_decimal(row_discount(self, row) for row in self.items)

	@frappe.whitelist()
	def preview(self):
		"""Calculate what a save would store, without saving, for a new document or an edited draft."""
		check_preview_permission(self)
		self.set_number_series()
		set_default_terms(self)
		self.calculate()


INVOICE_FEATURES = {
	"return_against": "enable_invoice_returns",
	"coupons": "enable_coupon_code",
	"is_pos": "enable_point_of_sale",
}


class PostingInvoiceController(InvoiceController):
	"""Ledger, outstanding and follow-up effects of submitting an invoice."""

	follow_up_fields = ("make_auto_payment", "make_auto_stock_transfer")

	def __setup__(self):
		# Frappe sets missing checks to 0 before any hook; `calculate` defaults these from the settings.
		self.dont_update_if_missing.extend(self.follow_up_fields)

	def calculate(self):
		super().calculate()
		self.set_follow_up_defaults()

	def fill_mapped_values(self):
		"""Fill a mapped invoice as a save would, letting it choose its own follow-ups.

		frappe.new_doc sets every check box to 0, so the follow-up checks are cleared first.
		"""
		for fieldname in self.follow_up_fields:
			self.set(fieldname, None)
		self.calculate()

	def set_follow_up_defaults(self):
		"""Pay and transfer stock on submit when Books Defaults says where to, unless the caller chose."""
		if self.get("make_auto_payment") is None:
			self.make_auto_payment = int(bool(default_payment_account(self.doctype)))
		if self.get("make_auto_stock_transfer") is None:
			inventory = frappe.db.get_single_value("Books Accounting Settings", "enable_inventory")
			self.make_auto_stock_transfer = int(bool(inventory and default_location(self)))

	def validate(self):
		super().validate()
		if self.transaction_type == "purchase" and not self.return_against:
			create_series_batches(self.items)
		validate_batches([{"item": row.item, "batch": row.batch} for row in self.items])
		validate_sale_batch_stock(self)

	def before_submit(self):
		validate_billed_quantities(self)
		outstanding = abs(as_decimal(self.base_grand_total))
		self.outstanding_amount = -outstanding if self.return_against else outstanding

	def on_submit(self):
		post_invoice(self)
		update_party_outstanding(self.party)
		pricing.update_coupon_usage(self, 1)
		loyalty.process_invoice(self)
		update_billed_status(self)
		create_auto_transfer(self)
		store_pending_quantities(self)
		if self.return_against:
			returns.update_return_status(self, include_current=True)
		# POS invoices are paid at the counter with the tendered payment method.
		if self.make_auto_payment and self.outstanding_amount and not self.get("is_pos"):
			self.pay_outstanding_amount()

	def pay_outstanding_amount(self):
		payment = map_invoice_payment(self.doctype, self.name)
		# No one enters a bank reference for an automatic payment, so it refers to the invoice.
		payment.reference_id = self.name
		payment.insert()
		payment.submit()
		self.outstanding_amount = self.db_get("outstanding_amount")

	@frappe.whitelist()
	def cancel_with_linked_docs(self, linked_docs: list[dict]):
		"""Cancel `linked_docs`, the payments `get_payments_to_cancel` listed, and then the invoice.

		Frappe's Cancel All does it in one transaction, on a fresh copy of the invoice.
		"""
		linked_with.cancel_all_linked_docs(linked_docs, root_doctype=self.doctype, root_name=self.name)
		self.reload()

	def before_cancel(self):
		cancel_auto_transfer(self)
		self.outstanding_amount = 0

	def on_cancel(self):
		reverse_entries(self)
		update_party_outstanding(self.party)
		pricing.update_coupon_usage(self, -1)
		loyalty.reverse_invoice(self)
		update_billed_status(self)
		if self.return_against:
			returns.update_return_status(self, include_current=False)

	def on_trash(self):
		delete_entries(self)
		self.delete_cancelled_follow_ups()

	def delete_cancelled_follow_ups(self):
		"""Delete the cancelled stock transfers and payments made for this invoice, with the user's rights."""
		transfer_doctype = "Books Shipment" if self.transaction_type == "sales" else "Books Purchase Receipt"
		transfers = frappe.get_all(
			transfer_doctype, filters={"back_reference": self.name, "docstatus": 2}, pluck="name"
		)
		if self.back_reference in transfers:
			# The link back to the transfer would block deleting it.
			self.db_set("back_reference", None, update_modified=False)
		payments = frappe.get_all(
			"Books Payment For",
			filters={"reference_type": self.doctype, "reference_name": self.name, "docstatus": 2},
			pluck="parent",
		)
		for doctype, names in ((transfer_doctype, transfers), ("Books Payment", set(payments))):
			for name in names:
				frappe.delete_doc(doctype, name)


class InvoiceItemController(Document):
	"""A quote or invoice row, priced per stock unit."""

	@property
	def transfer_rate(self):
		"""The rate per transfer unit, as a virtual field, to show next to the transfer quantity."""
		currency = getattr(getattr(self, "parent_doc", None), "currency", None)
		return rounded(as_decimal(self.rate) * as_decimal(self.unit_conversion_factor or 1), currency)


@frappe.whitelist()
def get_payments_to_cancel(doctype: str, name: str) -> list[dict]:
	"""Return the submitted payments that cancelling an invoice also cancels.

	Other submitted documents that link to the invoice, like returns, still block its cancellation.
	"""
	linked = linked_with.get_submitted_linked_docs(doctype, name)
	return [doc for doc in linked["docs"] if doc["doctype"] == "Books Payment"]


def calculate_invoice(invoice):
	original = invoice.get("return_against") and frappe.get_doc(invoice.doctype, invoice.return_against)
	if original:
		returns.share_fixed_row_discounts(invoice, original)
	taxes = {}
	for row in invoice.items:
		_calculate_row(invoice, row, taxes)
	invoice.set("taxes", list(taxes.values()))
	_calculate_totals(invoice)


def _calculate_row(invoice, row, taxes):
	currency = invoice.get("currency")
	row.amount = rounded(as_decimal(row.rate) * as_decimal(row.quantity), currency)
	discount = _item_discount(row, row.amount, currency)
	tax_base = row.amount if invoice.discount_after_tax else row.amount - discount
	row_tax = _add_row_taxes(row, tax_base, taxes, currency)
	if invoice.discount_after_tax:
		row.item_taxed_total = row.amount + row_tax
		row.item_discounted_total = row.item_taxed_total - _item_discount(row, row.item_taxed_total, currency)
	else:
		row.item_discounted_total = row.amount - discount
		row.item_taxed_total = row.item_discounted_total + row_tax


def _add_row_taxes(row, base, taxes, currency):
	row_tax = as_decimal(0)
	for detail in _tax_details(row.tax):
		amount = rounded(base * as_decimal(detail.rate) / 100, currency)
		tax = taxes.setdefault(
			detail.account, {"account": detail.account, "rate": detail.rate, "amount": as_decimal(0)}
		)
		tax["amount"] += amount
		row_tax += amount
	return row_tax


def _calculate_totals(invoice):
	currency = invoice.get("currency")
	invoice.net_total = sum_decimal(row.amount for row in invoice.items)
	grand_total = (
		invoice.net_total + sum_decimal(tax.amount for tax in invoice.taxes) - invoice.total_discount
	)
	if invoice.transaction_type == "sales" and invoice.get("return_against"):
		loyalty.set_return_redemption(invoice, grand_total)
	if invoice.transaction_type == "sales":
		grand_total -= loyalty.redemption_amount(invoice)
	invoice.grand_total = rounded(grand_total, currency)
	invoice.base_grand_total = rounded(invoice.grand_total * as_decimal(invoice.exchange_rate or 1))
	if invoice.docstatus == 0:
		invoice.outstanding_amount = abs(invoice.base_grand_total)


def row_discount(invoice, row):
	"""Return the item discount of a calculated row, signed like its amount."""
	undiscounted = row.item_taxed_total if invoice.discount_after_tax else row.amount
	return as_decimal(undiscounted) - as_decimal(row.item_discounted_total)


def validate_invoice(invoice):
	if not invoice.items:
		frappe.throw(_("At least one invoice item is required."))
	_validate_features(invoice)
	_validate_party_and_account(invoice)
	pricing.validate_price_list(invoice)
	if as_decimal(invoice.exchange_rate) <= 0:
		frappe.throw(
			_("Set an exchange rate from {0} to {1} above zero.").format(invoice.currency, company_currency())
		)
	for row in invoice.items:
		_validate_row(invoice, row)
	validate_item_usage(invoice, invoice.transaction_type == "purchase")
	if invoice.get("return_against"):
		returns.validate_return(invoice)


def _validate_features(invoice):
	"""Reject what the Books app offers only while its feature is on."""
	require_features(invoice, INVOICE_FEATURES)
	if invoice.get("reference_type") == "Books Lead":
		require_feature("enable_lead")
	if _has_manual_discount(invoice):
		require_feature("enable_discounting")


def _has_manual_discount(invoice):
	"""Pricing rules discount rows under their own switch; other row discounts need discounting."""
	return any(
		as_decimal(row.item_discount_percent) or as_decimal(row.item_discount_amount)
		for row in invoice.items
		if not row.get("pricing_rule")
	)


def _validate_party_and_account(invoice):
	"""Sales go to customers and receivables, purchases to suppliers and payables."""
	is_purchase = invoice.transaction_type == "purchase"
	if _has_books_party(invoice):
		validate_party_role(invoice, is_purchase)
	if invoice.transaction_type != "quote":
		validate_account(invoice, "account", ("Payable" if is_purchase else "Receivable",))


def _validate_row(invoice, row):
	if not row.item:
		frappe.throw(_("Every invoice row requires an item."))
	quantity = as_decimal(row.quantity)
	if quantity == 0:
		frappe.throw(_("Item quantity cannot be zero."))
	if as_decimal(row.rate) < 0:
		frappe.throw(_("Item rate cannot be negative."))
	_validate_row_discount(row)


def _validate_row_discount(row):
	if row.set_item_discount_amount:
		if not 0 <= as_decimal(row.item_discount_amount) <= abs(as_decimal(row.amount)):
			frappe.throw(_("Item discount amount cannot exceed the row amount."))
	elif not 0 <= as_decimal(row.item_discount_percent) <= 100:
		frappe.throw(_("Item discount percent must be between 0 and 100."))


def post_invoice(invoice):
	posting = LedgerPosting(invoice)
	total = abs(as_decimal(invoice.base_grand_total))
	exchange_rate = as_decimal(invoice.exchange_rate or 1)
	is_return = bool(invoice.get("return_against"))

	if invoice.transaction_type == "sales":
		_post_sales(invoice, posting, total, exchange_rate, is_return)
	else:
		_post_purchase(invoice, posting, total, exchange_rate, is_return)
	posting.post()


def _post_sales(invoice, posting, total, exchange_rate, is_return):
	_post_direction(posting, invoice.account, total, invoice.party, reverse=is_return)
	loyalty_amount = abs(loyalty.redemption_amount(invoice)) * exchange_rate
	if loyalty_amount:
		_post_direction(
			posting,
			loyalty.loyalty_expense_account(invoice),
			loyalty_amount,
			reverse=is_return,
		)
	for row in invoice.items:
		_post_direction(
			posting, row.account, abs(as_decimal(row.amount) * exchange_rate), credit=True, reverse=is_return
		)
	for tax in invoice.taxes:
		_post_direction(
			posting, tax.account, abs(as_decimal(tax.amount) * exchange_rate), credit=True, reverse=is_return
		)
	_post_discount(invoice, posting, exchange_rate, credit=False, reverse=is_return)


def _post_purchase(invoice, posting, total, exchange_rate, is_return):
	_post_direction(posting, invoice.account, total, invoice.party, credit=True, reverse=is_return)
	for row in invoice.items:
		_post_direction(posting, row.account, abs(as_decimal(row.amount) * exchange_rate), reverse=is_return)
	for tax in invoice.taxes:
		_post_direction(posting, tax.account, abs(as_decimal(tax.amount) * exchange_rate), reverse=is_return)
	_post_discount(invoice, posting, exchange_rate, credit=True, reverse=is_return)


def _post_discount(invoice, posting, exchange_rate, credit, reverse):
	item_discount = sum_decimal(row_discount(invoice, row) for row in invoice.items)
	discount = abs(item_discount) * exchange_rate
	if discount == 0:
		return
	account = frappe.db.get_single_value("Books Accounting Settings", "discount_account")
	if not account:
		frappe.throw(_("Set a discount account in Books Accounting Settings."))
	_post_direction(posting, account, discount, credit=credit, reverse=reverse)


def _post_direction(posting, account, amount, party=None, credit=False, reverse=False):
	if credit ^ reverse:
		posting.credit(account, amount, party)
	else:
		posting.debit(account, amount, party)


def _populate_invoice_defaults(invoice):
	_populate_pos_defaults(invoice)
	_populate_party_defaults(invoice)
	populate_units(invoice.get("items", []))
	items = _item_details({row.item for row in invoice.get("items", []) if row.item})
	rates = pricing.standard_rates(invoice) if items else {}
	for row in invoice.get("items", []):
		if row.item in items:
			_populate_row(invoice, row, items[row.item], rates)


def _populate_pos_defaults(invoice):
	"""A POS sale bills the POS customer to the POS Settings account, unless told otherwise."""
	if not invoice.get("is_pos"):
		return
	invoice.party = invoice.party or pos_customer()
	invoice.account = invoice.get("account") or frappe.db.get_single_value(
		"Books Pos Settings", "default_account"
	)


def _populate_party_defaults(invoice):
	party = _party_defaults(invoice)
	_populate_currency(invoice, party.currency)
	if invoice.transaction_type == "quote" or not party:
		return
	invoice.account = invoice.get("account") or _party_account(invoice, party.default_account)
	if invoice.transaction_type == "sales" and not invoice.get("return_against"):
		invoice.loyalty_program = party.loyalty_program


def _party_account(invoice, account):
	"""The party's ledger if it suits the invoice, else the newest that does.

	A party with both roles has one ledger, receivable or payable, for either invoice.
	"""
	account_type = "Payable" if invoice.transaction_type == "purchase" else "Receivable"
	if account and frappe.db.get_value("Books Account", account, "account_type") == account_type:
		return account
	return latest_ledger_account(account_type)


def _party_defaults(invoice):
	"""Return the party's invoice defaults; a quote to a lead has none."""
	if not invoice.party or not _has_books_party(invoice):
		return frappe._dict()
	fields = ["currency", "default_account", "loyalty_program"]
	return frappe.db.get_value("Books Party", invoice.party, fields, as_dict=True) or frappe._dict()


def _has_books_party(invoice):
	"""Quotes can go to a lead instead."""
	return (invoice.get("reference_type") or "Books Party") == "Books Party"


def _populate_currency(invoice, party_currency):
	"""Bill in the party's currency; the company currency needs no exchange rate."""
	company = company_currency()
	invoice.currency = party_currency or company
	if invoice.currency == company:
		invoice.exchange_rate = 1
	elif not invoice.get("exchange_rate"):
		invoice.exchange_rate = get_exchange_rate(invoice.currency, company, invoice.date)


def _populate_row(invoice, row, item, rates):
	for fieldname in ("item_code", "description", "unit", "hsn_code"):
		if not row.get(fieldname):
			row.set(fieldname, item.get(fieldname))
	# A tax left out follows the item; an empty one sent, as a cleared tax, stays empty.
	if row.get("tax") is None:
		row.tax = item.tax
	_populate_rate_from_transfer_rate(row)
	if not row.rate and not (row.is_manual_rate or row.get("is_free_item")):
		row.rate = pricing.standard_rate(invoice, row, rates)
	if not row.account:
		row.account = item.expense_account if invoice.transaction_type == "purchase" else item.income_account
	# The Qty column shows the quantity in the transfer unit.
	row.qty = row.transfer_quantity


def _populate_rate_from_transfer_rate(row):
	"""Take a manual rate sent only per transfer unit, as /books sends an edited one, per stock unit.

	A sent rate wins over the virtual `transfer_rate`, which `row.get` reads as sent.
	"""
	transfer_rate = row.get("transfer_rate")
	if row.is_manual_rate and row.get("rate") is None and transfer_rate is not None:
		row.rate = as_decimal(transfer_rate) / as_decimal(row.unit_conversion_factor or 1)


def _item_details(names):
	if not names:
		return {}
	rows = frappe.get_all(
		"Books Item",
		filters={"name": ["in", sorted(names)]},
		fields=[
			"name",
			"item_code",
			"description",
			"unit",
			"tax",
			"item_group.tax as group_tax",
			"hsn_code",
			"income_account",
			"expense_account",
		],
	)
	for row in rows:
		row.tax = row.tax or row.group_tax
	return {row.name: row for row in rows}


def _tax_details(tax_name):
	if not tax_name:
		return []
	return frappe.get_cached_doc("Books Tax", tax_name).details


def _item_discount(row, amount, currency):
	if row.set_item_discount_amount:
		discount = as_decimal(row.item_discount_amount)
	else:
		discount = abs(amount) * as_decimal(row.item_discount_percent) / 100
	return rounded(-discount if amount < 0 else discount, currency)
