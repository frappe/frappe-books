"""Payment entry validation, posting, and allocation behavior."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.base_document import get_controller
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc

from frappe_books.accounting import settlement
from frappe_books.accounting.accounts import (
	PARTY_ACCOUNT_TYPES,
	PAYMENT_ACCOUNT_TYPES,
	latest_ledger_account,
	mode_of_payment_account,
	validate_account,
	validate_party_account,
	validate_payment_account,
)
from frappe_books.accounting.ledger import LedgerPosting, delete_entries, reverse_entries
from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.accounting.party import party_account
from frappe_books.commerce.pos import counter_cash_account, is_cash_method
from frappe_books.company import company_value
from frappe_books.permissions import check_preview_permission
from frappe_books.series import SeriesNamingMixin
from frappe_books.status import StatusMixin

INTERNAL_TRANSFER = "Internal Transfer"
# Money comes in from customers and goes out to suppliers.
PAYMENT_PARTY_TYPES = {"Receive": "Books Customer", "Pay": "Books Supplier"}
REFERENCE_DOCTYPES = ("Books Sales Invoice", "Books Purchase Invoice")
# Deductions are debited, so they add to what a receipt settles and take from what a payment does, as in ERPNext.
DEDUCTION_SIGNS = {"Receive": 1, "Pay": -1}


def party_account_field(payment_type) -> str | None:
	"""The field of the party's ledger: money comes from a customer's and goes to a supplier's."""
	return {"Receive": "paid_from", "Pay": "paid_to"}.get(payment_type)


def payment_account_field(payment_type) -> str:
	"""The field of the cash or bank account that the mode of payment fills, as ERPNext's form does."""
	return "paid_to" if payment_type == "Receive" else "paid_from"


