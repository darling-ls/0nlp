import argparse
import json
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import JSON, BigInteger, Column, Date, MetaData, String, Table, Text, create_engine, select, text
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert


metadata = MetaData()


documents = Table(
    "documents",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("reference_number", Text, nullable=False, unique=True),
    Column("publication_date", Date),
    Column("subject", Text),
    Column("status", Text, nullable=False),
)


document_chunks = Table(
    "document_chunks",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("document_id", BigInteger, nullable=False),
    Column("chunk_text", Text, nullable=False),
    Column("vector_embedding", JSONB),
)


document_relationships = Table(
    "document_relationships",
    metadata,
    Column("source_id", BigInteger, nullable=False),
    Column("target_id", BigInteger, nullable=False),
    Column("relationship_type", Text, nullable=False),
)


def _date_from_iso(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except Exception:
        return None


def _iter_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def _upsert_document(conn, reference_number: str, publication_date: Optional[date], subject: Optional[str], status: str) -> int:
    stmt = (
        pg_insert(documents)
        .values(
            reference_number=reference_number,
            publication_date=publication_date,
            subject=subject,
            status=status or "Active",
        )
        .on_conflict_do_update(
            index_elements=[documents.c.reference_number],
            set_={
                # Keep the richest available values (prefer non-null incoming)
                "publication_date": text("COALESCE(EXCLUDED.publication_date, documents.publication_date)"),
                "subject": text("COALESCE(EXCLUDED.subject, documents.subject)"),
                "status": text("COALESCE(EXCLUDED.status, documents.status)"),
            },
        )
        .returning(documents.c.id)
    )
    return int(conn.execute(stmt).scalar_one())


def _insert_chunks(conn, document_id: int, chunks: List[Dict[str, Any]]) -> None:
    # Make loader idempotent per document
    conn.execute(document_chunks.delete().where(document_chunks.c.document_id == document_id))
    rows = []
    for ch in chunks:
        chunk_text = ch.get("chunk_text") or ch.get("text")
        if not chunk_text:
            continue
        rows.append(
            {
                "document_id": document_id,
                "chunk_text": chunk_text,
                "vector_embedding": None,
            }
        )
    if rows:
        conn.execute(document_chunks.insert(), rows)


def _insert_relationships(
    conn,
    source_id: int,
    relationships: List[Dict[str, Any]],
    id_by_ref: Dict[str, int],
) -> List[Tuple[int, int]]:
    canceled_pairs: List[Tuple[int, int]] = []
    rows = []
    for rel in relationships:
        rel_type = rel.get("relationship_type")
        target_ref = rel.get("target_reference_number")
        if not rel_type or not target_ref:
            continue
        target_id = id_by_ref.get(target_ref)
        if not target_id:
            target_id = _upsert_document(conn, target_ref, None, None, "Active")
            id_by_ref[target_ref] = target_id
        rows.append({"source_id": source_id, "target_id": target_id, "relationship_type": rel_type})
        if rel_type == "CANCELS":
            canceled_pairs.append((source_id, target_id))

    if rows:
        stmt = pg_insert(document_relationships).values(rows).on_conflict_do_nothing(
            index_elements=[
                document_relationships.c.source_id,
                document_relationships.c.target_id,
                document_relationships.c.relationship_type,
            ]
        )
        conn.execute(stmt)

    return canceled_pairs


def _export_graph(conn, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc_rows = conn.execute(
        select(
            documents.c.id,
            documents.c.reference_number,
            documents.c.publication_date,
            documents.c.subject,
            documents.c.status,
        )
    ).fetchall()

    id_to_ref = {int(r.id): r.reference_number for r in doc_rows}

    rel_rows = conn.execute(
        select(
            document_relationships.c.source_id,
            document_relationships.c.target_id,
            document_relationships.c.relationship_type,
        )
    ).fetchall()

    nodes = []
    for r in doc_rows:
        nodes.append(
            {
                "id": r.reference_number,  # stable ID for D3
                "db_id": int(r.id),
                "reference_number": r.reference_number,
                "publication_date": r.publication_date.isoformat() if r.publication_date else None,
                "subject": r.subject,
                "status": r.status,
            }
        )

    links = []
    for r in rel_rows:
        src_ref = id_to_ref.get(int(r.source_id))
        tgt_ref = id_to_ref.get(int(r.target_id))
        if not src_ref or not tgt_ref:
            continue
        links.append({"source": src_ref, "target": tgt_ref, "type": r.relationship_type})

    payload = {"nodes": nodes, "links": links}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


@dataclass
class LoaderArgs:
    jsonl_path: Path
    database_url: str
    graph_out: Path


def run(args: LoaderArgs) -> None:
    engine = create_engine(args.database_url, pool_pre_ping=True)
    id_by_ref: Dict[str, int] = {}
    canceled_target_ids: List[int] = []

    with engine.begin() as conn:
        for doc in _iter_jsonl(args.jsonl_path):
            ref = doc.get("reference_number")
            if not ref:
                continue
            pub_date = _date_from_iso(doc.get("publication_date"))
            subject = doc.get("subject")
            status = doc.get("status") or "Active"

            doc_id = _upsert_document(conn, ref, pub_date, subject, status)
            id_by_ref[ref] = doc_id

            chunks = doc.get("chunks") if isinstance(doc.get("chunks"), list) else []
            _insert_chunks(conn, doc_id, chunks)

            relationships = doc.get("relationships") if isinstance(doc.get("relationships"), list) else []
            _insert_relationships(conn, doc_id, relationships, id_by_ref)

        # Ensure abrogated status for any targets of CANCELS relationships
        target_ids = conn.execute(
            select(document_relationships.c.target_id).where(document_relationships.c.relationship_type == "CANCELS")
        ).scalars().all()
        if target_ids:
            conn.execute(
                documents.update().where(documents.c.id.in_(target_ids)).values(status="Abrogated")
            )

        _export_graph(conn, args.graph_out)

    print(f"Loaded JSONL into PostgreSQL and wrote graph export to {args.graph_out}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Load processed JSONL into PostgreSQL (SQLAlchemy).")
    parser.add_argument("--jsonl", required=True, type=Path, dest="jsonl_path")
    parser.add_argument("--db-url", required=False, default=os.environ.get("DATABASE_URL"), dest="database_url")
    parser.add_argument("--graph-out", required=True, type=Path, dest="graph_out")
    ns = parser.parse_args()

    if not ns.database_url:
        raise SystemExit("--db-url not provided and DATABASE_URL is not set.")

    run(LoaderArgs(jsonl_path=ns.jsonl_path, database_url=ns.database_url, graph_out=ns.graph_out))


if __name__ == "__main__":
    main()
