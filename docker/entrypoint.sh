#!/usr/bin/env bash
set -euo pipefail

BENCH_PATH="${BENCH_PATH:-/home/frappe/frappe-bench}"
SITE_NAME="${SITE_NAME:-books.localhost}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
PORT="${PORT:-8000}"
REDIS_CACHE_URL="${REDIS_CACHE_URL:-redis://redis:6379/0}"
REDIS_QUEUE_URL="${REDIS_QUEUE_URL:-redis://redis:6379/1}"
MAIL_SERVER="${MAIL_SERVER:-mailpit}"
MAIL_PORT="${MAIL_PORT:-1025}"
MAIL_FROM="${MAIL_FROM:-books@example.com}"
MAIL_SENDER_NAME="${MAIL_SENDER_NAME:-Frappe Books}"
COMMAND="${1:-serve}"

cd "$BENCH_PATH"

# Worker and scheduler containers reuse the site prepared by the web container.
if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
    # The sites directory is a volume. Keep the assets built in the image available
    # after Docker initializes (or replaces) that volume.
    rm -rf sites/assets
    ln -s "$BENCH_PATH/assets" sites/assets

    bench set-config -g redis_cache "$REDIS_CACHE_URL"
    bench set-config -g redis_queue "$REDIS_QUEUE_URL"
    bench set-config -g redis_socketio "$REDIS_CACHE_URL"

    # Site config doubles as a fallback outgoing Email Account, so no Email
    # Account record is needed. Mailpit accepts mail without authentication.
    bench set-config -g mail_server "$MAIL_SERVER"
    bench set-config -g mail_port "$MAIL_PORT"
    bench set-config -g auto_email_id "$MAIL_FROM"
    bench set-config -g email_sender_name "$MAIL_SENDER_NAME"
    bench set-config -g disable_mail_smtp_authentication 1
    bench set-config -g always_use_account_email_id_as_sender 1
    bench set-config -g always_use_account_name_as_sender_name 1

    if [ ! -f "sites/$SITE_NAME/site_config.json" ]; then
        echo "Creating site $SITE_NAME (SQLite)..."
        bench new-site "$SITE_NAME" --db-type sqlite --db-name "$SITE_NAME" \
            --admin-password "$ADMIN_PASSWORD"
    fi

    INSTALLED_APPS="$(bench --site "$SITE_NAME" list-apps)"
    if ! grep -qE '^frappe_books([[:space:]]|$)' <<< "$INSTALLED_APPS"; then
        bench --site "$SITE_NAME" install-app frappe_books
    fi

    bench --site "$SITE_NAME" migrate

    # The mail settings above are read from the cache, so refresh it.
    bench --site "$SITE_NAME" clear-cache
fi

repair_scheduled_jobs() {
    # Frappe dates scheduled jobs with the time zone that was active when they
    # were created. When the Books setup wizard later changes the time zone,
    # those jobs can sit hours in the future. Make them due again.
    bench --site "$SITE_NAME" execute \
        "frappe.db.sql(\"update \`tabScheduled Job Type\` set last_execution = %(now)s where (last_execution is null and creation > %(now)s) or last_execution > %(now)s\", {'now': frappe.utils.now()})" >/dev/null 2>&1 || true
}

case "$COMMAND" in
    serve)
        exec bench --site "$SITE_NAME" serve --host 0.0.0.0 --port "$PORT" --noreload
        ;;
    worker)
        exec bench worker --queue short,default,long
        ;;
    schedule)
        repair_scheduled_jobs
        (while sleep 60; do repair_scheduled_jobs; done) &
        exec bench schedule
        ;;
    *)
        exec "$@"
        ;;
esac
