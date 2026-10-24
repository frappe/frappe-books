"""Invoice calculations, validation, posting, and cancellation behavior."""

import frappe
from frappe import _
from frappe.desk.form import linked_with
from frappe.model.document import Document

from frappe_books.accounting import returns, settlement
from frappe_books.accounting.accounts import latest_ledger_account, validate_account
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, company_currency, rounded, sum_decimal
from frappe_books.accounting.party import PartyDocumentMixin, party_account
from frappe_books.accounting.payment import default_payment_account, map_invoice_payment
from frappe_books.accounting.taxes import calculate_taxes, set_taxes
from frappe_books.commerce import pricing
from frappe_books.commerce.pos import pos_customer
from frappe_books.company import company_value
from frappe_books.currency import get_exchange_rate
from frappe_books.frappe_books.doctype.books_item.books_item import company_item_defaults, item_tax_templates
from frappe_books.inventory import invoice_transfer
from frappe_books.inventory.availability import validate_sale_batch_stock
from frappe_books.inventory.stock import validate_batches
from frappe_books.inventory.units import populate_units
from frappe_books.permissions import check_preview_permission
from frappe_books.regional import validate_hsn_codes
from frappe_books.series import SeriesNamingMixin
from frappe_books.settings import require_feature, require_features, set_default_terms
from frappe_books.status import StatusMixin


class InvoiceController(PartyDocumentMixin, StatusMixin, SeriesNamingMixin, Document):
	"""Totals and validation shared by quotes and invoices.

	Each kind of invoice sets the attributes below, and overrides the hooks its own rules need.
	"""

	transaction_type: str
	# Purchases buy from suppliers on purchase price lists, and credit the party.
	is_purchase: bool
	# The party's ledger account type, or None for a quote, which posts nothing.
	party_account_type: str | None
	# The field that holds the party's ledger account, or None for a quote.
	party_account_field: str | None
	# The item and row field that holds a row's income or expense account; a quote's rows have none.
	item_account_field: str | None
	# The document's date field.
	date_field = "posting_date"
	# The party fields that fill an invoice's defaults.
	party_default_fields = ("default_currency",)

	def before_validate(self):
		set_default_terms(self)
		self.calculate()

	@property
	def document_date(self):
		return self.get(self.date_field)

	def calculate(self, drop_invalid_coupons=False):
		"""Fill defaults, apply pricing and set the taxes and totals, without writing anything."""
		returns.set_quantity_signs(self.items, bool(self.get("return_against")))
		self.set_prices(drop_invalid_coupons)
		set_taxes(self)
		calculate_invoice(self)

	def set_prices(self, drop_invalid_coupons=False):
		"""Fill the defaults, standard rates included; sales also apply pricing rules."""
		self.populate_defaults()

	def populate_defaults(self):
		"""Fill the POS, party and row defaults."""
		_populate_pos_defaults(self)
		self.populate_party_defaults()
		self.populate_rows(self.get("items", []))

	def populate_party_defaults(self):
		"""Bill in the party's currency to its ledger, and return the party's defaults."""
		party = _party_defaults(self)
		_populate_currency(self, party.default_currency)
		if party and self.party_account_type:
			account = self.get(self.party_account_field) or _party_account(
				self, party_account(self.party_type, self.party)
			)
			self.set(self.party_account_field, account)
		return party

	def populate_rows(self, rows):
		"""Fill the rows' units, item details, accounts and standard rates."""
		populate_units(rows)
		items = _item_details({row.item_code for row in rows if row.item_code}, self.document_date)
		rates = pricing.standard_rates(self) if items else {}
		for row in rows:
			if row.item_code in items:
				_populate_row(self, row, items[row.item_code], rates)

	def set_loyalty_amount(self):
		"""Set what redeemed loyalty points pay; only sales redeem them."""

	def validate(self):
		validate_invoice(self)

	@frappe.whitelist()
	def preview(self, check_coupons: bool = False):
		"""Calculate what a save would store, without saving, for a new document or an edited draft.

		A POS sale's cart changes under its coupons, so its preview takes off the
		ones that no longer apply, unless `check_coupons` asks why one does not.
		"""
		check_preview_permission(self)
		self.set_number_series()
		set_default_terms(self)
		self.calculate(drop_invalid_coupons=bool(self.get("is_pos")) and not check_coupons)


INVOICE_FEATURES = {
	"return_against": "enable_invoice_returns",
	"coupon_code": "enable_coupon_code",
	"is_pos": "enable_point_of_sale",
}


