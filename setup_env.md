# Environment setup (Ubuntu Linux, headless)

This guide sets up the Python ETL (Transform + Load) and optionally the Angular frontend on an Ubuntu server without a GUI.

## What to do first (quick roadmap)

1) If you want the fastest start: use Docker (`docker_setup.md`) and skip local installs.
2) If you want local installs:
   - Do **Python setup** (this file)
   - Then do **PostgreSQL setup** (`setup_db.md`)
   - Then run Transform + Load

## 1) Install system packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip build-essential
```

If you will connect to PostgreSQL installed on the same machine (non-Docker):

```bash
sudo apt install -y libpq-dev
```

## 2) Get the project and prepare input folders

From the repo root, ensure these folders exist:

```bash
mkdir -p data/raw_text data/metadata data/processed
```

Put your files here:
- Raw text: `data/raw_text/*.txt`
- Metadata: `data/metadata/*.json`

## 3) Create and activate a Python virtual environment

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Sanity check imports:

```bash
python -c "import pandas, sqlalchemy; print('python deps ok')"
```

Note:
- `PyMuPDF` is included in `requirements.txt` for future PDF extraction work, but the current ETL scripts in `processing/` read from already-extracted `.txt` files.

## 4) Configure database connection

The loader reads `DATABASE_URL` (SQLAlchemy format). Example for a local PostgreSQL:

```bash
export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/adii_kg"
```

Tip (optional): add it to your shell profile so you do not retype it:

```bash
echo 'export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/adii_kg"' >> ~/.bashrc
source ~/.bashrc
```

## 5) Run the ETL (Transform then Load)

### Step 5.1: Transform (extract + merge + chunk -> JSONL)

What it does:
- Parses `data/raw_text/*.txt`
- Extracts fields using RegEx
- Merges with `data/metadata/*.json`
- Writes `data/processed/documents.jsonl`

Run:

```bash
python processing/regex_processor.py \
  --raw-text-dir data/raw_text \
  --metadata-dir data/metadata \
  --out-jsonl data/processed/documents.jsonl
```

Check the first record:

```bash
head -n 1 data/processed/documents.jsonl | python -m json.tool | head -n 80
```

### Step 5.2: Load (JSONL -> PostgreSQL + graph export)

What it does:
- Upserts documents into PostgreSQL
- Inserts chunks + relationships
- Exports `data/processed/graph_data.json` for the frontend

Run:

```bash
python processing/db_loader.py \
  --jsonl data/processed/documents.jsonl \
  --graph-out data/processed/graph_data.json
```

## 6) (Optional) Install Node.js + Angular CLI (headless)

You have two common options on Ubuntu:

### Option A: Use `nvm` (recommended)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
npm -v
```

Install Angular CLI and D3:

```bash
npm install -g @angular/cli
cd frontend
npm install d3
```

Run the dev server on a headless machine:

```bash
ng serve --host 0.0.0.0 --port 4200
```

Then open from your laptop:
- `http://<server-ip>:4200`

### Option B: Use Ubuntu packages (may be older)

If your distro Node version is old, prefer `nvm`.

## 7) (Optional) Accessing the Angular dev server securely

If you do not want to expose port `4200`, use SSH port forwarding from your laptop:

```bash
ssh -L 4200:localhost:4200 <user>@<server-ip>
```

Then open locally:
- `http://localhost:4200`
