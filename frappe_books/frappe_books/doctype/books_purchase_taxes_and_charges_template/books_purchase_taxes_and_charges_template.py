# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe_books.accounting.taxes import TaxesTemplateController


class BooksPurchaseTaxesandChargesTemplate(TaxesTemplateController):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_purchase_taxes_and_charges.books_purchase_taxes_and_charges import (
			BooksPurchaseTaxesandCharges,
		)

		company: DF.Link | None
		disabled: DF.Check
		is_default: DF.Check
		taxes: DF.Table[BooksPurchaseTaxesandCharges]
		title: DF.Data
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Purchase Taxes and Charges Template"