class PostingInvoiceController(InvoiceController):
	"""Ledger, outstanding and follow-up effects of submitting an invoice."""

	follow_up_fields = ("make_auto_payment", "make_auto_stock_transfer")

	def __setup__(self):
		# Frappe sets missing checks to 0 before any hook; `calculate` defaults these from the settings.
		self.dont_update_if_missing.extend(self.follow_up_fields)

	def calculate(self, drop_invalid_coupons=False):
		self.is_return = int(bool(self.return_against))
		super().calculate(drop_invalid_coupons)
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
			self.make_auto_stock_transfer = int(bool(inventory and invoice_transfer.default_location(self)))

	def validate(self):
		super().validate()
		self.create_batches()
		validate_batches([{"item_code": row.item_code, "batch_no": row.batch_no} for row in self.items])
		validate_sale_batch_stock(self)

	def create_batches(self):
		"""Create the batches the rows need before they are checked; purchases create series batches."""

	def get_ledger_posting(self):
		"""Return the invoice's ledger entries, not yet posted."""
		posting = InvoicePosting(self)
		posting.on_party_side(self.get(self.party_account_field), self.grand_total, self.party)
		for row in self.items:
			posting.on_item_side(row.get(self.item_account_field), gross_amount(self, row))
		for tax in self.taxes:
			posting.on_item_side(tax.account_head, tax.tax_amount)
		discount = item_discount(self)
		if discount:
			posting.on_party_side(_discount_account(), discount)
		return posting

	def before_submit(self):
		invoice_transfer.validate_invoice(self)
		settlement.open_balance(self)

	def on_submit(self):
		self.get_ledger_posting().post()
		settlement.refresh_party(self.party_type, self.party)
		invoice_transfer.on_invoice_submit(self)
		if self.return_against:
			returns.update_return_status(self, include_current=True)
		# POS invoices are paid at the counter with the tendered payment method.
		if self.make_auto_payment and self.outstanding_amount and not self.get("is_pos"):
			self.pay_outstanding_amount()

	def pay_outstanding_amount(self):
		payment = map_invoice_payment(self.doctype, self.name)
		# No one enters a bank reference for an automatic payment, so it refers to the invoice.
		payment.reference_no = self.name
		payment.insert()
		payment.submit()
		settlement.reload_balance(self)

	@frappe.whitelist()
	def cancel_with_linked_docs(self, linked_docs: list[dict]):
		"""Cancel `linked_docs`, the payments `get_payments_to_cancel` listed, and then the invoice.

		Frappe's Cancel All does it in one transaction, on a fresh copy of the invoice.
		"""
		linked_with.cancel_all_linked_docs(linked_docs, root_doctype=self.doctype, root_name=self.name)
		self.reload()

	def before_cancel(self):
		invoice_transfer.before_invoice_cancel(self)
		settlement.clear_balance(self)

	def on_cancel(self):
		reverse_entries(self)
		settlement.refresh_party(self.party_type, self.party)
		invoice_transfer.on_invoice_cancel(self)
		if self.return_against:
			returns.update_return_status(self, include_current=False)

	def on_trash(self):
		delete_entries(self)
		self.delete_cancelled_follow_ups()

	def delete_cancelled_follow_ups(self):
		"""Delete the cancelled stock transfers and payments made for this invoice, with the user's rights."""
		invoice_transfer.delete_cancelled_transfers(self)
		payments = frappe.get_all(
			"Books Payment Entry Reference",
			filters={"reference_doctype": self.doctype, "reference_name": self.name, "docstatus": 2},
			pluck="parent",
		)
		for name in set(payments):
			frappe.delete_doc("Books Payment Entry", name)


@frappe.whitelist()
def get_payments_to_cancel(doctype: str, name: str) -> list[dict]:
	"""Return the submitted payments that cancelling an invoice also cancels.

	Other submitted documents that link to the invoice, like returns, still block its cancellation.
	"""
	linked = linked_with.get_submitted_linked_docs(doctype, name)
	return [doc for doc in linked["docs"] if doc["doctype"] == "Books Payment Entry"]


def calculate_invoice(invoice):
	"""Price each row, then set the taxes and the totals."""
	for row in invoice.items:
		_calculate_row(invoice, row)
	invoice.net_total = sum_decimal(row.amount for row in invoice.items)
	calculation = calculate_taxes(invoice)
	discount = _after_tax_discount(invoice, calculation) if invoice.discount_after_tax else 0
	_calculate_totals(invoice, discount)


