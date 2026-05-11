# PostgreSQL setup + schema initialization (Ubuntu)

This guide sets up PostgreSQL and creates the 3 tables used by the ETL:
- `documents`
- `document_chunks`
- `document_relationships`

## What to do first (quick roadmap)

1) Install PostgreSQL
2) Create a database + user/password you will use from `DATABASE_URL`
3) Run `sql/init.sql`
4) Verify the tables

If you want Docker instead, skip to "Option B: Docker".

## Option A: Local PostgreSQL on Ubuntu

### 1) Install PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Check it is running:

```bash
systemctl status postgresql --no-pager
```

### 2) Create a database and a user

Open a `psql` session as the `postgres` admin user:

```bash
sudo -u postgres psql
```

Inside `psql`, create a DB and a role (edit password as you want):

```sql
CREATE DATABASE adii_kg;
CREATE USER adii_user WITH PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE adii_kg TO adii_user;
\q
```

### 3) Run the schema (`sql/init.sql`)

```bash
sudo -u postgres psql -d adii_kg -f sql/init.sql
```

### 4) Verify the tables exist

```bash
sudo -u postgres psql -d adii_kg -c "\dt"
```

Expected tables:
- `documents`
- `document_chunks`
- `document_relationships`

### 5) Set `DATABASE_URL` for the loader

In your shell:

```bash
export DATABASE_URL="postgresql+psycopg://adii_user:change_me@localhost:5432/adii_kg"
```

Then run the loader (after you generate JSONL):

```bash
python processing/db_loader.py --jsonl data/processed/documents.jsonl --graph-out data/processed/graph_data.json
```

### 6) Quick DB sanity checks (after loading)

```bash
sudo -u postgres psql -d adii_kg -c "select count(*) as documents from documents;"
sudo -u postgres psql -d adii_kg -c "select status, count(*) from documents group by status order by status;"
sudo -u postgres psql -d adii_kg -c "select relationship_type, count(*) from document_relationships group by relationship_type order by count(*) desc;"
```

## Option B: Docker (recommended if you do not want local PostgreSQL)

Follow `docker_setup.md`.

Notes:
- The compose file mounts `sql/init.sql` into `/docker-entrypoint-initdb.d/` so PostgreSQL runs it automatically the first time the volume is created.
- The ETL container connects to the DB using `DATABASE_URL=...@db:5432/...` (service name `db`).

