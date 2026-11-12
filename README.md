<div align="center">
	<a href="https://frappe.io/books">
		<img src="./frappe_books/public/pwa/icon.svg" alt="Frappe Books logo" height="80px" width="80px"/>
	</a>
	<h2>Frappe Books</h2>
	<p>Modern Accounting Made Simple</p>

[![Database compatibility](https://github.com/frappe/frappe-books/actions/workflows/database-tests.yml/badge.svg)](https://github.com/frappe/frappe-books/actions/workflows/database-tests.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](license.txt)

</div>

<div align="center">
	<img src="./docs/images/desktop-dashboard.png" alt="Frappe Books dashboard"/>
</div>

<div align="center">
	<a href="https://frappe.io/books">Website</a>
	-
	<a href="https://docs.frappe.io/books">Documentation</a>
	-
	<a href="https://github.com/frappe/books">Desktop App</a>
</div>

## Frappe Books

Open-source accounting for small businesses and freelancers, built on the Frappe Framework.

### Motivation

Frappe Books started as a desktop app that keeps one company in one file on one computer. This app puts the same Books interface on a Frappe site. Your team signs in from a browser on any computer or phone. Frappe controls users, roles, and permissions, and your data stays on your own server.

### Key Features

- **Accounting**: Double-entry ledger, chart of accounts, journal entries, and the General Ledger, Profit and Loss, Balance Sheet, and Trial Balance reports.
- **Sales and Purchases**: Quotations, invoices, payments, and returns, with a print format for each document.
- **Inventory**: Stock entries, delivery notes, purchase receipts, batches, serial numbers, and FIFO valuation, with the Stock Ledger and Stock Balance reports.
- **Point of Sale**: POS shifts, checkout, barcode scanning, pricing rules, coupons, and loyalty points.
- **Phone App**: A phone layout with bottom tabs. Install it from the browser to your home screen.
- **Regional**: India GST with the GSTR-1 and GSTR-2 reports, Swiss fields, and translations for more than 15 languages.

<div align="center">
	<img src="./docs/images/desktop-invoice.png" alt="Sales invoice"/>
	<img src="./docs/images/desktop-pos.png" alt="Point of Sale"/>
	<img src="./docs/images/desktop-profit-and-loss.png" alt="Profit and Loss report"/>
	<img src="./docs/images/desktop-dark.png" alt="Dashboard in dark mode"/>
	<img src="./docs/images/desktop-print.png" alt="Printed sales invoice" width="600"/>
</div>

### On Your Phone

<table align="center">
	<tr>
		<td><img src="./docs/images/phone-dashboard.png" alt="Dashboard on a phone" width="180"/></td>
		<td><img src="./docs/images/phone-invoice.png" alt="Sales invoice on a phone" width="180"/></td>
		<td><img src="./docs/images/phone-pos-cart.png" alt="Point of Sale cart on a phone" width="180"/></td>
		<td><img src="./docs/images/phone-profit-and-loss.png" alt="Profit and Loss on a phone" width="180"/></td>
	</tr>
</table>

### Under the Hood

- [**Frappe Framework**](https://github.com/frappe/frappe): A full-stack web application framework written in Python and JavaScript. It gives Books its database layer, user authentication, permissions, and a REST API.

- [**Frappe UI**](https://github.com/frappe/frappe-ui): A Vue-based UI library for single-page apps on the Frappe Framework. The Books interface at `/books` uses its components on desktop and on phones.

## Run with Docker

The included `Dockerfile` and `docker-compose.yml` run Frappe Books on SQLite, so you can try it without installing the Frappe Framework or a database server.

```sh
cp env.example .env
docker compose up --build
```

Open <http://localhost:8000/books> and sign in as `Administrator` with the `ADMIN_PASSWORD` from `.env` (default `admin`). The first start creates the site, installs `frappe_books`, and runs migrations, so it takes a few minutes. Later starts are faster.

Set `SITE_NAME`, `ADMIN_PASSWORD`, and `BOOKS_PORT` in `.env` before the first start. Changing `SITE_NAME` or `ADMIN_PASSWORD` later does not update the site that already exists.

### Email with Mailpit

The stack includes [Mailpit](https://mailpit.axllent.org/) and points outgoing email at it, so nothing is delivered to real recipients. Open <http://localhost:8025> to read the captured messages. The SMTP port is published on `localhost:1025` for other tools.

Mailpit is the SMTP server for the app (`mail_server=mailpit`, `mail_port=1025`); no `Email Account` record is needed. Set the sender in `.env` and restart the stack after changing it:

```sh
MAIL_FROM=books@example.com
MAIL_SENDER_NAME=Frappe Books
```

Use a complete address. Frappe rejects addresses without a domain, such as `books@localhost`, so those emails are never queued.

Queued email is delivered by the background scheduler, normally within a few minutes. Change the host ports with `MAILPIT_SMTP_PORT` and `MAILPIT_HTTP_PORT` if they are already in use.

### Data and backups

The whole `sites/` directory is kept in the `frappe-books-sites` Docker volume (rename it with `BOOKS_DATA_VOLUME`). The SQLite database lives at `sites/<SITE_NAME>/db/<SITE_NAME>.db`.

Export the database file to the current directory:

```sh
docker compose cp books:/home/frappe/frappe-bench/sites/books.localhost/db/books.localhost.db ./books.localhost.db
```

Or take a compressed Frappe backup, including uploaded files, and copy it out:

```sh
docker compose exec books bench --site books.localhost backup --with-files
docker compose cp books:/home/frappe/frappe-bench/sites/books.localhost/private/backups ./backups
```

`docker compose down` stops the containers but keeps the volume. `docker compose down -v` deletes the volume and all Books data.

The stack runs `bench serve` plus a background worker and scheduler, so queued email and scheduled jobs are processed without extra setup. It is still a development-style deployment on SQLite; use a production Frappe deployment for real workloads.

### Published images

CI publishes `ghcr.io/frappe/frappe-books:latest` on every push to `develop`, and an image tagged with the git tag for every tag push:

```sh
docker pull ghcr.io/frappe/frappe-books:latest
```

## Learning and Community

1. [Documentation](https://docs.frappe.io/books): The user guide for Frappe Books.
2. [Telegram Group](https://t.me/frappebooks): Talk with other Frappe Books users.
3. [Frappe Forum](https://discuss.frappe.io): Ask questions about the Frappe Framework and its apps.

## Contributing

1. [Report an Issue](https://github.com/frappe/frappe-books/issues)
2. [Report a Security Vulnerability](https://frappe.io/security)

## License

[AGPL-3.0-only](license.txt)

<br />
<br />
<div align="center" style="padding-top: 0.75rem;">
	<a href="https://frappe.io" target="_blank">
		<picture>
			<source media="(prefers-color-scheme: dark)" srcset="https://frappe.io/files/Frappe-white.png">
			<img src="https://frappe.io/files/Frappe-black.png" alt="Frappe Technologies" height="28"/>
		</picture>
	</a>
</div>
