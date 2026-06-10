import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';
import {
  Station,
  BlockSection,
  Signal,
  TrainSchedule,
  Switch,
  Route,
} from '../../models/railway.model';
import { RailwayDataService } from '../../services/railway-data.service';
import { RouteControlService } from '../../services/route-control.service';

@Component({
  selector: 'app-config-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatFormFieldModule,
    FormsModule,
    MatDividerModule,
  ],
  templateUrl: './config-panel.component.html',
  styleUrls: ['./config-panel.component.scss'],
})
export class ConfigPanelComponent implements OnInit, OnDestroy {
  stations: Station[] = [];
  blockSections: BlockSection[] = [];
  signals: Signal[] = [];
  schedules: TrainSchedule[] = [];
  switches: Switch[] = [];
  routes: Route[] = [];

  newStationName = '';
  newBlockName = '';
  newBlockFrom = '';
  newBlockTo = '';
  newBlockLength = 200;

  newSwitchName = '';
  newSwitchStation = '';
  newSwitchCommonBlock = '';
  newSwitchNormalBlock = '';
  newSwitchReverseBlock = '';

  newRouteName = '';
  newRouteStartSignal = '';
  newRouteEndSignal = '';
  newRouteDirection: 'forward' | 'backward' = 'forward';

  newScheduleName = '';
  newScheduleStartStation = '';
  newScheduleEndStation = '';
  newScheduleDirection: 'forward' | 'backward' = 'forward';
  newScheduleSpeed = 50;
  newScheduleStartTime = 0;
  newScheduleColor = '#2196f3';

  private subscriptions: Subscription[] = [];

