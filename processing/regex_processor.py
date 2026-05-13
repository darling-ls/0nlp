import argparse
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
from tqdm import tqdm


# --- Required exact RegEx patterns (as provided & enhanced) ---
CIRCULAR_NUMBER_RE = re.compile(r"(?i)CIRCULAIRE\s+N°\s*(\d{4}\s*/\s*\d{3}|\d{4}-\d{3})")
DATE_OF_ISSUE_RE = re.compile(r"(?i)Rabat,?\s*le\s*(\d{1,2}\s*[a-zA-Zéû]+\s*\d{4})")
SUBJECT_RE = re.compile(r"(?i)Objet\s*:\s*(.*?)(?=\n\n|\nRéf|\nLe\s+Directeur)", re.DOTALL)
LEGAL_REFERENCE_RE = re.compile(r"(?i)Réf\.?\s*:\s*(.*?)(?=\n\n|La question|En\s+application)", re.DOTALL)

# Enhanced to catch 4, 6, 8, 10 digits with optional dots and spaces
TARIFF_CODES_RE = re.compile(r"\b(\d{2,4}(?:\s?\.\s?\d{2}){0,4})\b")

# Capture references in the "REFER:" or "Réf:" sections
STRUCTURAL_REF_RE = re.compile(r"(?i)(?:REFER|Réf|Référence)\s*:\s*(.*?)(?=\n\n|Le\s+Service|Toute\s+difficulté)", re.DOTALL)
REF_NUMBER_ONLY_RE = re.compile(r"(\d{4}\s*/\s*\d{3}|\d{4}-\d{3})")

RELATIONSHIP_RE = re.compile(
    r"(?i)\b(abroge|modifie|remplace|compl[eè]te|annule|ajoute|supprime|abrogent|modifient|remplacent|compl[eè]tent)\b.{0,200}?\b(\d{4}\s*/\s*\d{3}|\d{4}-\d{3})\b"
)

SECTION_TITLES = {
    "DESCRIPTION",
    "UTILISATION",
    "CLASSEMENT",
    "CLASSEMENT TARIFAIRE",
    "SOUS-POSITION",
    "SOUS POSITION",
    "POSITION",
    "OBSERVATIONS",
    "CONCLUSION",
}


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore").replace("\r\n", "\n").replace("\r", "\n")


def _clean_inline(text: Any) -> Optional[str]:
    if not isinstance(text, str) or pd.isna(text):
        return None
    cleaned = re.sub(r"[ \t]+", " ", text.strip())
    cleaned = re.sub(r"\n+", "\n", cleaned).strip()
    return cleaned


def _clean_single_line(text: Any) -> Optional[str]:
    if not isinstance(text, str) or pd.isna(text):
        return None
    return re.sub(r"\s+", " ", text.strip())


def _normalize_ref_number(value: Any) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    val_str = str(value).replace(" ", "")
    # Normalize dash to slash
    val_str = val_str.replace("-", "/")
    match = re.search(r"(\d{4}/\d{3})", val_str)
    return match.group(1) if match else None


FRENCH_MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
}


def _parse_date_maybe(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    raw_str = str(raw).strip()

    # Try ISO-like: YYYY-MM-DD
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", raw_str)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    # Try common Moroccan/FR style: DD/MM/YYYY
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", raw_str)
    if m:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))

    # Try extracted pattern: "12 janvier 2020"
    m = re.fullmatch(r"(\d{1,2})\s*([A-Za-zéûÉÛ]+)\s*(\d{4})", raw_str)
    if m:
        day = int(m.group(1))
        month_name = m.group(2).lower()
        year = int(m.group(3))
        month = FRENCH_MONTHS.get(month_name)
        if month:
            return date(year, month, day)

    return None


