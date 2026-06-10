import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { Subscription } from 'rxjs';
import { Station, BlockSection, Signal, Train } from '../../models/railway.model';
import { RailwayDataService } from '../../services/railway-data.service';

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

  private subscriptions: Subscription[] = [];

  private width = 900;
  private height = 400;

  constructor(private railwayDataService: RailwayDataService) {}

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
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private initSvg(): void {
    const container = this.mapContainer.nativeElement;
    this.width = container.clientWidth || 900;
    this.height = container.clientHeight || 400;

    this.svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .style('background-color', '#fafafa');

    this.g = this.svg.append('g');

    this.g.append('g').attr('class', 'block-sections');
    this.g.append('g').attr('class', 'signals');
    this.g.append('g').attr('class', 'stations');
    this.g.append('g').attr('class', 'trains');
  }

  private setupZoom(): void {
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(zoom);
  }

  private update(): void {
    this.updateBlockSections();
    this.updateStations();
    this.updateSignals();
    this.fitView();
  }

  private fitView(): void {
    if (this.stations.length === 0) return;

    const padding = 60;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

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

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const scaleX = this.width / contentWidth;
    const scaleY = this.height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1.5);

    const offsetX = (this.width - (maxX + minX) * scale) / 2;
    const offsetY = (this.height - (maxY + minY) * scale) / 2;

    this.g.attr('transform', `translate(${offsetX}, ${offsetY}) scale(${scale})`);
  }

  private updateBlockSections(): void {
    const g = this.g.select('.block-sections');

    const blocks = g.selectAll<SVGLineElement, BlockSection>('.block-section')
      .data(this.blockSections, d => d.id);

    blocks.exit().remove();

    const blocksEnter = blocks.enter()
      .append('g')
      .attr('class', 'block-section');

    blocksEnter.append('line')
      .attr('class', 'track')
      .attr('stroke', '#9e9e9e')
      .attr('stroke-width', 8)
      .attr('stroke-linecap', 'round');

    blocksEnter.append('line')
      .attr('class', 'track-overlay')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20);

    const allBlocks = blocksEnter.merge(blocks as any);

    allBlocks.select('.track')
      .attr('x1', d => this.getStationById(d.fromStationId)?.x ?? 0)
      .attr('y1', d => this.getStationById(d.fromStationId)?.y ?? 0)
      .attr('x2', d => this.getStationById(d.toStationId)?.x ?? 0)
      .attr('y2', d => this.getStationById(d.toStationId)?.y ?? 0)
      .attr('stroke', d => d.isOccupied ? '#f44336' : '#9e9e9e')
      .attr('stroke-width', d => d.isOccupied ? 10 : 6);

    allBlocks.select('.track-overlay')
      .attr('x1', d => this.getStationById(d.fromStationId)?.x ?? 0)
      .attr('y1', d => this.getStationById(d.fromStationId)?.y ?? 0)
      .attr('x2', d => this.getStationById(d.toStationId)?.x ?? 0)
      .attr('y2', d => this.getStationById(d.toStationId)?.y ?? 0);

    allBlocks.append('title')
      .text(d => `${d.name} - ${d.isOccupied ? '占用' : '空闲'}`);
  }

  private updateStations(): void {
    const g = this.g.select('.stations');

    const stations = g.selectAll<SVGGElement, Station>('.station')
      .data(this.stations, d => d.id);

    stations.exit().remove();

    const stationsEnter = stations.enter()
      .append('g')
      .attr('class', 'station')
      .attr('cursor', 'pointer');

    stationsEnter.append('circle')
      .attr('r', 20)
      .attr('fill', '#fff')
      .attr('stroke', '#3f51b5')
      .attr('stroke-width', 3);

    stationsEnter.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', '#3f51b5');

    stationsEnter.append('text')
      .attr('class', 'station-name')
      .attr('text-anchor', 'middle')
      .attr('dy', '40px')
      .attr('font-size', '14px')
      .attr('fill', '#333');

    const allStations = stationsEnter.merge(stations as any);

    allStations.attr('transform', d => `translate(${d.x}, ${d.y})`);

    allStations.select('text:first-of-type')
      .text(d => d.name.charAt(0));

    allStations.select('.station-name')
      .text(d => d.name);
  }

  private updateSignals(): void {
    const g = this.g.select('.signals');

    const signals = g.selectAll<SVGGElement, Signal>('.signal')
      .data(this.signals, d => d.id);

    signals.exit().remove();

    const signalsEnter = signals.enter()
      .append('g')
      .attr('class', 'signal');

    signalsEnter.append('line')
      .attr('class', 'signal-pole')
      .attr('stroke', '#666')
      .attr('stroke-width', 2);

    signalsEnter.append('circle')
      .attr('class', 'signal-light')
      .attr('r', 8)
      .attr('stroke', '#333')
      .attr('stroke-width', 2);

    signalsEnter.append('text')
      .attr('class', 'signal-name')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#666');

    const allSignals = signalsEnter.merge(signals as any);

    allSignals.attr('transform', d => `translate(${d.x}, ${d.y})`);

    allSignals.select('.signal-pole')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 25);

    allSignals.select('.signal-light')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('fill', d => d.state === 'clear' ? '#4caf50' : '#f44336')
      .attr('filter', d => d.state === 'clear' ? 'drop-shadow(0 0 4px #4caf50)' : 'drop-shadow(0 0 4px #f44336)');

    allSignals.select('.signal-name')
      .attr('y', -15)
      .text(d => d.name);
  }

  private updateTrains(): void {
    const g = this.g.select('.trains');

    const trains = g.selectAll<SVGGElement, Train>('.train')
      .data(this.trains, d => d.id);

    trains.exit().remove();

    const trainsEnter = trains.enter()
      .append('g')
      .attr('class', 'train');

    trainsEnter.append('rect')
      .attr('class', 'train-body')
      .attr('width', 30)
      .attr('height', 16)
      .attr('rx', 3)
      .attr('stroke', '#333')
      .attr('stroke-width', 2);

    trainsEnter.append('circle')
      .attr('class', 'train-window')
      .attr('r', 4)
      .attr('fill', '#fff');

    trainsEnter.append('text')
      .attr('class', 'train-name')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', '#fff');

    const allTrains = trainsEnter.merge(trains as any);

    allTrains.attr('transform', d => {
      const pos = this.getTrainPosition(d);
      return `translate(${pos.x - 15}, ${pos.y - 8})`;
    });

    allTrains.select('.train-body')
      .attr('fill', d => d.color);

    allTrains.select('.train-window')
      .attr('cx', 15)
      .attr('cy', 8);

    allTrains.select('.train-name')
      .attr('x', 15)
      .attr('y', -8)
      .text(d => d.name);
  }

  private getTrainPosition(train: Train): { x: number; y: number } {
    if (train.currentStationId) {
      const station = this.getStationById(train.currentStationId);
      if (station) {
        return { x: station.x, y: station.y - 30 };
      }
    }

    if (train.currentBlockSectionId) {
      const block = this.getBlockById(train.currentBlockSectionId);
      if (block) {
        const fromStation = this.getStationById(block.fromStationId);
        const toStation = this.getStationById(block.toStationId);

        if (fromStation && toStation) {
          const progress = train.direction === 'forward'
            ? train.progress / block.length
            : 1 - (train.progress / block.length);

          const x = fromStation.x + (toStation.x - fromStation.x) * progress;
          const y = fromStation.y + (toStation.y - fromStation.y) * progress;

          return { x, y: y - 20 };
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
