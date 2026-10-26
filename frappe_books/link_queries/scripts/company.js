books.ui.form.on("Company", {
	setup(frm) {
		// The perpetual inventory accounts of erpnext.company.setup_queries. Desk sets them as a
		// company with perpetual inventory loads; they matter only then, so /books always does.
		const accounts = {
			stock_adjustment_account: { root_type: "Expense", account_type: "Stock Adjustment" },
			stock_received_but_not_billed: { root_type: "Liability", account_type: "Stock Received But Not Billed" },
		};
		for (const [fieldname, filters] of Object.entries(accounts)) {
			frm.set_query(fieldname, (doc) => ({ filters: { company: doc.name, is_group: 0, ...filters } }));
		}
	},
});
