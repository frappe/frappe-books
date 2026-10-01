# Web frontend

`web/main.ts` starts the Vue application. `web/WebApp.vue` reads the Frappe boot data and loads what /books renders from Frappe.

The startup flow has these steps:

1. Redirect a guest user to the Frappe login page.
2. Register the models and load every DocType meta in one request (`frappe/registry.ts`).
3. Load the settings documents and the currency symbols.
4. Show the setup wizard when the company setup is incomplete.
5. Show the Books desk when the company setup is complete.

`initFyo.ts` exports the application Fyo instance. `frappe/` loads and saves documents through Frappe; see `docs/framework-backed-doctypes.md`.
