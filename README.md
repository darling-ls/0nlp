# Legal Knowledge Graph & Tariff Classification Indexer (ADII Morocco)

This project transforms Moroccan Customs "Classement Tarifaire" circulars (text extracted from PDFs/OCR) into:

- A normalized dataset (`.jsonl`) ready for future RAG/LLM indexing
- A PostgreSQL relational schema to support document metadata, semantic chunks, and inter-circular relationships
- A lightweight graph export (`graph_data.json`) for a force-directed dependency visualizer (React + D3)

## Start here (recommended order)

1) Pick a run mode:
- Docker (fastest): start with `docker_setup.md`
- Local install (more control): start with `setup_env.md`, then `setup_db.md`

2) Put your inputs in:
- `data/raw_text/*.txt` (one `.txt` per circular)
- `data/metadata/*.json` (yearly metadata files)

3) Run the ETL:
- Transform: `processing/regex_processor.py` -> `data/processed/documents.jsonl`
- Load: `processing/db_loader.py` -> PostgreSQL tables + `data/processed/graph_data.json`

4) (Optional) Visualize:
- Local (no Docker): copy `data/processed/graph_data.json` to `frontend/public/data/graph_data.json`
- Docker: `docker-compose.yml` mounts `data/processed/` into the React app automatically
- Run the React app in `frontend/` (it fetches `/data/graph_data.json`)

## How it works (what happens in each phase)

### Transform phase (`processing/regex_processor.py`)

- Reads all `.txt` files in `data/raw_text/`
- Extracts:
  - Circular number, issue date, subject, legal reference (using your exact RegEx patterns)
  - Tariff codes (sous-positions like `1234.56.78.90`)
  - Relationships by detecting verbs (`abroge`, `modifie`, `remplace`, `complète`) followed by another circular number
- Semantic chunking:
  - Splits content into sections (headings) and then paragraph-sized chunks
  - Exports chunks so you can later embed them and run RAG over them
- Merges with metadata JSON files:
  - Normalizes metadata records and joins by `reference_number` (`YYYY/NNN`)
- Writes one JSON object per line to `data/processed/documents.jsonl`

### Load phase (`processing/db_loader.py`)

- Reads `data/processed/documents.jsonl`
- Upserts each document into `documents`
- Inserts chunks into `document_chunks` (idempotent per document: it clears existing chunks for that document)
- Inserts relationships into `document_relationships` (deduplicated by the primary key)
- Updates document status:
  - If a document is a target of a `CANCELS` relationship, it becomes `Abrogated`
- Exports `data/processed/graph_data.json`:
  - `nodes`: circulars (by reference number)
  - `links`: relationships (edge type = `CANCELS`, `MODIFIES`, etc.)

## Folder structure

```
.
|- data/
|  |- raw_text/                 # input: extracted .txt (one file per circular)
|  |- metadata/                 # input: yearly metadata .json files
|  `- processed/                # output: documents.jsonl, graph_data.json
|- processing/
|  |- regex_processor.py        # Deliverable 1
|  |- db_loader.py              # Deliverable 3
|  `- pipeline.py               # optional helper: runs both steps
|- sql/
|  `- init.sql                  # Deliverable 2
|- frontend/
|  |- public/data/              # static mount for graph_data.json
|  `- src/components/GraphView.tsx
|- docker-compose.yml
|- requirements.txt
|- setup_env.md
|- setup_db.md
`- docker_setup.md
```

## Quick start (Ubuntu local, no Docker)

1) Set up Python + deps: follow `setup_env.md`

2) Set up PostgreSQL + tables: follow `setup_db.md`

3) Export DB URL in your shell:

```bash
export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/adii_kg"
```

4) Run Transform (creates JSONL):

```bash
python3 processing/regex_processor.py \
  --raw-text-dir data/raw_text \
  --metadata-dir data/metadata \
  --out-jsonl data/processed/documents.jsonl
```

5) Inspect output (optional but recommended):

```bash
head -n 1 data/processed/documents.jsonl | python3 -m json.tool | head -n 60
```

6) Run Load (writes to PostgreSQL + graph export):

```bash
python3 processing/db_loader.py \
  --jsonl data/processed/documents.jsonl \
  --graph-out data/processed/graph_data.json
```

7) Confirm DB looks correct:

```bash
sudo -u postgres psql -d adii_kg -c "select count(*) as documents from documents;"
sudo -u postgres psql -d adii_kg -c "select count(*) as chunks from document_chunks;"
sudo -u postgres psql -d adii_kg -c "select count(*) as relationships from document_relationships;"
```

## Notes on input formats

### Raw text (`data/raw_text`)
- One `.txt` per circular (UTF-8 preferred)
- File name can be anything; the processor extracts IDs from the content (or falls back to file name)

### Metadata JSON (`data/metadata`)
Each metadata file may be:
- A list of objects
- Or a dict containing a list under keys like `items`, `data`, `circulars`, `documents`

The processor tries common field names like:
- `number` / `reference_number`
- `date` / `publication_date`
- `description` / `subject`
- `category`, `url`

The join key is always normalized to `reference_number` in the form `YYYY/NNN`.
