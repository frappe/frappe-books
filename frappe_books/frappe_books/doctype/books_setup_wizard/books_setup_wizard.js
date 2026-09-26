// Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Books Setup Wizard", {
	async refresh(frm) {
		if (await frappe.db.get_single_value("Books Accounting Settings", "setup_complete")) {
			frm.disable_save();
			frm.dashboard.set_headline_alert(__("Frappe Books setup is complete."), "green");
			return;
		}

		frm.page.set_primary_action(__("Complete Setup"), async () => {
			await frm.save();
			await frappe.call({
				method: "frappe_books.frappe_books.doctype.books_setup_wizard.books_setup_wizard.complete_setup",
				freeze: true,
				freeze_message: __("Creating the chart of accounts and defaults…"),
			});
			await frm.reload_doc();
		});
	},
});
