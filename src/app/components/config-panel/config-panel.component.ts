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
import { Station, BlockSection, Signal, TrainSchedule } from '../../models/railway.model';
import { RailwayDataService } from '../../services/railway-data.service';

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

  newStationName = '';
  newBlockName = '';
  newBlockFrom = '';
  newBlockTo = '';
  newBlockLength = 200;

  newScheduleName = '';
  newScheduleStartStation = '';
  newScheduleEndStation = '';
  newScheduleDirection: 'forward' | 'backward' = 'forward';
  newScheduleSpeed = 50;
  newScheduleStartTime = 0;
  newScheduleColor = '#2196f3';

  private subscriptions: Subscription[] = [];

  constructor(private railwayDataService: RailwayDataService) {}

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
      const signalX = fromStation.x + 30;
      const signalY = fromStation.y - 30;

      this.railwayDataService.addSignal({
        name: `${fromStation.name}→${toStation.name} 入口信号`,
        stationId: this.newBlockFrom,
        blockSectionId: newBlock.id,
        position: 'entry',
        x: signalX,
        y: signalY,
      });
    }

    this.newBlockName = '';
    this.newBlockFrom = '';
    this.newBlockTo = '';
    this.newBlockLength = 200;
  }

  removeBlockSection(blockId: string): void {
    this.railwayDataService.removeBlockSection(blockId);
  }

  addSchedule(): void {
    if (!this.newScheduleName.trim() || !this.newScheduleStartStation || !this.newScheduleEndStation) return;

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

  getSignalForBlock(blockId: string): Signal | undefined {
    return this.signals.find(s => s.blockSectionId === blockId && s.position === 'entry');
  }

  private getRandomColor(): string {
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#4caf50', '#ff9800', '#795548'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
