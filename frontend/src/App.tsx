import GraphView from './components/GraphView';

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="title">ADII Circular Dependency Graph</div>
        <div className="subtitle">Force-directed relationships extracted from circular texts</div>
      </header>

      <main className="content">
        <GraphView dataUrl="/data/graph_data.json" />
      </main>

      <footer className="footer">
        Data source: <code>data/processed/graph_data.json</code> (mounted into <code>/public/data</code> in Docker)
      </footer>
    </div>
  );
}

