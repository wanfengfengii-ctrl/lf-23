import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { Subscription } from 'rxjs';
import { SimulationState, TrainSchedule, SimulationEvent } from '../../models/railway.model';
import { SimulationService } from '../../services/simulation.service';
import { RailwayDataService } from '../../services/railway-data.service';
import { PlaybackService } from '../../services/playback.service';
import { FaultSimulationService } from '../../services/fault-simulation.service';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.scss'],
})
export class TimelineComponent implements OnInit, OnDestroy {
  @ViewChild('timelineContainer', { static: true }) timelineContainer!: ElementRef;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private xScale!: d3.ScaleLinear<number, number>;

  private width = 800;
  private height = 100;
  private totalDuration = 60;

  private subscriptions: Subscription[] = [];
  private currentTime = 0;

  constructor(
    private simulationService: SimulationService,
    private railwayDataService: RailwayDataService,
    private playbackService: PlaybackService,
    private faultSimulationService: FaultSimulationService
  ) {}

  ngOnInit(): void {
    this.initSvg();

    this.subscriptions.push(
      this.simulationService.state$.subscribe(state => {
        this.currentTime = state.currentTime;
        this.updatePlayhead();

        if (state.mode === 'live' && state.currentTime > this.totalDuration - 10) {
          this.totalDuration = state.currentTime + 30;
          this.updateScale();
          this.updateTimeline();
        }
      })
    );

    this.subscriptions.push(
      this.railwayDataService.schedules$.subscribe(() => {
        this.updateTimeline();
      })
    );

    this.subscriptions.push(
      this.faultSimulationService.state$.subscribe(() => {
        this.updateFaultMarkers();
      })
    );

    this.updateTimeline();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private initSvg(): void {
    const container = this.timelineContainer.nativeElement;
    this.width = container.clientWidth || 800;
    this.height = container.clientHeight || 100;

    this.svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`);

    this.xScale = d3.scaleLinear()
      .domain([0, this.totalDuration])
      .range([50, this.width - 20]);

    this.svg.append('g')
      .attr('class', 'time-axis')
      .attr('transform', `translate(0, ${this.height - 25})`);

    this.svg.append('g')
      .attr('class', 'train-tracks');

    this.svg.append('g')
      .attr('class', 'fault-markers');

    this.svg.append('g')
      .attr('class', 'playhead')
      .append('line')
      .attr('x1', 50)
      .attr('y1', 0)
      .attr('x2', 50)
      .attr('y2', this.height - 25)
      .attr('stroke', '#f44336')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    const playheadCircle = this.svg.select('.playhead')
      .append('circle')
      .attr('cx', 50)
      .attr('cy', this.height - 25)
      .attr('r', 6)
      .attr('fill', '#f44336')
      .style('cursor', 'ew-resize');

    this.svg.select('.playhead')
      .append('rect')
      .attr('x', 30)
      .attr('y', 0)
      .attr('width', 40)
      .attr('height', this.height - 25)
      .attr('fill', 'transparent')
      .style('cursor', 'ew-resize')
      .call(d3.drag<SVGRectElement, unknown>()
        .on('drag', (event) => {
          this.onDrag(event.x);
        })
      );

    this.updateScale();
  }

  private updateScale(): void {
    this.xScale.domain([0, this.totalDuration]);

    const xAxis = d3.axisBottom(this.xScale)
      .ticks(10)
      .tickFormat(d => this.formatTime(d as number));

    (this.svg.select('.time-axis') as any).call(xAxis);
  }

  private updateTimeline(): void {
    const schedules = this.railwayDataService.getSchedules();
    const g = this.svg.select('.train-tracks');

    const trackHeight = 20;
    const trackPadding = 8;

    const trackGroups = g.selectAll<SVGGElement, TrainSchedule>('.train-track')
      .data(schedules, d => d.trainId);

    trackGroups.exit().remove();

    const trackGroupsEnter = trackGroups.enter()
      .append('g')
      .attr('class', 'train-track');

    trackGroupsEnter.append('rect')
      .attr('class', 'track-bg')
      .attr('height', trackHeight)
      .attr('fill', '#f5f5f5')
      .attr('rx', 4);

    trackGroupsEnter.append('rect')
      .attr('class', 'train-bar')
      .attr('height', trackHeight - 4)
      .attr('rx', 3);

    trackGroupsEnter.append('text')
      .attr('class', 'train-label')
      .attr('font-size', '11px')
      .attr('fill', '#333')
      .attr('dy', '0.35em');

    const allTracks = trackGroupsEnter.merge(trackGroups as any);

    allTracks.each((d, i, nodes) => {
      const trackGroup = d3.select(nodes[i]);
      const y = 10 + i * (trackHeight + trackPadding);

      const startTime = d.startTime;
      const duration = this.estimateDuration(d);
      const endTime = startTime + duration;

      const x = this.xScale(startTime);
      const width = this.xScale(endTime) - this.xScale(startTime);

      trackGroup.select('.track-bg')
        .attr('x', 50)
        .attr('y', y)
        .attr('width', this.width - 70);

      trackGroup.select('.train-bar')
        .attr('x', x)
        .attr('y', y + 2)
        .attr('width', Math.max(width, 10))
        .attr('fill', d.color);

      trackGroup.select('.train-label')
        .attr('x', x + 5)
        .attr('y', y + trackHeight / 2)
        .text(d.name);
    });
  }

  private estimateDuration(schedule: TrainSchedule): number {
    const blocks = this.railwayDataService.getBlockSections();
    let totalLength = 0;

    let currentStationId = schedule.startStationId;
    const direction = schedule.direction;

    const maxIterations = blocks.length + 1;
    let iterations = 0;

    while (currentStationId && currentStationId !== schedule.endStationId && iterations < maxIterations) {
      const nextBlock = blocks.find(b =>
        (direction === 'forward' && b.fromStationId === currentStationId) ||
        (direction === 'backward' && b.toStationId === currentStationId)
      );

      if (nextBlock) {
        totalLength += nextBlock.length;
        currentStationId = direction === 'forward' ? nextBlock.toStationId : nextBlock.fromStationId;
      } else {
        break;
      }
      iterations++;
    }

    return schedule.speed > 0 ? totalLength / schedule.speed : 10;
  }

  private updatePlayhead(): void {
    if (!this.svg) return;

    const x = this.xScale(this.currentTime);

    this.svg.select('.playhead line')
      .attr('x1', x)
      .attr('x2', x);

    this.svg.select('.playhead circle')
      .attr('cx', x);

    this.svg.select('.playhead rect')
      .attr('x', x - 20);
  }

  private onDrag(x: number): void {
    const clampedX = Math.max(50, Math.min(this.width - 20, x));
    const time = this.xScale.invert(clampedX);

    this.simulationService.seekTo(Math.max(0, time));
  }

  private updateFaultMarkers(): void {
    if (!this.svg) return;

    const g = this.svg.select('.fault-markers');
    const faultState = this.faultSimulationService.getState();
    const faults = faultState.faults;

    const faultMarkerData = faults.map(fault => ({
      id: fault.id,
      type: fault.type,
      status: fault.status,
      startTime: fault.startTime,
      targetName: fault.targetName,
      severity: fault.severity,
    }));

    const markers = g.selectAll<SVGGElement, typeof faultMarkerData[0]>('.fault-marker')
      .data(faultMarkerData, d => d.id);

    markers.exit().remove();

    const markersEnter = markers.enter()
      .append('g')
      .attr('class', 'fault-marker');

    markersEnter.append('polygon');
    markersEnter.append('text');

    const allMarkers = markersEnter.merge(markers as any);

    const markerY = this.height - 42;
    const self = this;

    allMarkers.each(function(d: any) {
      const marker = d3.select(this);
      const x = self.xScale(d.startTime);

      const color = self.getFaultMarkerColor(d.type, d.status);
      const opacity = d.status === 'resolved' ? 0.4 : 1.0;
      const symbol = self.getFaultMarkerSymbol(d.type);

      marker.select('polygon')
        .attr('points', `${x},${markerY - 10} ${x - 6},${markerY} ${x + 6},${markerY}`)
        .attr('fill', color)
        .attr('opacity', opacity);

      marker.select('text')
        .attr('x', x)
        .attr('y', markerY - 13)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px')
        .attr('fill', color)
        .attr('opacity', opacity)
        .text(symbol);
    });
  }

  private getFaultMarkerColor(type: string, status: string): string {
    if (status === 'resolved') return '#9e9e9e';
    switch (type) {
      case 'signal_fault':
        return '#ff6f00';
      case 'switch_jammed':
        return '#d32f2f';
      case 'block_occupancy_anomaly':
        return '#e65100';
      case 'train_emergency_stop':
        return '#c62828';
      default:
        return '#f44336';
    }
  }

  private getFaultMarkerSymbol(type: string): string {
    switch (type) {
      case 'signal_fault':
        return '⚠信';
      case 'switch_jammed':
        return '⚠岔';
      case 'block_occupancy_anomaly':
        return '⚠区';
      case 'train_emergency_stop':
        return '⚠车';
      default:
        return '⚠';
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