def _extract_fields(text: str) -> Dict[str, Any]:
    reference_number = None
    m = CIRCULAR_NUMBER_RE.search(text)
    if m:
        reference_number = m.group(1)

    date_raw = None
    m = DATE_OF_ISSUE_RE.search(text)
    if m:
        date_raw = _clean_single_line(m.group(1))

    subject = None
    m = SUBJECT_RE.search(text)
    if m:
        subject = _clean_single_line(m.group(1))

    legal_reference = None
    m = LEGAL_REFERENCE_RE.search(text)
    if m:
        legal_reference = _clean_inline(m.group(1))

    # Improved tariff code extraction: filter for at least 4 digits to avoid noise
    raw_codes = TARIFF_CODES_RE.findall(text)
    tariff_codes = []
    for code in raw_codes:
        clean_code = code.replace(" ", "")
        digits_only = re.sub(r"\D", "", clean_code)
        if len(digits_only) >= 4:
            tariff_codes.append(clean_code)
    tariff_codes = sorted(set(tariff_codes))

    return {
        "reference_number": reference_number,
        "publication_date_raw": date_raw,
        "publication_date": _parse_date_maybe(date_raw).isoformat() if _parse_date_maybe(date_raw) else None,
        "subject": subject,
        "legal_reference": legal_reference,
        "tariff_codes": tariff_codes,
    }


def _relationship_type_from_verb(verb: str) -> str:
    v = verb.lower()
    if v.startswith("abrog") or v == "abroge" or v == "annule" or v.startswith("supprim"):
        return "CANCELS"
    if v.startswith("modif"):
        return "MODIFIES"
    if v.startswith("remplac"):
        return "REPLACES"
    if v.startswith("compl") or v.startswith("ajout"):
        return "COMPLETES"
    return "RELATED_TO"


def _extract_relationships(text: str) -> List[Dict[str, Any]]:
    relationships: List[Dict[str, Any]] = []
    
    # 1. Verb-based relationships
    for m in RELATIONSHIP_RE.finditer(text):
        verb = m.group(1)
        target = m.group(2)
        rel_type = _relationship_type_from_verb(verb)
        span = m.span()
        start = max(0, span[0] - 60)
        end = min(len(text), span[1] + 60)
        evidence = _clean_single_line(text[start:end])
        relationships.append(
            {
                "relationship_type": rel_type,
                "verb": verb,
                "target_reference_number": target,
                "evidence": evidence[:240] if evidence else None,
            }
        )

    # 2. Structural references (REFER:)
    m_ref = STRUCTURAL_REF_RE.search(text)
    if m_ref:
        ref_block = m_ref.group(1)
        for target in REF_NUMBER_ONLY_RE.findall(ref_block):
            # Avoid duplicating if already found by verb
            if any(r["target_reference_number"] == target for r in relationships):
                continue
            relationships.append(
                {
                    "relationship_type": "RELATED_TO",
                    "verb": "refer",
                    "target_reference_number": target,
                    "evidence": f"Found in REFER block: {_clean_single_line(ref_block[:100])}",
                }
            )

    return relationships


def _is_heading(line: str) -> Optional[str]:
    stripped = line.strip()
    if not stripped:
        return None
    if len(stripped) > 80:
        return None
    normalized = stripped.rstrip(":").strip()
    upper = normalized.upper()

    if upper in SECTION_TITLES:
        return upper

    # Heuristic: all-caps headings (common in official docs)
    if upper == normalized and 5 <= len(upper) <= 40 and re.fullmatch(r"[A-ZÉÈÀÙÇ \-']+", upper):
        return upper

    return None


