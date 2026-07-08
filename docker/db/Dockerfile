FROM postgis/postgis:17-3.5

# Install pgvector so both postgis and vector extensions are available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-pgvector \
    && rm -rf /var/lib/apt/lists/*
