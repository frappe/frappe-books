"""Invoice taxes and charges, as ERPNext calculates them for the charge types Books offers.

A document's `taxes` rows come from its Taxes and Charges Template or the user, then one row per
account of its items' Item Tax Templates. An item's template rate for an account overrides the
row's rate for that item.
"""

from collections import defaultdict

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint

from frappe_books.accounting.ledger import validate_leaf_accounts
from frappe_books.accounting.money import as_decimal, rounded, sum_decimal

CHARGE_TYPES = ("On Net Total", "Actual", "On Previous Row Amount", "On Previous Row Total")
PREVIOUS_ROW_TYPES = ("On Previous Row Amount", "On Previous Row Total")
# The fields a template row gives an invoice row.
TEMPLATE_ROW_FIELDS = (
	"charge_type",
	"row_id",
	"account_head",
	"description",
	"rate",
	"tax_amount",
	"category",
	"add_deduct_tax",
)


def set_taxes(invoice):
	"""Fill the template's rows, add the items' template rows, and check every row."""
	if not invoice.get("return_against"):
		_apply_template(invoice)
	_set_item_template_rows(invoice, item_tax_rates(invoice.items))
	validate_tax_rows(invoice, invoice.taxes)


def calculate_taxes(invoice):
	"""Set each tax row's amount and running total, and the item-wise details, from the rows' amounts."""
	# The item-wise details name their rows, which may have been added since Frappe named the others.
	invoice.set_name_in_children()
	calculation = TaxCalculation(invoice)
	for tax, amount, total in calculation.rows():
		tax.tax_amount, tax.total = amount, total
	invoice.set("item_wise_tax_details", calculation.item_wise_details())
	invoice.total_taxes_and_charges = sum_decimal(tax.tax_amount for tax in invoice.taxes)
	return calculation


def validate_tax_rows(doc, rows):
	"""Allow the charge types Books calculates, and point a previous-row charge at an earlier row.

	An empty Reference Row # takes the row before.
	"""
	label = _(doc.meta.get_label("taxes"))
	for idx, tax in enumerate(rows, 1):
		tax.idx = idx
		_validate_tax_row(tax, label)


def default_template(doctype):
	"""The enabled template marked Default for the doctype's taxes."""
	template_doctype = frappe.get_meta(doctype).get_field("taxes_and_charges").options
	return frappe.db.get_value(template_doctype, {"is_default": 1, "disabled": 0}, "name")


def item_tax_rates(rows):
	"""Map each item row, by itself, to its Item Tax Template's rate per account."""
	return {id(row): _template_rates(row.get("item_tax_template")) for row in rows}


class TaxesTemplateController(Document):
	"""A Sales or Purchase Taxes and Charges Template: the rows a document's taxes start from."""

	def validate(self):
		validate_tax_rows(self, self.taxes)
		# Documents post to these accounts.
		validate_leaf_accounts({row.account_head for row in self.taxes})

	def on_update(self):
		"""One template of each kind is the default, as in ERPNext."""
		if self.is_default:
			frappe.db.set_value(self.doctype, {"name": ["!=", self.name], "is_default": 1}, "is_default", 0)


class TaxCalculation:
	"""The tax of each item row under each tax row, unrounded, as ERPNext works it out."""

	def __init__(self, invoice):
		self.invoice = invoice
		self.currency = invoice.get("currency")
		self.sign = -1 if invoice.get("return_against") else 1
		self.items = list(invoice.items)
		self.rates = item_tax_rates(self.items)
		self.net_total = sum_decimal(row.net_amount for row in self.items)
		# Per tax row: the item rows' tax, taxable base and running total, by row.
		self.amounts, self.bases, self.totals = [], [], []
		for tax in invoice.taxes:
			self._add_tax(tax)

	def rows(self):
		"""Yield each tax row with its rounded amount and running total."""
		total = rounded(self.net_total, self.currency)
		for tax, amounts in zip(self.invoice.taxes, self.amounts, strict=True):
			amount = self._actual(tax) if tax.charge_type == "Actual" else sum_decimal(amounts.values())
			amount = rounded(amount, self.currency)
			total += amount
			yield tax, amount, total

	def taxed_total(self, row):
		"""The row's amount with its taxes, unrounded."""
		return as_decimal(row.net_amount) + sum_decimal(amounts[id(row)] for amounts in self.amounts)

	def item_wise_details(self):
		"""Each item row's tax under each tax row, in the company currency, as ERPNext stores it."""
		rate = as_decimal(self.invoice.get("conversion_rate") or 1)
		details = []
		for tax, amounts, bases in zip(self.invoice.taxes, self.amounts, self.bases, strict=True):
			for row in self.items:
				amount = amounts[id(row)]
				if not amount:
					continue
				details.append(
					{
						"item_row": row.name,
						"tax_row": tax.name,
						"rate": 0 if tax.charge_type == "Actual" else self._rate(tax, row),
						"amount": rounded(amount * rate),
						"taxable_amount": rounded(bases[id(row)] * rate),
					}
				)
		return details

	def _add_tax(self, tax):
		amounts, bases, totals = {}, {}, {}
		for row in self.items:
			base = self._base(tax, row)
			bases[id(row)] = base
			amounts[id(row)] = self._item_amount(tax, row, base)
			previous = self.totals[-1][id(row)] if self.totals else as_decimal(row.net_amount)
			totals[id(row)] = previous + amounts[id(row)]
		self.amounts.append(amounts)
		self.bases.append(bases)
		self.totals.append(totals)

	def _base(self, tax, row):
		"""What the row's tax under `tax` is a share or a rate of."""
		if tax.charge_type == "On Previous Row Amount":
			return self.amounts[cint(tax.row_id) - 1][id(row)]
		if tax.charge_type == "On Previous Row Total":
			return self.totals[cint(tax.row_id) - 1][id(row)]
		return as_decimal(row.net_amount)

	def _item_amount(self, tax, row, base):
		if tax.charge_type == "Actual":
			# ERPNext shares an actual charge out by the rows' net amounts.
			return self._actual(tax) * base / self.net_total if self.net_total else as_decimal(0)
		return base * self._rate(tax, row) / 100

	def _rate(self, tax, row):
		"""The item's template rate for the account, else the row's; a row the items' templates
		added taxes only the items whose template has its account."""
		default = 0 if tax.get("set_by_item_tax_template") else as_decimal(tax.rate)
		return as_decimal(self.rates[id(row)].get(tax.account_head, default))

	def _actual(self, tax):
		"""An actual charge, signed like the document: a return gives it back."""
		return self.sign * abs(as_decimal(tax.tax_amount))


