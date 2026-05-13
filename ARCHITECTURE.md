# Project Architecture & Technical Implementation

This document provides an in-depth look into the technical architecture, data flow, and pipeline components of the Legal Knowledge Graph & Tariff Classification Indexer.

## High-Level Overview

The system is designed as an ETL (Extract, Transform, Load) pipeline that ingests Moroccan Customs "Classement Tarifaire" circulars in PDF or raw text format, extracts structured metadata and relationships using NLP/RegEx techniques, stores the processed data in a relational database (PostgreSQL), and provides a frontend visualization of the document dependency graph using React and D3.js.

## Data Flow Pipeline

The data flow consists of four primary stages:

1.  **Extraction (Optional):** PDFs are converted into raw text.
2.  **Transformation (Processing):** Raw text and metadata are parsed, normalized, and structured into a JSONL format.
3.  **Loading (Database & Graph Export):** Structured JSONL is ingested into PostgreSQL, and a graphical representation is exported.
4.  **Visualization (Frontend):** A web interface reads the exported graph data to visualize relationships.

---

## Detailed Pipeline Steps & Component Breakdown

### 1. Extraction Phase
**File:** `processing/pdf_extractor.py`

*   **Purpose:** Converts raw PDF documents into searchable `.txt` files.
*   **Implementation:** Utilizes `PyMuPDF` (imported as `fitz`). It iterates over PDF files in `data/pdf/`, extracts text while attempting to preserve basic layout markers, and writes the output to `data/raw_text/`.
*   **Usage:** This step is optional if raw `.txt` files are already provided.

### 2. Transformation Phase (NLP & RegEx)
**File:** `processing/regex_processor.py`

*   **Purpose:** The core data structuring engine. It reads raw text and external metadata, applies regular expressions to extract key information, chunks the text, and normalizes the data.
*   **Implementation Details:**
    *   **Field Extraction:** Uses compiled RegEx patterns to find:
        *   `reference_number` (e.g., `CIRCULAIRE N° 1234/567`)
        *   `publication_date` (e.g., `Rabat, le 12 janvier 2024`)
        *   `subject` (Objet) and `legal_reference` (Réf)
        *   `tariff_codes` (detects 4 to 10 digit patterns)
    *   **Relationship Extraction:** Scans for specific verbs (`abroge`, `modifie`, `remplace`, etc.) followed by a reference number, categorizing them into types like `CANCELS`, `MODIFIES`, `REPLACES`, `COMPLETES`, or `RELATED_TO`. It also checks structural `REFER:` sections.
    *   **Semantic Chunking (`_semantic_chunk`):** Splits the document by logical headings (e.g., `DESCRIPTION`, `CONCLUSION`) and then into paragraph-sized chunks (useful for future RAG/LLM embeddings).
    *   **Metadata Merging:** Reads JSON metadata files from `data/metadata/`, normalizes the fields, and joins them with the extracted data using the `reference_number` as the primary key.
    *   **Abrogation Logic:** If a document is targeted by a `CANCELS` relationship, it marks the document's status as `Abrogated` (partially handled here, strictly enforced in the DB loader).
*   **Output:** A structured JSON Lines file (`data/processed/documents.jsonl`), where each line is a self-contained JSON object representing a document.

### 3. Loading Phase (Database Ingestion)
**File:** `processing/db_loader.py`

*   **Purpose:** Loads the structured JSONL data into a PostgreSQL relational schema and exports a lightweight JSON file for the graph visualization.
*   **Implementation Details:**
    *   **Database Setup:** Uses `SQLAlchemy` to define the schema (`documents`, `document_chunks`, `document_relationships`) and create tables if they don't exist.
    *   **Upsert Logic:** Iterates over the JSONL file and performs idempotent inserts/updates (`ON CONFLICT DO UPDATE`) into the `documents` table to avoid duplication.
    *   **Relationships & Status:** Inserts edges into `document_relationships`. It enforces data integrity by dynamically creating "placeholder" documents if a target reference doesn't yet exist in the DB. It also runs a final pass to ensure any document targeted by a `CANCELS` relationship has its status set to `Abrogated`.
    *   **Graph Export (`_export_graph`):** Queries the database to build a nodes and links structure, which is then saved as `data/processed/graph_data.json`.

### 4. Orchestration
**File:** `processing/pipeline.py`

*   **Purpose:** Provides a single entry point to run the entire ETL pipeline sequentially.
*   **Implementation:** Reads environment variables to locate data directories, invokes `pdf_extractor.py` (if PDFs are present), then `regex_processor.py`, and finally `db_loader.py`.

### 5. Frontend Visualization
**Files:** `frontend/src/App.tsx`, `frontend/src/components/GraphView.tsx`

*   **Purpose:** A lightweight web application to visualize the extracted relationships.
*   **Implementation Details:**
    *   Built with React, Vite, and D3.js.
    *   `GraphView.tsx` fetches `graph_data.json` asynchronously.
    *   Uses `d3.forceSimulation` to create a force-directed graph where nodes are documents and edges are relationships.
    *   Nodes are color-coded based on status (e.g., Green for Active, Gray for Abrogated).
    *   Edges are color-coded and styled based on relationship type (`CANCELS`, `MODIFIES`, etc.).

### 6. Infrastructure & Deployment
**Files:** `docker-compose.yml`, `processing/Dockerfile`, `frontend/Dockerfile`

*   **Purpose:** Containerize the application for consistent execution across environments.
*   **Implementation Details:**
    *   **`db` service:** Runs PostgreSQL 16 with a healthcheck.
    *   **`etl` service:** Builds the Python processing environment, mounts the `/data` volume, and runs the pipeline. It depends on the `db` service being healthy.
    *   **`frontend` service:** Runs the Vite development server to serve the React application, mounting the processed data volume to access the generated graph JSON.

## Database Schema Overview

The PostgreSQL database (`adii_kg`) consists of three core tables:

1.  **`documents`**: Stores core metadata (ID, reference number, date, subject, status).
2.  **`document_chunks`**: Stores semantic text chunks for each document, with a placeholder `JSONB` column for future vector embeddings. Linked via `document_id`.
3.  **`document_relationships`**: Stores directed edges between documents (`source_id`, `target_id`, `relationship_type`).