class PaymentController(StatusMixin, SeriesNamingMixin, Document):
	def before_validate(self):
		self.set_missing_values()

	@frappe.whitelist()
	def preview(self):
		"""Fill the values a save would fill, without saving, for the form to show them."""
		check_preview_permission(self)
		self.set_number_series()
		if self.payment_type == INTERNAL_TRANSFER:
			# The form hides what a transfer cannot have, so it goes.
			self.set("references", [])
			self.set("deductions", [])
		self.set_missing_values()
		# The fills show what the invoices hold, which only their readers may see.
		for row in self.references:
			if row.reference_name:
				frappe.has_permission(row.reference_doctype, "read", doc=row.reference_name, throw=True)
		self.settle_only_reference()
		self.set_totals()
		validate_reference_allocations(self)

	@property
	def party_amount(self):
		"""What the party is settled by: the paid amount and the deductions."""
		deducted = sum_decimal(row.amount for row in self.deductions)
		return as_decimal(self.paid_amount) + DEDUCTION_SIGNS.get(self.payment_type, 0) * deducted

	def settle_only_reference(self):
		"""In the form, a payment's only reference takes all it settles, as the Books app kept them equal."""
		if len(self.references) == 1 and self.paid_amount:
			self.references[0].allocated_amount = rounded(self.party_amount)

	def set_missing_values(self):
		"""Fill the party, payment type, accounts and amounts the way the Books app does while editing."""
		if self.payment_type == INTERNAL_TRANSFER:
			self.party_type = self.party = None
		self.party_type = self.party_type or PAYMENT_PARTY_TYPES.get(self.payment_type)
		self.set_reference_doctypes()
		invoice = self.get_first_invoice()
		if invoice and self.payment_type != INTERNAL_TRANSFER:
			self.party_type = self.party_type or invoice.party_type
			self.party = self.party or invoice.party
		self.payment_type = self.payment_type or _default_payment_type(self.party_type, invoice)
		self.set_accounts(invoice)
		self.set_reference_details()
		self.set_deduction_accounts()
		self.set_amounts()

	def set_accounts(self, invoice):
		"""Fill the accounts the payment type points to; without a type, neither is known."""
		if not self.payment_type:
			return
		if fieldname := party_account_field(self.payment_type):
			account = _default_party_account(self.get_party_account(), invoice, self.payment_type)
			self.set(fieldname, self.get(fieldname) or account)
		fieldname = payment_account_field(self.payment_type)
		self.set(fieldname, self.get(fieldname) or _default_payment_account(self.mode_of_payment, invoice))

	def get_party_account(self):
		if self.party_type in PARTY_ACCOUNT_TYPES and self.party:
			return party_account(self.party_type, self.party)

	def set_reference_doctypes(self):
		"""A reference without a type is a supplier's purchase invoice, else a sales invoice."""
		is_supplier = self.party_type == "Books Supplier"
		doctype = "Books Purchase Invoice" if is_supplier else "Books Sales Invoice"
		for row in self.references:
			row.reference_doctype = row.reference_doctype or doctype

	def set_reference_details(self):
		"""Show each invoice's total and what it owes, and allocate it that unless an amount is set."""
		invoices = _reference_invoices(self.references)
		for row in self.references:
			invoice = invoices.get((row.reference_doctype, row.reference_name))
			if invoice:
				row.total_amount = abs(as_decimal(invoice.base_grand_total))
				row.outstanding_amount = settlement.due(invoice)
				row.allocated_amount = row.allocated_amount or row.outstanding_amount

	def set_deduction_accounts(self):
		"""A write-off without an account goes to the company's write-off account."""
		if all(row.account for row in self.deductions):
			return
		account = company_value("write_off_account")
		if not account:
			frappe.throw(_("Set a write-off account in Books Company."))
		for row in self.deductions:
			row.account = row.account or account

	def set_amounts(self):
		"""Pay what is allocated unless an amount is set; Books has one currency, so it is also received."""
		if not self.paid_amount:
			allocated = sum_decimal(row.allocated_amount for row in self.references)
			self.paid_amount = rounded(allocated - (self.party_amount - as_decimal(self.paid_amount)))
		self.set_totals()

	def set_totals(self):
		self.received_amount = self.paid_amount
		self.total_allocated_amount = sum_decimal(row.allocated_amount for row in self.references)
		self.unallocated_amount = rounded(self.party_amount - as_decimal(self.total_allocated_amount))

	def get_first_invoice(self):
		"""Return the doctype, party, return link, account and POS flag of the first referenced invoice."""
		row = self.references[0] if self.references else None
		if not row or row.reference_doctype not in REFERENCE_DOCTYPES:
			return None
		controller = get_controller(row.reference_doctype)
		fields = [controller.party_field, "return_against", f"{controller.party_account_field} as account"]
		if row.reference_doctype == "Books Sales Invoice":
			fields.append("is_pos")
		invoice = frappe.db.get_value(row.reference_doctype, row.reference_name, fields, as_dict=True)
		return invoice and frappe._dict(
			invoice,
			doctype=row.reference_doctype,
			party_type=controller.party_type,
			party=invoice[controller.party_field],
		)

	def validate(self):
		if as_decimal(self.paid_amount) <= 0:
			frappe.throw(_("Payment amount must be greater than zero."))
		if self.party_amount <= 0:
			frappe.throw(_("The amount settled, after the write-off, must be greater than zero."))
		if self.paid_from == self.paid_to:
			frappe.throw(_("The From and To accounts cannot be the same."))
		self.validate_accounts()
		validate_reference_allocations(self)
		validate_payment_details(self.mode_of_payment, self.reference_no, self.clearance_date)
		allocations = _validate_allocations(self)
		self.validate_counter_account([invoice for invoice, _amount in allocations])
		self.set("realised_taxes", _realised_taxes(allocations))

	def validate_accounts(self):
		"""The party's ledger is its receivable or payable; the cash or bank suits the mode of payment."""
		method_type = self.mode_of_payment and frappe.get_cached_value(
			"Books Mode of Payment", self.mode_of_payment, "type"
		)
		validate_payment_account(self, payment_account_field(self.payment_type), method_type)
		if self.payment_type == INTERNAL_TRANSFER:
			self.validate_transfer()
			return
		if self.party_type not in PARTY_ACCOUNT_TYPES:
			frappe.throw(_("Party Type must be Customer or Supplier."))
		if not self.party:
			frappe.throw(_("Party is mandatory."))
		validate_party_account(self, party_account_field(self.payment_type), self.party_type)

	def validate_transfer(self):
		"""A transfer moves money between the company's own cash and bank accounts."""
		if self.references or self.deductions:
			frappe.throw(_("An internal transfer cannot settle invoices or write off amounts."))
		validate_account(self, "paid_to", PAYMENT_ACCOUNT_TYPES)

	def validate_counter_account(self, invoices):
		"""Cash for POS sales goes through the counter, which closing the POS shift reconciles."""
		if not any(invoice.get("is_pos") for invoice in invoices):
			return
		if not is_cash_method(self.mode_of_payment):
			return
		counter = counter_cash_account()
		if self.get(payment_account_field(self.payment_type)) != counter:
			frappe.throw(
				_("Cash payments for POS invoices must use the counter cash account {0}.").format(counter)
			)

	def on_submit(self):
		# The party's account moves by what settles it, the cash or bank by what is paid.
		paid, settled = self.paid_amount, self.party_amount
		debit, credit = (paid, settled) if self.payment_type == "Receive" else (settled, paid)
		posting = LedgerPosting(self)
		posting.debit(self.paid_to, debit, self._party_on("paid_to"))
		posting.credit(self.paid_from, credit, self._party_on("paid_from"))
		_post_deductions(self, posting)
		_post_taxes(self, posting)
		posting.post()
		self.settle_references(reverse=False)

	def _party_on(self, fieldname):
		"""The party, on its own ledger's entry only, as ERPNext posts it; the cash or bank entry has none."""
		return self.party if fieldname == party_account_field(self.payment_type) else None

	def on_cancel(self):
		reverse_entries(self)
		self.settle_references(reverse=True)

	def settle_references(self, reverse):
		"""Settle each referenced invoice by its allocation, or take it back, and show what it owes now."""
		for row in self.references:
			invoice = frappe.get_doc(row.reference_doctype, row.reference_name, for_update=True)
			settlement.settle(invoice, row.allocated_amount, reverse)
			row.db_set("outstanding_amount", settlement.due(invoice), update_modified=False)
		settlement.refresh_party(self.party_type, self.party)

	def on_trash(self):
		delete_entries(self)