def _calculate_row(invoice, row):
	"""ERPNext's row: the rate is the price list rate less the discount per unit, and the amount is
	the rate times the quantity. Discounts after tax leave the rate at the price list rate."""
	currency = invoice.get("currency")
	price = as_decimal(row.price_list_rate)
	percentage = as_decimal(row.discount_percentage)
	if percentage and not invoice.discount_after_tax:
		row.discount_amount = rounded(price * percentage / 100, currency)
	discount = 0 if invoice.discount_after_tax else _unit_discount(row, price)
	rate = price - discount
	row.rate = row.net_rate = rounded(rate, currency)
	row.amount = row.net_amount = rounded(rate * as_decimal(row.qty), currency)
	row.stock_uom_rate = rounded(rate / as_decimal(row.conversion_factor or 1), currency)


def _unit_discount(row, price):
	"""A percentage discounts the price list rate; without one, the discount amount is per unit."""
	percentage = as_decimal(row.discount_percentage)
	return price * percentage / 100 if percentage else as_decimal(row.discount_amount)


def _after_tax_discount(invoice, calculation):
	"""Discounts after tax come off each row's taxed total; a percentage one is stored per unit too."""
	return sum_decimal(_after_tax_row_discount(invoice, row, calculation) for row in invoice.items)


def _after_tax_row_discount(invoice, row, calculation):
	currency = invoice.get("currency")
	taxed = calculation.taxed_total(row)
	quantity = abs(as_decimal(row.qty))
	percentage = as_decimal(row.discount_percentage)
	if percentage:
		discount = abs(taxed) * percentage / 100
		row.discount_amount = rounded(discount / quantity, currency) if quantity else 0
	else:
		discount = as_decimal(row.discount_amount) * quantity
	return rounded(-discount if taxed < 0 else discount, currency)


def _calculate_totals(invoice, discount):
	currency = invoice.get("currency")
	grand_total = invoice.net_total + as_decimal(invoice.total_taxes_and_charges) - discount
	invoice.grand_total = rounded(grand_total, currency)
	invoice.base_grand_total = rounded(invoice.grand_total * as_decimal(invoice.conversion_rate or 1))
	invoice.set_loyalty_amount()
	if invoice.party_account_type and invoice.docstatus == 0:
		settlement.open_balance(invoice)


def gross_amount(invoice, row):
	"""The row's amount before its discount: its income or expense, as the discount posts on its own."""
	if invoice.discount_after_tax:
		return as_decimal(row.amount)
	return rounded(as_decimal(row.price_list_rate) * as_decimal(row.qty), invoice.get("currency"))


def item_discount(invoice):
	"""The invoice's item discounts, before or after tax, signed like its total."""
	gross = sum_decimal(gross_amount(invoice, row) for row in invoice.items)
	return gross + as_decimal(invoice.total_taxes_and_charges) - as_decimal(invoice.grand_total)


def validate_invoice(invoice):
	if not invoice.items:
		frappe.throw(_("At least one invoice item is required."))
	_validate_features(invoice)
	if invoice.party_account_type:
		validate_account(invoice, invoice.party_account_field, (invoice.party_account_type,))
	pricing.validate_price_list(invoice)
	if as_decimal(invoice.conversion_rate) <= 0:
		frappe.throw(
			_("Set an exchange rate from {0} to {1} above zero.").format(invoice.currency, company_currency())
		)
	for row in invoice.items:
		_validate_row(invoice, row)
	validate_hsn_codes(invoice.items, "gst_hsn_code")
	if invoice.get("return_against"):
		returns.validate_return(invoice)


def _validate_features(invoice):
	"""Reject what the Books app offers only while its feature is on."""
	require_features(invoice, INVOICE_FEATURES)
	if invoice.party_type == "Books Lead":
		require_feature("enable_lead")
	if _has_manual_discount(invoice):
		require_feature("enable_discounts_and_margin")


def _has_manual_discount(invoice):
	"""Pricing rules discount rows under their own switch; other row discounts need discounting."""
	return any(
		as_decimal(row.discount_percentage) or as_decimal(row.discount_amount)
		for row in invoice.items
		if not row.get("pricing_rules")
	)


def _validate_row(invoice, row):
	if not row.item_code:
		frappe.throw(_("Every invoice row requires an item."))
	if as_decimal(row.qty) == 0:
		frappe.throw(_("Item quantity cannot be zero."))
	if as_decimal(row.price_list_rate) < 0:
		frappe.throw(_("Item rate cannot be negative."))
	_validate_row_discount(invoice, row)


