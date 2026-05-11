import os
from pathlib import Path

from processing.db_loader import LoaderArgs, run as run_loader
from processing.regex_processor import ProcessorArgs, run as run_processor


def main() -> None:
    raw_text_dir = Path(os.environ.get("RAW_TEXT_DIR", "data/raw_text"))
    metadata_dir = Path(os.environ.get("METADATA_DIR", "data/metadata"))
    out_jsonl = Path(os.environ.get("OUT_JSONL", "data/processed/documents.jsonl"))
    graph_out = Path(os.environ.get("GRAPH_OUT", "data/processed/graph_data.json"))
    database_url = os.environ.get("DATABASE_URL")

    run_processor(
        ProcessorArgs(
            raw_text_dir=raw_text_dir,
            metadata_dir=metadata_dir,
            out_jsonl=out_jsonl,
        )
    )

    if not database_url:
        raise SystemExit("DATABASE_URL is not set; cannot load into PostgreSQL.")

    run_loader(
        LoaderArgs(
            jsonl_path=out_jsonl,
            database_url=database_url,
            graph_out=graph_out,
        )
    )


if __name__ == "__main__":
    main()