def _apply_template(invoice):
	"""Start a new document with the default template, and take a template's rows when it changes
	or the rows it gave are gone."""
	if invoice.get("taxes_and_charges") is None and invoice.is_new():
		invoice.taxes_and_charges = default_template(invoice.doctype)
	template = invoice.get("taxes_and_charges")
	if not template:
		return
	own_rows = [tax for tax in invoice.taxes if not tax.get("set_by_item_tax_template")]
	if own_rows and not _is_template_changed(invoice):
		return
	invoice.set("taxes", _template_rows(invoice, template))


def _is_template_changed(invoice):
	if invoice.is_new():
		return False
	return (
		frappe.db.get_value(invoice.doctype, invoice.name, "taxes_and_charges") != invoice.taxes_and_charges
	)


def _template_rows(invoice, template):
	template_doctype = invoice.meta.get_field("taxes_and_charges").options
	rows = frappe.get_cached_doc(template_doctype, template).taxes
	return [{field: row.get(field) for field in TEMPLATE_ROW_FIELDS if row.get(field)} for row in rows]


def _set_item_template_rows(invoice, rates):
	"""Keep the template's and the user's rows, then add a row for each other account the items'
	templates tax; its rate is theirs when they all agree, else 0."""
	own_rows = [tax for tax in invoice.taxes if not tax.get("set_by_item_tax_template")]
	added = {tax.account_head: tax for tax in invoice.taxes if tax.get("set_by_item_tax_template")}
	accounts = {tax.account_head for tax in own_rows}
	account_rates = defaultdict(set)
	for row_rates in rates.values():
		for account, rate in row_rates.items():
			account_rates[account].add(rate)
	rows = list(own_rows)
	for account, values in account_rates.items():
		if account in accounts:
			continue
		row = added.get(account) or frappe._dict(
			charge_type="On Net Total", account_head=account, set_by_item_tax_template=1
		)
		row.rate = values.pop() if len(values) == 1 else 0
		rows.append(row)
	invoice.set("taxes", rows)


def _template_rates(template):
	if not template:
		return {}
	rows = frappe.get_cached_doc("Books Item Tax Template", template).taxes
	return {row.tax_type: as_decimal(row.tax_rate) for row in rows}


def _validate_tax_row(tax, label):
	if tax.meta.has_field("category"):
		# Purchase rows Books adds take ERPNext's defaults, which Books keeps.
		tax.category, tax.add_deduct_tax = tax.category or "Total", tax.add_deduct_tax or "Add"
	if tax.charge_type not in CHARGE_TYPES:
		frappe.throw(_("Row {0}: Type {1} is not allowed in {2}.").format(tax.idx, tax.charge_type, label))
	if (tax.get("category") or "Total") != "Total" or (tax.get("add_deduct_tax") or "Add") != "Add":
		frappe.throw(_("Row {0}: Books adds purchase taxes and charges to the total.").format(tax.idx))
	if tax.charge_type in PREVIOUS_ROW_TYPES:
		_validate_row_id(tax, label)
	else:
		tax.row_id = None
	if tax.charge_type == "Actual":
		tax.rate = 0
	tax.description = tax.description or tax.account_head


def _validate_row_id(tax, label):
	if tax.idx == 1:
		frappe.throw(
			_(
				"Cannot select charge type as 'On Previous Row Amount' or 'On Previous Row Total' for first row"
			)
		)
	tax.row_id = tax.row_id or str(tax.idx - 1)
	if not 1 <= cint(tax.row_id) < tax.idx:
		frappe.throw(_("Please specify a valid Row ID for row {0} in table {1}").format(tax.idx, label))
