import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

type RelationshipType = 'CANCELS' | 'MODIFIES' | 'REPLACES' | 'COMPLETES' | string;

type GraphNode = d3.SimulationNodeDatum & {
  id: string; // reference_number
  reference_number?: string;
  document_id?: string | null;
  subject?: string | null;
  publication_date?: string | null;
  status?: 'Active' | 'Abrogated' | string;
};

type GraphLink = d3.SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
  type: RelationshipType;
};

type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

function linkColor(t: RelationshipType): string {
  switch (t) {
    case 'CANCELS':
      return '#ef4444';
    case 'MODIFIES':
      return '#f59e0b';
    case 'REPLACES':
      return '#a855f7';
    case 'COMPLETES':
      return '#3b82f6';
    default:
      return '#94a3b8';
  }
}

function nodeFill(n: GraphNode): string {
  if ((n.status || '').toLowerCase() === 'abrogated') return '#64748b';
  return '#22c55e';
}

export default function GraphView({ dataUrl }: { dataUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const graphDataRef = useRef<GraphData | null>(null);

  const markerId = useMemo(() => `arrow-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    let destroyed = false;
    const container = containerRef.current;
    if (!container) return;

    const render = async () => {
      setError(null);
      setStats(null);

      const res = await fetch(dataUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${dataUrl}`);
      const data = (await res.json()) as GraphData;

      if (destroyed) return;
      graphDataRef.current = data;

      container.innerHTML = '';
      const width = Math.max(900, container.clientWidth || 900);
      const height = Math.max(650, container.clientHeight || 650);

      setStats({ nodes: data.nodes?.length ?? 0, links: data.links?.length ?? 0 });

      const svg = d3
        .select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .style('background', '#0b1020');

      const defs = svg.append('defs');
      defs
        .append('marker')
        .attr('id', markerId)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#94a3b8');

      const g = svg.append('g');

      const links = g
        .append('g')
        .attr('stroke-opacity', 0.85)
        .selectAll('line')
        .data(data.links)
        .join('line')
        .attr('stroke', (d) => linkColor(d.type))
        .attr('stroke-width', (d) => (d.type === 'CANCELS' ? 2.2 : 1.4))
        .attr('marker-end', `url(#${markerId})`);

      const nodes = g
        .append('g')
        .selectAll('circle')
        .data(data.nodes)
        .join('circle')
        .attr('r', 7)
        .attr('fill', (d) => nodeFill(d))
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          setSelectedNode(d);
        });

      const labels = g
        .append('g')
        .selectAll('text')
        .data(data.nodes)
        .join('text')
        .text((d) => d.reference_number || d.id)
        .attr('font-size', 10)
        .attr('fill', '#e2e8f0')
        .attr('dx', 10)
        .attr('dy', 3);

      nodes.append('title').text((d) => `${d.reference_number || d.id}\n${d.subject || ''}`);

      svg.call(
        d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.4, 3])
          .on('zoom', (event) => g.attr('transform', event.transform))
      );

      const simulation = d3
        .forceSimulation<GraphNode>(data.nodes)
        .force(
          'link',
          d3
            .forceLink<GraphNode, GraphLink>(data.links)
            .id((d) => d.id)
            .distance((l) => (l.type === 'CANCELS' ? 130 : 100))
            .strength(0.8)
        )
        .force('charge', d3.forceManyBody().strength(-320))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collide', d3.forceCollide().radius(22));

      const drag = d3
        .drag<any, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      nodes.call(drag as any);

      simulation.on('tick', () => {
        links
          .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
          .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
          .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
          .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

        nodes.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
        labels.attr('x', (d) => (d.x ?? 0) + 6).attr('y', (d) => d.y ?? 0);
      });
    };

    render().catch((e: unknown) => {
      if (destroyed) return;
      setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      destroyed = true;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [dataUrl, markerId]);

  // Effect to highlight searched nodes and populate search results
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      setSearchResults([]);
      svg.selectAll('circle').attr('opacity', 1);
      svg.selectAll('text').attr('opacity', 1);
      return;
    }

    const matchedNodes: GraphNode[] = [];

    svg.selectAll('circle').attr('opacity', (d: any) => {
      const ref = (d.reference_number || d.id || '').toLowerCase();
      const subj = (d.subject || '').toLowerCase();
      const docId = (d.document_id || '').toLowerCase();
      const isMatch = ref.includes(query) || subj.includes(query) || docId.includes(query);
      if (isMatch) matchedNodes.push(d as GraphNode);
      return isMatch ? 1 : 0.2;
    });

    svg.selectAll('text').attr('opacity', (d: any) => {
      const ref = (d.reference_number || d.id || '').toLowerCase();
      const subj = (d.subject || '').toLowerCase();
      const docId = (d.document_id || '').toLowerCase();
      return (ref.includes(query) || subj.includes(query) || docId.includes(query)) ? 1 : 0.2;
    });

    // Deduplicate array (d3 selection iterates multiple times sometimes or we push refs)
    const uniqueMatches = Array.from(new Set(matchedNodes));
    setSearchResults(uniqueMatches);
  }, [searchQuery]);

  return (
    <section className="graph-shell">
      <div className="graph-toolbar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search ref, subject, or doc ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', minWidth: '250px' }}
        />
        <div className="legend">
          <span className="chip" style={{ background: '#ef4444' }}>
            CANCELS
          </span>
          <span className="chip" style={{ background: '#f59e0b' }}>
            MODIFIES
          </span>
          <span className="chip" style={{ background: '#a855f7' }}>
            REPLACES
          </span>
          <span className="chip" style={{ background: '#3b82f6' }}>
            COMPLETES
          </span>
        </div>
        <div className="stats">
          {stats ? (
            <>
              <span>
                Nodes: <b>{stats.nodes}</b>
              </span>
              <span>
                Links: <b>{stats.links}</b>
              </span>
            </>
          ) : (
            <span className="muted">Loading…</span>
          )}
        </div>
      </div>

      {error ? (
        <div className="error">
          Failed to load <code>{dataUrl}</code>: {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', height: '650px' }}>
        <div ref={containerRef} className="graph-canvas" style={{ flexGrow: 1 }} />
        {selectedNode && (
          <div style={{ width: '350px', background: '#1e293b', padding: '1.5rem', borderLeft: '1px solid #334155', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid #334155' }}>Document Details</h3>

            <div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Reference Number</div>
              <div style={{ fontWeight: 'bold' }}>{selectedNode.reference_number || selectedNode.id}</div>
            </div>

            {selectedNode.document_id && (
              <div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Document ID</div>
                <div>{selectedNode.document_id}</div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Status</div>
              <div style={{ color: nodeFill(selectedNode), fontWeight: 'bold' }}>{selectedNode.status || 'Active'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Publication Date</div>
              <div>{selectedNode.publication_date || 'N/A'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Subject</div>
              <div style={{ lineHeight: '1.4' }}>{selectedNode.subject || 'N/A'}</div>
            </div>

            {selectedNode.document_id && (
              <a
                href={`/pdf/document_${selectedNode.document_id.replace(/^document_/, '')}.pdf`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  background: '#10b981',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  textAlign: 'center',
                  fontWeight: 'bold'
                }}
              >
                View PDF Document
              </a>
            )}

            <button
              onClick={() => setSelectedNode(null)}
              style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
            >
              Close Panel
            </button>
          </div>
        )}

        {!selectedNode && searchResults.length > 0 && (
          <div style={{ width: '350px', background: '#1e293b', padding: '1.5rem', borderLeft: '1px solid #334155', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid #334155', marginBottom: '1rem' }}>Search Results ({searchResults.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {searchResults.map((node, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    padding: '0.75rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{node.reference_number || node.id}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {node.subject || 'No subject'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

