import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

type RelationshipType = 'CANCELS' | 'MODIFIES' | 'REPLACES' | 'COMPLETES' | string;

interface GraphNode extends d3.SimulationNodeDatum {
  id: string; // reference_number
  reference_number?: string;
  subject?: string | null;
  publication_date?: string | null;
  status?: 'Active' | 'Abrogated' | string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: RelationshipType;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

@Component({
  selector: 'app-graph-view',
  templateUrl: './graph-view.component.html',
})
export class GraphViewComponent implements AfterViewInit {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private simulation?: d3.Simulation<GraphNode, GraphLink>;

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.http.get<GraphData>('assets/graph_data.json').subscribe({
      next: (data) => this.render(data),
      error: (err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load assets/graph_data.json', err);
      },
    });
  }

  private render(data: GraphData): void {
    const container = this.containerRef.nativeElement;
    const width = Math.max(800, container.clientWidth || 800);
    const height = Math.max(600, container.clientHeight || 600);

    container.innerHTML = '';

    this.svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background', '#0b1020');

    const svg = this.svg;

    // Arrow marker
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8');

    const linkColor = (t: RelationshipType): string => {
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
    };

    const nodeFill = (n: GraphNode): string => {
      if ((n.status || '').toLowerCase() === 'abrogated') return '#64748b';
      return '#22c55e';
    };

    const g = svg.append('g');

    const links = g
      .append('g')
      .attr('stroke-opacity', 0.85)
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke', (d) => linkColor(d.type))
      .attr('stroke-width', (d) => (d.type === 'CANCELS' ? 2.2 : 1.4))
      .attr('marker-end', 'url(#arrow)');

    const nodes = g
      .append('g')
      .selectAll('circle')
      .data(data.nodes)
      .join('circle')
      .attr('r', 7)
      .attr('fill', (d) => nodeFill(d))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5);

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

    // Zoom + pan
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.4, 3])
        .on('zoom', (event) => g.attr('transform', event.transform))
    );

    // Run simulation outside Angular for performance
    this.ngZone.runOutsideAngular(() => {
      this.simulation = d3
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
        .drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) this.simulation?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) this.simulation?.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      nodes.call(drag);

      this.simulation.on('tick', () => {
        links
          .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
          .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
          .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
          .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

        nodes.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
        labels.attr('x', (d) => (d.x ?? 0) + 6).attr('y', (d) => d.y ?? 0);
      });
    });
  }
}

