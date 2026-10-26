books.ui.form.on("Journal Entry", {
	setup(frm) {
		// erpnext.journal_entry.account_query
		frm.set_query("account", "accounts", (doc) => {
			const filters = { company: doc.company, is_group: 0 };
			if (!doc.multi_currency) {
				filters.account_currency = ["in", [get_currency(doc.company), null]];
			}
			return { filters };
		});
	},
});