def validate_reference_allocations(payment):
	"""No reference may take more than its invoice owes, as ERPNext checks each row."""
	for row in payment.references:
		if row.reference_name and as_decimal(row.allocated_amount) > as_decimal(row.outstanding_amount):
			frappe.throw(
				_("Row #{0}: Allocated Amount cannot be greater than outstanding amount.").format(row.idx)
			)


def _reference_invoices(rows):
	"""The total and outstanding amount of each referenced invoice, by (doctype, name), a query per doctype."""
	names = defaultdict(set)
	for row in rows:
		if row.reference_doctype in REFERENCE_DOCTYPES and row.reference_name:
			names[row.reference_doctype].add(row.reference_name)
	invoices = {}
	for doctype, doctype_names in names.items():
		for invoice in frappe.get_all(
			doctype,
			filters={"name": ["in", list(doctype_names)]},
			fields=["name", "base_grand_total", "outstanding_amount"],
		):
			invoices[doctype, invoice.name] = invoice
	return invoices


def _default_payment_type(party_type, invoice):
	if invoice:
		return payment_type_for(invoice.doctype, bool(invoice.return_against))
	if party_type:
		return "Pay" if party_type == "Books Supplier" else "Receive"
	return None


def _default_party_account(party_account, invoice, payment_type):
	"""The party's ledger, else the invoice's, else the newest payable or receivable ledger."""
	if party_account:
		return party_account
	if invoice:
		return invoice.account
	return latest_ledger_account("Payable" if payment_type == "Pay" else "Receivable")


