books.ui.form.on("Payment Entry", {
	setup(frm) {
		frm.set_query("paid_from", (doc) => payment_account_query(doc, "Pay", doc.paid_to));
		frm.set_query("paid_to", (doc) => payment_account_query(doc, "Receive", doc.paid_from));

		frm.set_query("party", (doc) => {
			if (doc.party_type === "Employee") {
				return { query: "erpnext.controllers.queries.employee_query" };
			} else if (["Customer", "Supplier"].includes(doc.party_type)) {
				// erpnext.queries.party
				return {
					query: "erpnext.controllers.queries.party_query",
					filters: { disabled: 0, company: doc.company },
				};
			} else if (doc.party_type === "Shareholder") {
				return { filters: { company: doc.company } };
			}
		});

		frm.set_query("reference_doctype", "references", (doc) => {
			let doctypes = ["Journal Entry"];
			if (doc.party_type === "Customer") {
				doctypes = ["Sales Order", "Sales Invoice", "Journal Entry", "Dunning"];
			} else if (doc.party_type === "Supplier") {
				doctypes = ["Purchase Order", "Purchase Invoice", "Journal Entry"];
			}
			return { filters: { name: ["in", doctypes] } };
		});

		frm.set_query("reference_name", "references", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			const filters = { docstatus: 1, company: doc.company };
			const party_doctypes = ["Sales Invoice", "Sales Order", "Purchase Invoice", "Purchase Order", "Dunning"];
			if (party_doctypes.includes(row.reference_doctype)) {
				filters[doc.party_type.toLowerCase()] = doc.party;
			}
			return { filters };
		});
	},
});

/** The paid_from and paid_to queries of Payment Entry's form script; `bank_type` pays from or to a bank. */
function payment_account_query(doc, bank_type, other_account) {
	const account_types = [bank_type, "Internal Transfer"].includes(doc.payment_type)
		? ["Bank", "Cash"]
		: [books.boot.party_account_types[doc.party_type]];
	const filters = { account_type: ["in", account_types], is_group: 0, company: doc.company };
	if (doc.party_type === "Shareholder") {
		account_types.push("Equity");
	}
	if (doc.payment_type === "Internal Transfer" && other_account) {
		filters.name = ["!=", other_account];
	}
	return { filters };
}
