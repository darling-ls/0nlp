BEGIN;

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  reference_number TEXT NOT NULL UNIQUE,
  publication_date DATE,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Abrogated'))
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  vector_embedding JSONB
);

CREATE TABLE IF NOT EXISTS document_relationships (
  source_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_documents_reference_number ON documents(reference_number);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_relationships_source_id ON document_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_document_relationships_target_id ON document_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_document_relationships_type ON document_relationships(relationship_type);

COMMIT;

