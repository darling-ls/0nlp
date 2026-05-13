import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

type RelationshipType = 'CANCELS' | 'MODIFIES' | 'REPLACES' | 'COMPLETES' | string;

type GraphNode = d3.SimulationNodeDatum & {
  id: string; // reference_number
  reference_number?: string;
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
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

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

  // Effect to highlight searched nodes
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = d3.select(containerRef.current).select('svg');
    if (svg.empty()) return;

    const query = searchQuery.trim().toLowerCase();

    svg.selectAll('circle').attr('opacity', (d: any) => {
      if (!query) return 1; // reset
      const ref = (d.reference_number || d.id || '').toLowerCase();
      const subj = (d.subject || '').toLowerCase();
      return (ref.includes(query) || subj.includes(query)) ? 1 : 0.2;
    });

    svg.selectAll('text').attr('opacity', (d: any) => {
      if (!query) return 1;
      const ref = (d.reference_number || d.id || '').toLowerCase();
      const subj = (d.subject || '').toLowerCase();
      return (ref.includes(query) || subj.includes(query)) ? 1 : 0.2;
    });
  }, [searchQuery]);

  return (
    <section className="graph-shell">
      <div className="graph-toolbar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search ref or subject..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc' }}
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
          <div style={{ width: '300px', background: '#1e293b', padding: '1rem', borderLeft: '1px solid #334155', overflowY: 'auto' }}>
            <h3>Document Details</h3>
            <p><strong>Reference:</strong> {selectedNode.reference_number || selectedNode.id}</p>
            <p><strong>Status:</strong> <span style={{ color: nodeFill(selectedNode) }}>{selectedNode.status || 'Active'}</span></p>
            <p><strong>Date:</strong> {selectedNode.publication_date || 'N/A'}</p>
            <p><strong>Subject:</strong> {selectedNode.subject || 'N/A'}</p>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ marginTop: '1rem', padding: '0.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

