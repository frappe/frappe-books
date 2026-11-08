ARG PYTHON_VERSION=3.14
ARG DEBIAN_BASE=trixie
ARG FRAPPE_BRANCH=develop
ARG NODE_VERSION=24
ARG NVM_VERSION=v0.40.6
ARG FRAPPE_UID=1000

###############################################################################
# Builder
###############################################################################
FROM python:${PYTHON_VERSION}-slim-${DEBIAN_BASE} AS builder

ARG FRAPPE_BRANCH
ARG NODE_VERSION
ARG NVM_VERSION
ARG FRAPPE_UID

ENV PIP_NO_CACHE_DIR=1 \
    NVM_DIR=/home/frappe/.nvm \
    NVM_SYMLINK_CURRENT=true \
    BENCH_PATH=/home/frappe/frappe-bench

# Build-time system dependencies
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        libcairo2-dev \
        libffi-dev \
        libgif-dev \
        libjpeg-dev \
        liblcms2-dev \
        libldap2-dev \
        libmariadb-dev \
        libpango1.0-dev \
        libpq-dev \
        librsvg2-dev \
        libsasl2-dev \
        libsqlite3-dev \
        libssl-dev \
        libtiff-dev \
        libwebp-dev \
        pkg-config \
        xz-utils \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Own layer: only re-runs if the base image or bench version changes
RUN pip install frappe-bench

RUN useradd -u "${FRAPPE_UID}" -g 0 -d /home/frappe -m -s /bin/bash frappe

USER frappe
WORKDIR /home/frappe

# Node + yarn, installed as the frappe user so no recursive chown is needed
RUN mkdir -p "$NVM_DIR" \
    && curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install "$NODE_VERSION" \
    && nvm use "$NODE_VERSION" \
    && nvm alias default "$NODE_VERSION" \
    && npm install --global yarn@1.22.22

ENV PATH="${NVM_DIR}/current/bin:${PATH}"

# Slow step; cached unless FRAPPE_BRANCH (or anything above) changes
RUN bench init "$BENCH_PATH" \
        --frappe-branch "$FRAPPE_BRANCH" \
        --python "$(command -v python)" \
        --skip-assets \
        --skip-redis-config-generation \
        --no-backups

# Everything below depends on your source, so only this part re-runs on code changes.
# bench get-app clones with git, so make the copied source a repository.
COPY --chown=frappe:0 . /tmp/frappe_books
RUN cd /tmp/frappe_books \
    && git init -q \
    && git add -A \
    && git -c user.name="Docker Build" -c user.email="docker@example.com" commit -qm "Build source" \
    && cd "$BENCH_PATH" \
    && bench get-app --skip-assets /tmp/frappe_books \
    && cd apps/frappe_books \
    && yarn build \
    && cd "$BENCH_PATH" \
    && bench build \
    && cp -a sites/assets assets \
    && rm -rf sites/assets \
    && find apps -mindepth 1 -path "*/.git" -prune -exec rm -rf {} + \
    && rm -rf apps/frappe_books/node_modules apps/frappe_books/frontend/node_modules \
    && rm -rf assets/frappe_books/node_modules assets/frappe/node_modules \
    # Build-time JS deps, already compiled into assets/. Do NOT remove
    # apps/frappe/node_modules: the realtime (socket.io) server needs it.
    # If something breaks, restore island-toolchain first (least certain).
    && rm -rf apps/frappe/flow/node_modules \
              apps/frappe/studio/frontend/node_modules \
              apps/frappe/island-toolchain/node_modules


###############################################################################
# Runtime
###############################################################################
FROM python:${PYTHON_VERSION}-slim-${DEBIAN_BASE} AS runtime

ARG FRAPPE_UID

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    BENCH_PATH=/home/frappe/frappe-bench

# curl, git and procps are kept to be safe. Try removing them one at a time
# and confirm your healthcheck, bench commands and entrypoint still work.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        libharfbuzz0b \
        liblcms2-2 \
        libmagic1 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libpangoft2-1.0-0 \
        mariadb-client \
        postgresql-client \
        procps \
        zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -u "${FRAPPE_UID}" -g 0 -d /home/frappe -m -s /bin/bash frappe \
    && pip install frappe-bench

# Ownership and mode are set at copy time, so no chown -R / chmod / mkdir layers.
# sites/ already exists in the builder output and is owned by frappe via --chown.
COPY --from=builder --chown=frappe:0 /home/frappe/frappe-bench /home/frappe/frappe-bench
COPY --chown=frappe:0 --chmod=755 docker/entrypoint.sh /usr/local/bin/books-entrypoint

USER frappe
WORKDIR /home/frappe/frappe-bench

VOLUME ["/home/frappe/frappe-bench/sites"]
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/books-entrypoint"]
CMD ["serve"]

