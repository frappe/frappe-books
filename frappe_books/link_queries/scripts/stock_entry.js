books.ui.form.on("Stock Entry", {
	setup(frm) {
		// The batch query of Stock Entry's form script
		frm.set_query("batch_no", "items", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			const filters = {
				item_code: row.item_code,
				posting_date: doc.posting_date || books.datetime.nowdate(),
				posting_time: doc.posting_time || books.datetime.now_time(),
			};
			if (doc.purpose !== "Material Receipt") {
				filters.warehouse = row.s_warehouse || row.t_warehouse;
			}
			if (!row.s_warehouse && row.t_warehouse) {
				filters.is_inward = 1;
			}
			if (["Material Receipt", "Material Transfer", "Material Issue"].includes(doc.purpose)) {
				filters.include_expired_batches = 1;
			}
			return { query: "erpnext.controllers.queries.get_batch_no", filters };
		});

		// The transit warehouse query of erpnext.stock.StockEntry.setup_warehouse_query
		frm.set_query("t_warehouse", "items", (doc) => {
			const filters = { is_group: 0, company: doc.company };
			if (doc.purpose === "Material Transfer" && doc.add_to_transit) {
				filters.warehouse_type = "Transit";
			}
			return { filters };
		});
	},
});