def _semantic_chunk(text: str, max_chars: int = 1400) -> List[Dict[str, Any]]:
    lines = text.split("\n")

    sections: List[Tuple[str, str]] = []
    current_title = "FULL_TEXT"
    buf: List[str] = []

    def flush() -> None:
        nonlocal buf, current_title
        section_text = "\n".join(buf).strip()
        if section_text:
            sections.append((current_title, section_text))
        buf = []

    for line in lines:
        heading = _is_heading(line)
        if heading:
            flush()
            current_title = heading
            continue
        buf.append(line)

    flush()

    chunks: List[Dict[str, Any]] = []
    chunk_index = 0
    for section_title, section_text in sections:
        paragraphs = [p.strip() for p in re.split(r"\n{2,}", section_text) if p.strip()]
        current: List[str] = []
        current_len = 0

        def flush_chunk() -> None:
            nonlocal chunk_index, current, current_len
            if not current:
                return
            chunk_text = "\n\n".join(current).strip()
            if chunk_text:
                chunks.append(
                    {
                        "chunk_index": chunk_index,
                        "section_title": section_title,
                        "chunk_text": chunk_text,
                    }
                )
                chunk_index += 1
            current = []
            current_len = 0

        for para in paragraphs:
            if current_len + len(para) + 2 > max_chars and current:
                flush_chunk()
            current.append(para)
            current_len += len(para) + 2

        flush_chunk()

    return chunks


def _load_metadata_df(metadata_dir: Path) -> pd.DataFrame:
    records: List[Dict[str, Any]] = []

    def coalesce(obj: Dict[str, Any], keys: Iterable[str]) -> Any:
        for k in keys:
            if k in obj and obj[k] not in (None, ""):
                return obj[k]
        return None

    for path in sorted(metadata_dir.glob("*.json")):
        try:
            content = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue

        items = None
        if isinstance(content, list):
            items = content
        elif isinstance(content, dict):
            for key in ("items", "data", "circulars", "documents"):
                if isinstance(content.get(key), list):
                    items = content[key]
                    break
        if not items:
            continue

        for obj in items:
            if not isinstance(obj, dict):
                continue
            ref = _normalize_ref_number(
                coalesce(obj, ("reference_number", "number", "numero", "num", "ref", "reference"))
            )
            if not ref:
                continue

            pub_raw = coalesce(obj, ("publication_date", "date", "issued_at"))
            pub_dt = _parse_date_maybe(str(pub_raw)) if pub_raw else None

            url_str = coalesce(obj, ("url", "source_url", "link"))
            doc_id = coalesce(obj, ("document_id", "doc_id"))

            # If doc_id isn't directly present, try extracting from URL
            if not doc_id and url_str:
                m_url = re.search(r"documentId=(\d+)", str(url_str))
                if m_url:
                    doc_id = m_url.group(1)

            records.append(
                {
                    "reference_number": ref,
                    "document_id": doc_id,
                    "publication_date": pub_dt.isoformat() if pub_dt else None,
                    "subject": coalesce(obj, ("subject", "description", "objet", "title")),
                    "category": coalesce(obj, ("category", "categorie")),
                    "url": url_str,
                    "metadata_source_file": path.name,
                    "raw_metadata": obj,
                }
            )

    if not records:
        return pd.DataFrame(
            columns=[
                "reference_number",
                "document_id",
                "publication_date",
                "subject",
                "category",
                "url",
                "metadata_source_file",
                "raw_metadata",
            ]
        )

    df = pd.DataFrame.from_records(records)
    df = df.sort_values(by=["metadata_source_file", "reference_number"]).drop_duplicates(
        subset=["reference_number"], keep="last"
    )
    return df


@dataclass
class ProcessorArgs:
    raw_text_dir: Path
    metadata_dir: Path
    out_jsonl: Path