def _default_payment_account(mode_of_payment, invoice):
	"""POS cash goes to the counter, other payments to the mode's account, else the newest ledger
	of the mode's kind."""
	method_type = mode_of_payment and frappe.db.get_value("Books Mode of Payment", mode_of_payment, "type")
	if not method_type:
		return None
	if method_type == "Cash" and invoice and invoice.get("is_pos"):
		return counter_cash_account()
	return mode_of_payment_account(mode_of_payment) or latest_ledger_account(
		"Cash" if method_type == "Cash" else "Bank"
	)


def _validate_allocations(payment):
	allocated = defaultdict(as_decimal)
	for row in payment.references:
		if as_decimal(row.allocated_amount) <= 0:
			frappe.throw(_("Allocated amounts must be greater than zero."))
		allocated[row.reference_doctype, row.reference_name] += as_decimal(row.allocated_amount)
	allocations = [(_referenced_invoice(payment, *key), amount) for key, amount in allocated.items()]
	for invoice, amount in allocations:
		_validate_allocation(payment, invoice, amount)
	if sum_decimal(allocated.values()) > payment.party_amount:
		frappe.throw(_("Payment allocations cannot exceed the settled amount, including the write-off."))
	return allocations


def _validate_allocation(payment, invoice, amount):
	outstanding = settlement.due(invoice)
	if amount > outstanding:
		frappe.throw(_("Allocated amount exceeds the invoice outstanding amount."))
	payment_type = payment_type_for(invoice.doctype, bool(invoice.return_against))
	if payment.payment_type != payment_type:
		frappe.throw(_("A payment for {0} must be a {1} payment.").format(invoice.name, payment_type))


def _referenced_invoice(payment, doctype, name):
	if doctype not in REFERENCE_DOCTYPES:
		frappe.throw(_("Select a sales or purchase invoice reference."))
	invoice = frappe.get_doc(doctype, name, for_update=True, check_permission="read")
	if invoice.docstatus != 1:
		frappe.throw(_("Submit invoice {0} before allocating a payment to it.").format(name))
	if (invoice.party_type, invoice.party) != (payment.party_type, payment.party):
		frappe.throw(_("Invoice {0} does not belong to party {1}.").format(name, payment.party))
	return invoice


def _realised_taxes(allocations):
	"""Move invoice taxes that have a payment account to it, in proportion to what is paid."""
	taxes = {}
	for invoice, amount in allocations:
		for tax in _invoice_realised_taxes(invoice, amount):
			key = (tax["account"], tax["from_account"])
			taxes.setdefault(key, {**tax, "amount": as_decimal(0)})["amount"] += tax["amount"]
	return [tax for tax in taxes.values() if tax["amount"]]


def _invoice_realised_taxes(invoice, amount):
	payment_accounts = _tax_payment_accounts(invoice)
	total = abs(as_decimal(invoice.base_grand_total))
	if not payment_accounts or not total:
		return
	paid = total - settlement.due(invoice)
	for tax in invoice.taxes:
		if tax.account_head not in payment_accounts:
			continue
		yield {
			"account": payment_accounts[tax.account_head],
			"from_account": tax.account_head,
			"rate": tax.rate,
			"amount": tax_share(invoice, tax, amount, paid),
		}


def tax_share(invoice, tax, amount, paid=0):
	"""Return the base-currency part of an invoice tax that `amount` settles after `paid`."""
	total = abs(as_decimal(invoice.base_grand_total))
	base_tax = abs(as_decimal(tax.tax_amount)) * as_decimal(invoice.conversion_rate or 1)
	# Share what is paid so far, so partial payments add up to the full tax.
	return rounded(base_tax * (paid + amount) / total) - rounded(base_tax * paid / total)