def _validate_row_discount(invoice, row):
	if not 0 <= as_decimal(row.discount_percentage) <= 100:
		frappe.throw(_("Item discount percent must be between 0 and 100."))
	discount = as_decimal(row.discount_amount)
	# A discount after tax is a share of the taxed amount, which can be more than the rate.
	limit = None if invoice.discount_after_tax else as_decimal(row.price_list_rate)
	if discount < 0 or (limit is not None and discount > limit):
		frappe.throw(_("Item discount amount cannot exceed the row rate."))


class InvoicePosting(LedgerPosting):
	"""An invoice's ledger entries, in base currency, on the party's side or the items' side.

	Sales debit the party and purchases credit it; a return reverses its invoice.
	"""

	def __init__(self, invoice):
		super().__init__(invoice)
		self.exchange_rate = as_decimal(invoice.conversion_rate or 1)
		self.is_party_credited = invoice.is_purchase != bool(invoice.get("return_against"))

	def on_party_side(self, account, amount, party=None):
		"""Post an invoice-currency amount on the party's side, as the discount is."""
		self.add_entry(account, amount, party, credit=self.is_party_credited)

	def on_item_side(self, account, amount, party=None):
		"""Post an invoice-currency amount on the side of the items and taxes."""
		self.add_entry(account, amount, party, credit=not self.is_party_credited)

	def add_entry(self, account, amount, party, credit):
		base_amount = abs(as_decimal(amount)) * self.exchange_rate
		(self.credit if credit else self.debit)(account, base_amount, party)


def _discount_account():
	account = company_value("default_discount_account")
	if not account:
		frappe.throw(_("Set a discount account in Books Company."))
	return account


def _populate_pos_defaults(invoice):
	"""A POS sale bills the POS customer to the POS Settings account, unless told otherwise."""
	if not invoice.get("is_pos"):
		return
	invoice.set(invoice.party_field, invoice.party or pos_customer())
	invoice.debit_to = invoice.get("debit_to") or frappe.db.get_single_value(
		"Books POS Settings", "default_account"
	)


def _party_account(invoice, account):
	"""The party's ledger if it suits the invoice, else the newest that does."""
	account_type = invoice.party_account_type
	if account and frappe.db.get_value("Books Account", account, "account_type") == account_type:
		return account
	return latest_ledger_account(account_type)


def _party_defaults(invoice):
	"""Return the party's invoice defaults; a quote to a lead has none."""
	if not invoice.party or invoice.party_type == "Books Lead":
		return frappe._dict()
	fields = list(invoice.party_default_fields)
	return frappe.db.get_value(invoice.party_type, invoice.party, fields, as_dict=True) or frappe._dict()


def _populate_currency(invoice, party_currency):
	"""Bill in the party's currency; the company currency needs no exchange rate."""
	company = company_currency()
	invoice.currency = party_currency or company
	if invoice.currency == company:
		invoice.conversion_rate = 1
	elif not invoice.get("conversion_rate"):
		invoice.conversion_rate = get_exchange_rate(invoice.currency, company, invoice.document_date)


def _populate_row(invoice, row, item, rates):
	row.item_name = item.item_name
	for fieldname in ("description", "gst_hsn_code"):
		if not row.get(fieldname):
			row.set(fieldname, item.get(fieldname))
	# A template left out follows the item; an empty one sent, as a cleared one, stays empty.
	if row.get("item_tax_template") is None:
		row.item_tax_template = item.item_tax_template
	if not row.price_list_rate and not (row.is_manual_rate or row.get("is_free_item")):
		row.price_list_rate = pricing.standard_rate(invoice, row, rates)
	account_field = invoice.item_account_field
	if account_field and not row.get(account_field):
		row.set(account_field, item.get(account_field))


def _item_details(names, date):
	"""The row values each item gives, under the row's fieldnames, for an invoice dated `date`."""
	if not names:
		return {}
	rows = frappe.get_all(
		"Books Item",
		filters={"name": ["in", sorted(names)]},
		fields=["name", "item_name", "description", "item_group", "gst_hsn_code"],
	)
	defaults = company_item_defaults(names)
	templates = item_tax_templates(rows, date)
	for row in rows:
		row.item_tax_template = templates[row.name]
		row.update(defaults.get(row.name, {}))
	return {row.name: row for row in rows}
