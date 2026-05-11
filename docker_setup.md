# Docker setup (DB + ETL + Frontend) on Ubuntu (headless)

Use this if you want the fastest way to run PostgreSQL + the ETL without installing Postgres locally.

## What to do first (quick roadmap)

1) Install Docker Engine + Compose plugin
2) Put your inputs in `data/raw_text/` and `data/metadata/`
3) Create a `.env`
4) Run `docker compose up --build`
5) Check outputs in `data/processed/`

## 1) Install Docker on Ubuntu

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
```

Sanity check:

```bash
docker version
docker compose version
```

## 2) Prepare inputs on the host (mounted into the ETL container)

From the repo root:

```bash
mkdir -p data/raw_text data/metadata data/processed
```

Place your files:
- `data/raw_text/*.txt`
- `data/metadata/*.json`

## 3) Create `.env` (database settings + ETL connection string)

Start from the example:

```bash
cp .env.example .env
```

Then edit `.env` if needed. Default:

```env
POSTGRES_DB=adii_kg
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/adii_kg
```

Notes:
- `db` in `DATABASE_URL` is the Docker Compose service name for PostgreSQL.
- PostgreSQL is exposed on the host at port `5454` (see `docker-compose.yml`) to avoid clashing with local Postgres.

## 4) Start DB + ETL

Run:

```bash
docker compose up --build
```

What happens:
- `db` starts PostgreSQL and runs `sql/init.sql` automatically on first initialization
- `etl` runs `processing/pipeline.py`:
  - Transform: writes `/data/processed/documents.jsonl`
  - Load: writes to PostgreSQL and exports `/data/processed/graph_data.json`

Outputs appear on your host at:
- `data/processed/documents.jsonl`
- `data/processed/graph_data.json`

## 5) Check logs and outputs

ETL logs:

```bash
docker compose logs -f etl
```

Check the generated files:

```bash
ls -lh data/processed/
head -n 1 data/processed/documents.jsonl | python3 -m json.tool | head -n 60
```

## 6) Re-running the ETL

If you change input text/metadata and want to rerun:

```bash
docker compose run --rm etl
```

The loader is designed to be mostly idempotent:
- `documents` are upserted by `reference_number`
- `document_chunks` are cleared and re-inserted per document
- relationships are deduplicated by primary key

## 7) Resetting the database completely (danger: deletes data)

If you want a clean DB (fresh schema + empty tables):

```bash
docker compose down -v
docker compose up --build
```

`-v` removes the named volume (`pg_data`) that stores PostgreSQL data.

## 8) Optional: run the React frontend container

The `frontend` service is behind a Compose profile (so it does not run by default).

Requirements:
- A React (Vite) app exists in `./frontend` (this repo includes one: `frontend/package.json`)
- The ETL output exists at `data/processed/graph_data.json` (mounted into the container at `/app/public/data/graph_data.json`)

Run:

```bash
docker compose --profile frontend up --build
```

Headless access:
- Open from your laptop: `http://<server-ip>:5173`
- Or use SSH port forwarding:
  - `ssh -L 5173:localhost:5173 <user>@<server-ip>`
  - then open `http://localhost:5173`