def run(args: ProcessorArgs) -> None:
    args.out_jsonl.parent.mkdir(parents=True, exist_ok=True)

    metadata_df = _load_metadata_df(args.metadata_dir)

    docs: List[Dict[str, Any]] = []
    text_files = sorted(list(args.raw_text_dir.glob("*.txt")))

    for path in tqdm(text_files, desc="Parsing text files"):
        text = _read_text(path)
        extracted = _extract_fields(text)
        if not extracted.get("reference_number"):
            extracted["reference_number"] = _normalize_ref_number(path.name)

        relationships = _extract_relationships(text)
        chunks = _semantic_chunk(text)

        docs.append(
            {
                "reference_number": extracted.get("reference_number"),
                "publication_date": extracted.get("publication_date"),
                "publication_date_raw": extracted.get("publication_date_raw"),
                "subject": extracted.get("subject"),
                "legal_reference": extracted.get("legal_reference"),
                "tariff_codes": extracted.get("tariff_codes") or [],
                "relationships": relationships,
                "chunks": chunks,
                "source": {
                    "text_file": path.name,
                },
            }
        )

    docs_df = pd.DataFrame.from_records(docs)
    if not docs_df.empty:
        docs_df["reference_number"] = docs_df["reference_number"].apply(_normalize_ref_number)

    merged = docs_df.merge(metadata_df, how="left", on="reference_number", suffixes=("", "_meta"))

    # Decide final fields with preference for extracted values, then metadata fallback.
    def safe_list(v: Any) -> List[Any]:
        return v if isinstance(v, list) else []

    def safe_dict(v: Any) -> Dict[str, Any]:
        return v if isinstance(v, dict) else {}

    def coalesce_val(v1: Any, v2: Any) -> Any:
        if v1 is not None and not pd.isna(v1):
            return v1
        if v2 is not None and not pd.isna(v2):
            return v2
        return None

    final_docs: List[Dict[str, Any]] = []
    for row in merged.to_dict(orient="records"):
        reference_number = row.get("reference_number")
        if not reference_number or pd.isna(reference_number):
            continue

        publication_date = coalesce_val(row.get("publication_date"), row.get("publication_date_meta"))
        subject = coalesce_val(row.get("subject"), row.get("subject_meta"))
        source_obj = safe_dict(row.get("source"))

        final_docs.append(
            {
                "reference_number": reference_number,
                "document_id": row.get("document_id") if not pd.isna(row.get("document_id")) else None,
                "publication_date": publication_date,
                "subject": _clean_single_line(subject),
                "status": "Active",  # updated after relationship pass
                "legal_reference": _clean_inline(row.get("legal_reference")),
                "tariff_codes": safe_list(row.get("tariff_codes")),
                "category": row.get("category") if not pd.isna(row.get("category")) else None,
                "url": row.get("url") if not pd.isna(row.get("url")) else None,
                "relationships": safe_list(row.get("relationships")),
                "chunks": safe_list(row.get("chunks")),
                "source": {
                    "text_file": source_obj.get("text_file"),
                    "metadata_file": row.get("metadata_source_file") if not pd.isna(row.get("metadata_source_file")) else None,
                },
                "raw_metadata": row.get("raw_metadata") if not pd.isna(row.get("raw_metadata")) else None,
            }
        )

    # Mark abrogated targets if any document CANCELS them.
    canceled_targets = set()
    for doc in final_docs:
        for rel in doc.get("relationships", []):
            if rel.get("relationship_type") == "CANCELS" and rel.get("target_reference_number"):
                canceled_targets.add(rel["target_reference_number"])
    for doc in final_docs:
        if doc["reference_number"] in canceled_targets:
            doc["status"] = "Abrogated"

    with args.out_jsonl.open("w", encoding="utf-8") as f:
        for doc in final_docs:
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")

    print(f"Wrote {len(final_docs)} documents to {args.out_jsonl}")


def main() -> None:
    parser = argparse.ArgumentParser(description="NLP & RegEx processor for Moroccan customs circulars.")
    parser.add_argument("--raw-text-dir", required=True, type=Path)
    parser.add_argument("--metadata-dir", required=True, type=Path)
    parser.add_argument("--out-jsonl", required=True, type=Path)
    ns = parser.parse_args()

    run(
        ProcessorArgs(
            raw_text_dir=ns.raw_text_dir,
            metadata_dir=ns.metadata_dir,
            out_jsonl=ns.out_jsonl,
        )
    )


if __name__ == "__main__":
    main()