  constructor(
    private railwayDataService: RailwayDataService,
    private routeControlService: RouteControlService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.railwayDataService.stations$.subscribe(stations => {
        this.stations = stations;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.blockSections$.subscribe(blocks => {
        this.blockSections = blocks;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.signals$.subscribe(signals => {
        this.signals = signals;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.schedules$.subscribe(schedules => {
        this.schedules = schedules;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.switches$.subscribe(switches => {
        this.switches = switches;
      })
    );

    this.subscriptions.push(
      this.routeControlService.routes$.subscribe(routes => {
        this.routes = routes;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  addStation(): void {
    if (!this.newStationName.trim()) return;

    const stationCount = this.stations.length;
    const x = 100 + stationCount * 200;
    const y = 200;

    this.railwayDataService.addStation({
      name: this.newStationName.trim(),
      x,
      y,
    });

    this.newStationName = '';
  }

  removeStation(stationId: string): void {
    this.railwayDataService.removeStation(stationId);
  }

  addBlockSection(): void {
    if (!this.newBlockName.trim() || !this.newBlockFrom || !this.newBlockTo) return;
    if (this.newBlockFrom === this.newBlockTo) return;

    const newBlock = this.railwayDataService.addBlockSection({
      name: this.newBlockName.trim(),
      fromStationId: this.newBlockFrom,
      toStationId: this.newBlockTo,
      length: this.newBlockLength,
    });

    const fromStation = this.stations.find(s => s.id === this.newBlockFrom);
    const toStation = this.stations.find(s => s.id === this.newBlockTo);

    if (fromStation && toStation) {
      const entrySignalX = toStation.x - 30;
      const entrySignalY = toStation.y - 30;

      this.railwayDataService.addSignal({
        name: `${toStation.name}进站信号`,
        stationId: this.newBlockTo,
        blockSectionId: newBlock.id,
        position: 'entry',
        signalType: 'home',
        x: entrySignalX,
        y: entrySignalY,
      });

      const exitSignalX = fromStation.x + 30;
      const exitSignalY = fromStation.y - 30;

      this.railwayDataService.addSignal({
        name: `${fromStation.name}出站信号`,
        stationId: this.newBlockFrom,
        blockSectionId: newBlock.id,
        position: 'exit',
        signalType: 'starting',
        x: exitSignalX,
        y: exitSignalY,
      });
    }

    this.newBlockName = '';
    this.newBlockFrom = '';
    this.newBlockTo = '';
    this.newBlockLength = 200;
  }

  removeBlockSection(blockId: string): void {
    this.routeControlService.removeRoutesByBlockSection(blockId);
    this.railwayDataService.removeBlockSection(blockId);
  }

  addSwitch(): void {
    if (
      !this.newSwitchName.trim() ||
      !this.newSwitchStation ||
      !this.newSwitchCommonBlock ||
      !this.newSwitchNormalBlock ||
      !this.newSwitchReverseBlock
    ) {
      return;
    }

    const station = this.stations.find(s => s.id === this.newSwitchStation);
    if (!station) return;

    this.railwayDataService.addSwitch({
      name: this.newSwitchName.trim(),
      stationId: this.newSwitchStation,
      x: station.x + 30,
      y: station.y - 50,
      normalBlockId: this.newSwitchNormalBlock,
      reverseBlockId: this.newSwitchReverseBlock,
      commonBlockId: this.newSwitchCommonBlock,
    });

    this.newSwitchName = '';
    this.newSwitchStation = '';
    this.newSwitchCommonBlock = '';
    this.newSwitchNormalBlock = '';
    this.newSwitchReverseBlock = '';
  }

  removeSwitch(switchId: string): void {
    this.railwayDataService.removeSwitch(switchId);
  }

  addRoute(): void {
    if (
      !this.newRouteName.trim() ||
      !this.newRouteStartSignal ||
      !this.newRouteEndSignal
    ) {
      return;
    }

    const startSignal = this.signals.find(s => s.id === this.newRouteStartSignal);
    const endSignal = this.signals.find(s => s.id === this.newRouteEndSignal);

    if (!startSignal || !endSignal) return;

    const fromStationId = this.newRouteDirection === 'forward' 
      ? startSignal.stationId 
      : endSignal.stationId;
    const toStationId = this.newRouteDirection === 'forward'
      ? endSignal.stationId
      : startSignal.stationId;

    const path = this.railwayDataService.findPath(
      fromStationId,
      toStationId
    );

    if (!path) return;

    this.routeControlService.addRoute({
      name: this.newRouteName.trim(),
      startSignalId: this.newRouteDirection === 'forward' 
        ? this.newRouteStartSignal 
        : this.newRouteEndSignal,
      endSignalId: this.newRouteDirection === 'forward'
        ? this.newRouteEndSignal
        : this.newRouteStartSignal,
      blockSectionIds: path.blocks,
      switchIds: path.switches.map(s => s.switchId),
      switchPositions: path.switches,
      direction: this.newRouteDirection,
    });

    this.newRouteName = '';
    this.newRouteStartSignal = '';
    this.newRouteEndSignal = '';
    this.newRouteDirection = 'forward';
  }

  removeRoute(routeId: string): void {
    this.routeControlService.removeRoute(routeId);
  }

  addSchedule(): void {
    if (
      !this.newScheduleName.trim() ||
      !this.newScheduleStartStation ||
      !this.newScheduleEndStation
    )
      return;

    this.railwayDataService.addSchedule({
      name: this.newScheduleName.trim(),
      startTime: this.newScheduleStartTime,
      startStationId: this.newScheduleStartStation,
      endStationId: this.newScheduleEndStation,
      direction: this.newScheduleDirection,
      speed: this.newScheduleSpeed,
      color: this.newScheduleColor,
    });

    this.newScheduleName = '';
    this.newScheduleStartStation = '';
    this.newScheduleEndStation = '';
    this.newScheduleDirection = 'forward';
    this.newScheduleSpeed = 50;
    this.newScheduleStartTime = 0;
    this.newScheduleColor = this.getRandomColor();
  }

  removeSchedule(trainId: string): void {
    this.railwayDataService.removeSchedule(trainId);
  }

  getStationName(stationId: string): string {
    const station = this.stations.find(s => s.id === stationId);
    return station ? station.name : stationId;
  }

  getBlockName(blockId: string): string {
    const block = this.blockSections.find(b => b.id === blockId);
    return block ? block.name : blockId;
  }

  getSignalName(signalId: string): string {
    const signal = this.signals.find(s => s.id === signalId);
    return signal ? signal.name : signalId;
  }

  getSignalsForStation(stationId: string): Signal[] {
    return this.signals.filter(s => s.stationId === stationId);
  }

  getBlocksForStation(stationId: string): BlockSection[] {
    return this.blockSections.filter(
      b => b.fromStationId === stationId || b.toStationId === stationId
    );
  }

  private getRandomColor(): string {
    const colors = [
      '#f44336',
      '#e91e63',
      '#9c27b0',
      '#673ab7',
      '#3f51b5',
      '#2196f3',
      '#00bcd4',
      '#4caf50',
      '#ff9800',
      '#795548',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
