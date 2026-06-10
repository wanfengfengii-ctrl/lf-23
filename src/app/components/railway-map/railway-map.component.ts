import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { Subscription } from 'rxjs';
import {
  Station,
  BlockSection,
  Signal,
  Train,
  Switch,
  Route,
  Fault,
  BlockedSection,
  SpeedRestriction,
} from '../../models/railway.model';
import { RailwayDataService } from '../../services/railway-data.service';
import { RouteControlService } from '../../services/route-control.service';
import { FaultSimulationService } from '../../services/fault-simulation.service';

@Component({
  selector: 'app-railway-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './railway-map.component.html',
  styleUrls: ['./railway-map.component.scss'],
})
export class RailwayMapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g!: d3.Selection<SVGGElement, unknown, null, undefined>;

  private stations: Station[] = [];
  private blockSections: BlockSection[] = [];
  private signals: Signal[] = [];
  private trains: Train[] = [];
  private switches: Switch[] = [];
  private routes: Route[] = [];
  private activeFaults: Fault[] = [];
  private blockedSections: BlockedSection[] = [];
  private speedRestrictions: SpeedRestriction[] = [];

  private subscriptions: Subscription[] = [];

  private width = 900;
  private height = 400;

  constructor(
    private railwayDataService: RailwayDataService,
    private routeControlService: RouteControlService,
    private faultSimulationService: FaultSimulationService
  ) {}

  ngOnInit(): void {
    this.initSvg();
    this.setupZoom();

    this.subscriptions.push(
      this.railwayDataService.stations$.subscribe(stations => {
        this.stations = stations;
        this.update();
      })
    );

    this.subscriptions.push(
      this.railwayDataService.blockSections$.subscribe(blocks => {
        this.blockSections = blocks;
        this.update();
      })
    );

    this.subscriptions.push(
      this.railwayDataService.signals$.subscribe(signals => {
        this.signals = signals;
        this.update();
      })
    );

    this.subscriptions.push(
      this.railwayDataService.trains$.subscribe(trains => {
        this.trains = trains;
        this.updateTrains();
      })
    );

    this.subscriptions.push(
      this.railwayDataService.switches$.subscribe(switches => {
        this.switches = switches;
        this.update();
      })
    );

    this.subscriptions.push(
      this.routeControlService.routes$.subscribe(routes => {
        this.routes = routes;
        this.update();
      })
    );

    this.subscriptions.push(
      this.faultSimulationService.state$.subscribe(state => {
        this.activeFaults = state.faults.filter(f => f.status !== 'resolved');
        this.blockedSections = state.blockedSections;
        this.speedRestrictions = state.speedRestrictions;
        this.update();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private initSvg(): void {
    const container = this.mapContainer.nativeElement;
    this.width = container.clientWidth || 900;
    this.height = container.clientHeight || 400;

    this.svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .style('background-color', '#fafafa');

    this.g = this.svg.append('g');

    this.g.append('g').attr('class', 'route-highlights');
    this.g.append('g').attr('class', 'fault-impact-zones');
    this.g.append('g').attr('class', 'block-sections');
    this.g.append('g').attr('class', 'fault-indicators');
    this.g.append('g').attr('class', 'switches');
    this.g.append('g').attr('class', 'signals');
    this.g.append('g').attr('class', 'stations');
    this.g.append('g').attr('class', 'trains');
  }

  private setupZoom(): void {
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', event => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(zoom);
  }

  private update(): void {
    this.updateRouteHighlights();
    this.updateFaultImpactZones();
    this.updateBlockSections();
    this.updateFaultIndicators();
    this.updateSwitches();
    this.updateStations();
    this.updateSignals();
    this.updateTrains();
    this.fitView();
  }

  private fitView(): void {
    if (this.stations.length === 0) return;

    const padding = 80;
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    this.stations.forEach(station => {
      minX = Math.min(minX, station.x);
      minY = Math.min(minY, station.y);
      maxX = Math.max(maxX, station.x);
      maxY = Math.max(maxY, station.y);
    });

    this.signals.forEach(signal => {
      minX = Math.min(minX, signal.x);
      minY = Math.min(minY, signal.y);
      maxX = Math.max(maxX, signal.x);
      maxY = Math.max(maxY, signal.y);
    });

    this.switches.forEach(sw => {
      minX = Math.min(minX, sw.x);
      minY = Math.min(minY, sw.y);
      maxX = Math.max(maxX, sw.x);
      maxY = Math.max(maxY, sw.y);
    });

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const scaleX = this.width / contentWidth;
    const scaleY = this.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1.5);

    const offsetX = (this.width - (maxX + minX) * scale) / 2;
    const offsetY = (this.height - (maxY + minY) * scale) / 2;

    this.g.attr('transform', `translate(${offsetX}, ${offsetY}) scale(${scale})`);
  }

  private updateRouteHighlights(): void {
    const g = this.g.select('.route-highlights');
    const activeRoutes = this.routes.filter(
      r => r.state === 'setup' || r.state === 'locked' || r.state === 'used'
    );

    const highlights = g
      .selectAll<SVGPathElement, Route>('.route-highlight')
      .data(activeRoutes, d => d.id);

    highlights.exit().remove();

    const highlightsEnter = highlights
      .enter()
      .append('path')
      .attr('class', 'route-highlight')
      .attr('fill', 'none')
      .attr('stroke-width', 20)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.3);

    const allHighlights = highlightsEnter.merge(highlights as any);

    allHighlights
      .attr('d', d => this.getRoutePath(d))
      .attr('stroke', d => {
        if (d.state === 'locked' || d.state === 'used') return '#f44336';
        return '#4caf50';
      });
  }

  private updateFaultImpactZones(): void {
    const g = this.g.select('.fault-impact-zones');

    const impactData = this.activeFaults
      .filter(f => f.affectedBlockIds.length > 0)
      .flatMap(fault =>
        fault.affectedBlockIds.map(blockId => ({
          faultId: fault.id,
          blockId,
          faultType: fault.type,
          severity: fault.severity,
        }))
      );

    const zones = g
      .selectAll<SVGLineElement, { faultId: string; blockId: string; faultType: string; severity: string }>(
        '.fault-impact-zone'
      )
      .data(impactData, d => `${d.faultId}-${d.blockId}`);

    zones.exit().remove();

    const zonesEnter = zones
      .enter()
      .append('line')
      .attr('class', 'fault-impact-zone')
      .attr('stroke-width', 16)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.25);

    const allZones = zonesEnter.merge(zones as any);

    allZones
      .attr('x1', d => {
        const block = this.blockSections.find(b => b.id === d.blockId);
        return block ? this.getStationById(block.fromStationId)?.x ?? 0 : 0;
      })
      .attr('y1', d => {
        const block = this.blockSections.find(b => b.id === d.blockId);
        return block ? this.getStationById(block.fromStationId)?.y ?? 0 : 0;
      })
      .attr('x2', d => {
        const block = this.blockSections.find(b => b.id === d.blockId);
        return block ? this.getStationById(block.toStationId)?.x ?? 0 : 0;
      })
      .attr('y2', d => {
        const block = this.blockSections.find(b => b.id === d.blockId);
        return block ? this.getStationById(block.toStationId)?.y ?? 0 : 0;
      })
      .attr('stroke', d => {
        if (d.severity === 'critical') return '#b71c1c';
        if (d.severity === 'major') return '#e65100';
        return '#f57f17';
      });
  }

  private updateFaultIndicators(): void {
    const g = this.g.select('.fault-indicators');

    const blockedBlockIds = new Set(this.blockedSections.map(bs => bs.blockSectionId));
    const speedRestrictedBlockIds = new Set(this.speedRestrictions.map(sr => sr.blockSectionId));

    const faultIndicators: {
      id: string;
      type: 'blocked' | 'anomaly' | 'speed_restriction';
      blockId: string;
      label: string;
    }[] = [];

    for (const bs of this.blockedSections) {
      const block = this.blockSections.find(b => b.id === bs.blockSectionId);
      if (block) {
        faultIndicators.push({
          id: `blocked-${bs.blockSectionId}`,
          type: 'blocked',
          blockId: bs.blockSectionId,
          label: '封锁',
        });
      }
    }

    for (const fault of this.activeFaults) {
      if (fault.type === 'block_occupancy_anomaly') {
        faultIndicators.push({
          id: `anomaly-${fault.targetId}`,
          type: 'anomaly',
          blockId: fault.targetId,
          label: '异常',
        });
      }
    }

    for (const sr of this.speedRestrictions) {
      faultIndicators.push({
        id: `speed-${sr.blockSectionId}`,
        type: 'speed_restriction',
        blockId: sr.blockSectionId,
        label: `${sr.maxSpeed}km/h`,
      });
    }

    const indicators = g
      .selectAll<SVGGElement, { id: string; type: string; blockId: string; label: string }>(
        '.fault-indicator'
      )
      .data(faultIndicators, d => d.id);

    indicators.exit().remove();

    const indicatorsEnter = indicators
      .enter()
      .append('g')
      .attr('class', 'fault-indicator');

    indicatorsEnter.append('rect').attr('class', 'fi-bg').attr('rx', 3);

    indicatorsEnter
      .append('text')
      .attr('class', 'fi-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('fill', '#fff');

    const allIndicators = indicatorsEnter.merge(indicators as any);

    allIndicators.each((d, i, nodes) => {
      const block = this.blockSections.find(b => b.id === d.blockId);
      if (!block) return;

      const fromStation = this.getStationById(block.fromStationId);
      const toStation = this.getStationById(block.toStationId);
      if (!fromStation || !toStation) return;

      const midX = (fromStation.x + toStation.x) / 2;
      const midY = (fromStation.y + toStation.y) / 2;

      const el = d3.select(nodes[i]);
      el.attr('transform', `translate(${midX}, ${midY + 16})`);

      el.select('.fi-bg')
        .attr('width', d.label.length * 6 + 8)
        .attr('height', 14)
        .attr('x', -(d.label.length * 6 + 8) / 2)
        .attr('y', -10)
        .attr('fill', d.type === 'blocked' ? '#d32f2f' : d.type === 'anomaly' ? '#ff6f00' : '#1565c0');

      el.select('.fi-label')
        .attr('y', 0)
        .text(d.label);
    });
  }

  private getRoutePath(route: Route): string {
    if (route.blockSectionIds.length === 0) return '';

    let path = '';
    let isFirst = true;

    for (const blockId of route.blockSectionIds) {
      const block = this.blockSections.find(b => b.id === blockId);
      if (!block) continue;

      const fromStation = this.stations.find(s => s.id === block.fromStationId);
      const toStation = this.stations.find(s => s.id === block.toStationId);

      if (!fromStation || !toStation) continue;

      if (isFirst) {
        path += `M ${fromStation.x} ${fromStation.y}`;
        isFirst = false;
      }

      path += ` L ${toStation.x} ${toStation.y}`;
    }

    return path;
  }

  private updateBlockSections(): void {
    const g = this.g.select('.block-sections');

    const blockedBlockIds = new Set(this.blockedSections.map(bs => bs.blockSectionId));

    const blocks = g
      .selectAll<SVGGElement, BlockSection>('.block-section')
      .data(this.blockSections, d => d.id);

    blocks.exit().remove();

    const blocksEnter = blocks.enter().append('g').attr('class', 'block-section');

    blocksEnter.append('line').attr('class', 'track').attr('stroke', '#9e9e9e').attr('stroke-width', 8).attr('stroke-linecap', 'round');

    blocksEnter
      .append('line')
      .attr('class', 'track-overlay')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20);

    blocksEnter
      .append('line')
      .attr('class', 'blocked-overlay')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 12)
      .attr('stroke-linecap', 'round')
      .attr('stroke-dasharray', '8,6');

    const allBlocks = blocksEnter.merge(blocks as any);

    allBlocks
      .select('.track')
      .attr('x1', d => this.getStationById(d.fromStationId)?.x ?? 0)
      .attr('y1', d => this.getStationById(d.fromStationId)?.y ?? 0)
      .attr('x2', d => this.getStationById(d.toStationId)?.x ?? 0)
      .attr('y2', d => this.getStationById(d.toStationId)?.y ?? 0)
      .attr('stroke', d => {
        if (blockedBlockIds.has(d.id)) return '#b71c1c';
        if (d.isOccupied) return '#f44336';
        if (d.isRouteLocked) return '#ff9800';
        return '#9e9e9e';
      })
      .attr('stroke-width', d => (d.isOccupied || blockedBlockIds.has(d.id) ? 10 : 6));

    allBlocks
      .select('.track-overlay')
      .attr('x1', d => this.getStationById(d.fromStationId)?.x ?? 0)
      .attr('y1', d => this.getStationById(d.fromStationId)?.y ?? 0)
      .attr('x2', d => this.getStationById(d.toStationId)?.x ?? 0)
      .attr('y2', d => this.getStationById(d.toStationId)?.y ?? 0);

    allBlocks
      .select('.blocked-overlay')
      .attr('x1', d => this.getStationById(d.fromStationId)?.x ?? 0)
      .attr('y1', d => this.getStationById(d.fromStationId)?.y ?? 0)
      .attr('x2', d => this.getStationById(d.toStationId)?.x ?? 0)
      .attr('y2', d => this.getStationById(d.toStationId)?.y ?? 0)
      .attr('stroke', d => blockedBlockIds.has(d.id) ? '#ffcdd2' : 'transparent')
      .attr('opacity', d => blockedBlockIds.has(d.id) ? 0.8 : 0);

    allBlocks.select('title').remove();
    allBlocks
      .append('title')
      .text(d => {
        let status = d.isOccupied ? '占用' : d.isRouteLocked ? '进路锁闭' : '空闲';
        if (blockedBlockIds.has(d.id)) status += ' [已封锁]';
        const sr = this.speedRestrictions.find(s => s.blockSectionId === d.id);
        if (sr) status += ` [限速${sr.maxSpeed}km/h]`;
        return `${d.name} - ${status}`;
      });
  }

  private updateSwitches(): void {
    const g = this.g.select('.switches');

    const jammedSwitchIds = new Set(
      this.activeFaults
        .filter(f => f.type === 'switch_jammed')
        .map(f => f.targetId)
    );

    const switchElements = g
      .selectAll<SVGGElement, Switch>('.switch')
      .data(this.switches, d => d.id);

    switchElements.exit().remove();

    const switchesEnter = switchElements
      .enter()
      .append('g')
      .attr('class', 'switch')
      .attr('cursor', 'pointer');

    switchesEnter
      .append('circle')
      .attr('class', 'switch-base')
      .attr('r', 12)
      .attr('stroke', '#795548')
      .attr('stroke-width', 2);

    switchesEnter
      .append('line')
      .attr('class', 'switch-indicator')
      .attr('stroke', '#795548')
      .attr('stroke-width', 3)
      .attr('stroke-linecap', 'round');

    switchesEnter
      .append('text')
      .attr('class', 'switch-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#666');

    switchesEnter
      .append('text')
      .attr('class', 'switch-fault-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('fill', '#c62828')
      .attr('opacity', 0);

    const allSwitches = switchesEnter.merge(switchElements as any);

    allSwitches.attr('transform', d => `translate(${d.x}, ${d.y})`);

    allSwitches
      .select('.switch-base')
      .attr('fill', d => {
        if (jammedSwitchIds.has(d.id)) return '#ffcdd2';
        if (d.isLocked) return '#ffcdd2';
        return '#efebe9';
      })
      .attr('stroke', d => {
        if (jammedSwitchIds.has(d.id)) return '#c62828';
        if (d.isLocked) return '#f44336';
        return '#795548';
      })
      .attr('stroke-width', d => jammedSwitchIds.has(d.id) ? 3 : 2);

    allSwitches
      .select('.switch-indicator')
      .attr('x1', -8)
      .attr('y1', 0)
      .attr('x2', d => (d.position === 'normal' ? 8 : 8))
      .attr('y2', d => (d.position === 'normal' ? 0 : -8))
      .attr('stroke', d => {
        if (jammedSwitchIds.has(d.id)) return '#c62828';
        if (d.isLocked) return '#f44336';
        return '#795548';
      });

    allSwitches
      .select('.switch-label')
      .attr('y', 24)
      .text(d => d.name);

    allSwitches
      .select('.switch-fault-label')
      .attr('y', -20)
      .attr('opacity', d => jammedSwitchIds.has(d.id) ? 1 : 0)
      .text(d => jammedSwitchIds.has(d.id) ? '卡阻' : '');

    allSwitches.select('title').remove();
    allSwitches
      .append('title')
      .text(d => {
        let status = `${d.name} - ${d.position === 'normal' ? '定位' : '反位'}`;
        if (d.isLocked) status += ' (已锁闭)';
        if (jammedSwitchIds.has(d.id)) status += ' [卡阻故障]';
        return status;
      });
  }

  private updateStations(): void {
    const g = this.g.select('.stations');

    const stations = g
      .selectAll<SVGGElement, Station>('.station')
      .data(this.stations, d => d.id);

    stations.exit().remove();

    const stationsEnter = stations
      .enter()
      .append('g')
      .attr('class', 'station')
      .attr('cursor', 'pointer');

    stationsEnter
      .append('circle')
      .attr('r', 22)
      .attr('fill', '#fff')
      .attr('stroke', '#3f51b5')
      .attr('stroke-width', 3);

    stationsEnter
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', '#3f51b5');

    stationsEnter
      .append('text')
      .attr('class', 'station-name')
      .attr('text-anchor', 'middle')
      .attr('dy', '42px')
      .attr('font-size', '14px')
      .attr('fill', '#333');

    const allStations = stationsEnter.merge(stations as any);

    allStations.attr('transform', d => `translate(${d.x}, ${d.y})`);

    allStations
      .select('text:first-of-type')
      .text(d => d.name.charAt(0));

    allStations.select('.station-name').text(d => d.name);
  }

  private updateSignals(): void {
    const g = this.g.select('.signals');

    const faultySignalIds = new Set(
      this.activeFaults
        .filter(f => f.type === 'signal_fault')
        .map(f => f.targetId)
    );

    const signals = g
      .selectAll<SVGGElement, Signal>('.signal')
      .data(this.signals, d => d.id);

    signals.exit().remove();

    const signalsEnter = signals.enter().append('g').attr('class', 'signal');

    signalsEnter
      .append('line')
      .attr('class', 'signal-pole')
      .attr('stroke', '#666')
      .attr('stroke-width', 2);

    signalsEnter
      .append('circle')
      .attr('class', 'signal-light')
      .attr('r', 8)
      .attr('stroke', '#333')
      .attr('stroke-width', 2);

    signalsEnter
      .append('text')
      .attr('class', 'signal-name')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#666');

    signalsEnter
      .append('rect')
      .attr('class', 'manual-indicator')
      .attr('width', 16)
      .attr('height', 8)
      .attr('rx', 2)
      .attr('fill', '#ff9800');

    signalsEnter
      .append('text')
      .attr('class', 'manual-text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '6px')
      .attr('fill', '#fff')
      .attr('font-weight', 'bold')
      .text('M');

    signalsEnter
      .append('text')
      .attr('class', 'signal-fault-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('fill', '#c62828')
      .attr('opacity', 0);

    const allSignals = signalsEnter.merge(signals as any);

    allSignals.attr('transform', d => `translate(${d.x}, ${d.y})`);

    allSignals
      .select('.signal-pole')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 25);

    allSignals
      .select('.signal-light')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('fill', d => {
        if (faultySignalIds.has(d.id)) return '#ff6f00';
        return d.state === 'clear' ? '#4caf50' : '#f44336';
      })
      .attr('stroke', d => faultySignalIds.has(d.id) ? '#c62828' : '#333')
      .attr('stroke-width', d => faultySignalIds.has(d.id) ? 3 : 2)
      .attr(
        'filter',
        d => {
          if (faultySignalIds.has(d.id)) return 'drop-shadow(0 0 8px #ff6f00)';
          return d.state === 'clear'
            ? 'drop-shadow(0 0 6px #4caf50)'
            : 'drop-shadow(0 0 6px #f44336)';
        }
      );

    allSignals
      .select('.signal-name')
      .attr('y', -15)
      .text(d => d.name);

    allSignals
      .select('.manual-indicator')
      .attr('x', -8)
      .attr('y', 10)
      .attr('opacity', d => (d.isManualMode ? 1 : 0));

    allSignals
      .select('.manual-text')
      .attr('y', 16)
      .attr('opacity', d => (d.isManualMode ? 1 : 0));

    allSignals
      .select('.signal-fault-label')
      .attr('y', -25)
      .attr('opacity', d => faultySignalIds.has(d.id) ? 1 : 0)
      .text(d => faultySignalIds.has(d.id) ? '故障' : '');

    allSignals.select('title').remove();
    allSignals
      .append('title')
      .text(d => {
        let status = `${d.name} - ${d.state === 'clear' ? '开放' : '关闭'}`;
        if (d.isManualMode) status += ' (人工模式)';
        if (faultySignalIds.has(d.id)) status += ' [故障]';
        return status;
      });
  }

  private updateTrains(): void {
    const g = this.g.select('.trains');

    const emergencyTrainIds = new Set(
      this.activeFaults
        .filter(f => f.type === 'train_emergency_stop')
        .map(f => f.targetId)
    );

    const trains = g
      .selectAll<SVGGElement, Train>('.train')
      .data(this.trains, d => d.id);

    trains.exit().remove();

    const trainsEnter = trains.enter().append('g').attr('class', 'train');

    trainsEnter
      .append('rect')
      .attr('class', 'train-body')
      .attr('width', 34)
      .attr('height', 18)
      .attr('rx', 4)
      .attr('stroke', '#333')
      .attr('stroke-width', 2);

    trainsEnter
      .append('circle')
      .attr('class', 'train-window')
      .attr('r', 5)
      .attr('fill', '#fff');

    trainsEnter
      .append('text')
      .attr('class', 'train-name')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', '#fff');

    trainsEnter
      .append('text')
      .attr('class', 'train-fault-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('fill', '#c62828')
      .attr('opacity', 0);

    const allTrains = trainsEnter.merge(trains as any);

    allTrains.attr('transform', d => {
      const pos = this.getTrainPosition(d);
      return `translate(${pos.x - 17}, ${pos.y - 9})`;
    });

    allTrains.select('.train-body')
      .attr('fill', d => d.color)
      .attr('stroke', d => emergencyTrainIds.has(d.id) ? '#c62828' : '#333')
      .attr('stroke-width', d => emergencyTrainIds.has(d.id) ? 3 : 2)
      .attr('stroke-dasharray', d => emergencyTrainIds.has(d.id) ? '4,2' : 'none');

    allTrains.select('.train-window').attr('cx', 17).attr('cy', 9);

    allTrains
      .select('.train-name')
      .attr('x', 17)
      .attr('y', -6)
      .text(d => d.name);

    allTrains
      .select('.train-fault-label')
      .attr('x', 17)
      .attr('y', -16)
      .attr('opacity', d => emergencyTrainIds.has(d.id) ? 1 : 0)
      .text(d => emergencyTrainIds.has(d.id) ? '紧急停车' : '');
  }

  private getTrainPosition(train: Train): { x: number; y: number } {
    if (train.currentStationId) {
      const station = this.getStationById(train.currentStationId);
      if (station) {
        return { x: station.x, y: station.y - 35 };
      }
    }

    if (train.currentBlockSectionId) {
      const block = this.getBlockById(train.currentBlockSectionId);
      if (block) {
        const fromStation = this.getStationById(block.fromStationId);
        const toStation = this.getStationById(block.toStationId);

        if (fromStation && toStation) {
          const progress =
            train.direction === 'forward'
              ? train.progress / block.length
              : 1 - train.progress / block.length;

          const x = fromStation.x + (toStation.x - fromStation.x) * progress;
          const y = fromStation.y + (toStation.y - fromStation.y) * progress;

          return { x, y: y - 25 };
        }
      }
    }

    return { x: 0, y: 0 };
  }

  private getStationById(id: string): Station | undefined {
    return this.stations.find(s => s.id === id);
  }

  private getBlockById(id: string): BlockSection | undefined {
    return this.blockSections.find(b => b.id === id);
  }
}
