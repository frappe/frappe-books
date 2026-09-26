// Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Books Purchase Invoice", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1) return;
		const module = "frappe_books.frappe_books.doctype.books_purchase_invoice.books_purchase_invoice";
		if (Math.abs(frm.doc.outstanding_amount || 0) > 0) {
			frm.add_custom_button(__("Payment"), () => frappe.model.open_mapped_doc({
				method: `${module}.make_payment`,
				frm,
			}), __("Create"));
		}
		if (!frm.doc.return_against && !frm.doc.is_fully_returned) {
			frm.add_custom_button(__("Purchase Return"), () => frappe.model.open_mapped_doc({
				method: `${module}.make_return`,
				frm,
			}), __("Create"));
		}
	},
});
