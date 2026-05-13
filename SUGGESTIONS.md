# Suggestions, Fixes, and Future Features

This document outlines proposed improvements to the Legal Knowledge Graph & Tariff Classification Indexer. These suggestions cover bug fixes, optimizations, and new features to enhance the project's utility and robustness.

## 1. Enhancing Text Extraction (LLMs & Advanced NLP)

**Current State:** Extraction relies on static RegEx patterns which can be brittle if document formats vary slightly (e.g., typos in OCR, layout changes, complex legal language). While the current RegEx has been optimized, it still fundamentally lacks semantic understanding.

**Suggested Improvements:**
*   **Replace RegEx with a Small Language Model (SLM / LLM):** The most impactful change would be to introduce an LLM to parse the unstructured text into JSON directly.
    *   *Implementation:* You can use a local model like `Mistral 7B` or `Llama 3 8B` (via Ollama) to keep data secure and on-premise, or use cloud APIs (like OpenAI's `gpt-4o-mini` or Anthropic's `claude-3-haiku` for speed and high accuracy).
    *   *Benefits:* LLMs can easily infer relationships without needing strict verb patterns, accurately summarize the `subject`, and confidently extract `tariff_codes` even when embedded in complex tables or nested paragraphs.
*   **Tariff Code Validation:** Implement logic to validate extracted codes against a known taxonomy (if available), or filter out numbers that look like dates or currency amounts.
*   **Chunking Strategy:** Improve the heuristic for detecting headings (`_is_heading`). Use typography cues if available from the PDF extractor, or more sophisticated text structure analysis.

## 2. Optimizing the Database and Loader

**Current State:** The database schema is basic. While it works for small datasets, querying large amounts of text or relationships will become slow without proper indexing. The loader also clears and rewrites all chunks per document.

**Suggested Improvements:**
*   **Database Indexing:**
    *   Add a B-Tree index on `documents.status` and `documents.publication_date` for faster filtering.
    *   Add indexes on `document_relationships.source_id` and `target_id` to speed up graph queries.
*   **Vector Database Support:** The schema has a placeholder `vector_embedding` column. Integrate `pgvector` into the PostgreSQL setup to allow storing and querying dense embeddings natively.
*   **Efficient Upserts:** Optimize `_insert_chunks` to compute hashes of chunks and only insert new/modified ones instead of always deleting and recreating.

## 3. Docker and Infrastructure Optimizations

**Current State:** The current `docker-compose.yml` uses development setups (e.g., Vite dev server for frontend, running Python scripts interactively or sequentially without proper dependency caching in Dockerfiles).

**Suggested Improvements:**
*   **Dockerfile Optimizations:**
    *   Implement multi-stage builds in `processing/Dockerfile` and `frontend/Dockerfile` to reduce image size.
    *   Leverage layer caching by copying `requirements.txt` or `package.json` before the rest of the code.
*   **Service Synchronization:** Ensure the `etl` service waits fully for the DB to be ready, and the `frontend` waits for the `etl` to produce `graph_data.json` (or make the frontend resilient to missing data on startup).
*   **Production Frontend:** Serve the built React application using a lightweight web server like Nginx in the frontend Dockerfile instead of running the Vite dev server.

## 4. Improving React D3 Graph Visualization

**Current State:** The graph displays nodes and links with basic panning, zooming, and dragging. It lacks interactive ways to explore the data.

**Suggested Improvements:**
*   **Search and Highlight:** Add a search bar to find specific circular numbers or subjects. Highlight the matched node and its immediate neighbors.
*   **Filtering:** Add toggles to filter nodes by status (Active/Abrogated) or edges by relationship type (e.g., only show `CANCELS`).
*   **Node Details Panel:** Clicking a node should open a side panel displaying the document's full metadata (subject, date, list of related documents).
*   **Graph Layout Optimization:** Adjust D3 force parameters to prevent node overlapping in dense clusters.

## 5. Future Feature Additions

*   **API Layer (Backend):** Introduce a FastAPI or Express backend to serve the data from PostgreSQL. This would allow the frontend to request data dynamically instead of relying on a static JSON export, enabling features like pagination, complex queries, and lazy loading of the graph.
*   **Retrieval-Augmented Generation (RAG):**
    *   Implement a script to generate embeddings for the text chunks using an LLM (e.g., OpenAI, HuggingFace).
    *   Build a chatbot interface in the frontend where users can ask questions about customs regulations, and the system retrieves the most relevant chunks to synthesize an answer.
*   **Dashboard & Analytics:** Add a view to show statistics over time (e.g., "Number of circulars issued per year", "Most heavily modified circulars").
*   **Document Viewer:** Allow users to view the actual text (or original PDF) of a circular directly in the application.