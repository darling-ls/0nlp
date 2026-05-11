# React frontend (Vite) — Dependency graph

This React app renders the force-directed dependency graph using D3.

## Where the data comes from

The ETL writes:
- `data/processed/graph_data.json`

The React app loads it at runtime from:
- `/data/graph_data.json`

### Docker (recommended)

`docker-compose.yml` mounts:
- `./data/processed` -> `frontend/public/data` (read-only)

So the browser can fetch:
- `http://<server-ip>:5173/data/graph_data.json`

## Run locally (no Docker)

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open:
- `http://<server-ip>:5173`