def _tax_payment_accounts(invoice):
	"""Map each invoice tax account to the account its tax moves to on payment."""
	accounts = {}
	for tax_name in {row.item_tax_template for row in invoice.items if row.item_tax_template}:
		for detail in frappe.get_cached_doc("Books Item Tax Template", tax_name).taxes:
			if not detail.payment_account:
				continue
			if accounts.setdefault(detail.tax_type, detail.payment_account) != detail.payment_account:
				frappe.throw(
					_("Tax account {0} moves to more than one payment account.").format(detail.tax_type)
				)
	return accounts


def _post_taxes(payment, posting):
	for tax in payment.realised_taxes:
		if payment.payment_type == "Receive":
			posting.debit(tax.from_account, tax.amount)
			posting.credit(tax.account, tax.amount)
		else:
			posting.credit(tax.from_account, tax.amount)
			posting.debit(tax.account, tax.amount)


def _post_deductions(payment, posting):
	"""Deductions are debited, and a negative one credited, as ERPNext posts them."""
	for row in payment.deductions:
		amount = as_decimal(row.amount)
		(posting.debit if amount > 0 else posting.credit)(row.account, abs(amount))


def payment_type_for(invoice_doctype, is_return):
	"""Money comes in for sales and for purchase returns, and goes out otherwise."""
	return "Receive" if (invoice_doctype == "Books Sales Invoice") != is_return else "Pay"


def map_invoice_payment(invoice_doctype, invoice_name):
	"""Return an unsaved payment that settles the invoice's outstanding amount."""
	return get_mapped_doc(
		invoice_doctype,
		invoice_name,
		{
			invoice_doctype: {
				"doctype": "Books Payment Entry",
				"validation": {"docstatus": ["=", 1]},
				# A payment is dated when it is made.
				"field_no_map": ["posting_date", "naming_series"],
			},
		},
		postprocess=_settle_invoice,
	)


def _settle_invoice(invoice, payment):
	outstanding = settlement.due(invoice)
	if not outstanding:
		frappe.throw(_("Invoice {0} has no outstanding amount.").format(invoice.name))
	account = _settling_account(invoice)
	payment_type = payment_type_for(invoice.doctype, bool(invoice.return_against))
	payment.update(
		{
			"payment_type": payment_type,
			"party_type": invoice.party_type,
			"party": invoice.party,
			"mode_of_payment": _settling_method(account),
			payment_account_field(payment_type): account,
			"paid_amount": outstanding,
		}
	)
	payment.append(
		"references",
		{
			"reference_doctype": invoice.doctype,
			"reference_name": invoice.name,
			"allocated_amount": outstanding,
		},
	)


def validate_payment_details(mode_of_payment, reference_no, clearance_date):
	"""A non-cash payment needs a reference number, and its mode may need a clearance date."""
	method = frappe.db.get_value(
		"Books Mode of Payment", mode_of_payment, ["type", "requires_clearance_date"], as_dict=True
	)
	if not method:
		return
	if method.type != "Cash" and not reference_no:
		frappe.throw(_("Please enter a reference number."))
	if method.requires_clearance_date and not clearance_date:
		frappe.throw(_("Please select a clearance date."))


def default_payment_account(invoice_doctype) -> str | None:
	"""Return the Books Defaults account that pays invoices of the doctype."""
	fieldname = (
		"purchase_payment_account" if invoice_doctype == "Books Purchase Invoice" else "sales_payment_account"
	)
	return frappe.db.get_single_value("Books Defaults", fieldname)


def _settling_account(invoice):
	if invoice.get("is_pos"):
		return counter_cash_account()
	account = default_payment_account(invoice.doctype) or mode_of_payment_account("Cash")
	if not account:
		frappe.throw(_("Set a default payment account in Books Defaults."))
	return account


def _settling_method(account):
	"""Return the oldest mode of payment of the account's type: Cash for cash, Bank for bank."""
	account_type = frappe.db.get_value("Books Account", account, "account_type")
	method = frappe.db.get_value(
		"Books Mode of Payment", {"type": account_type}, "name", order_by="creation asc"
	)
	if not method:
		frappe.throw(_("Add a {0} payment method to pay from {1}.").format(_(account_type), account))
	return method
