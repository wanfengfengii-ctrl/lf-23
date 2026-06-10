import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Station, BlockSection, Signal, Train, TrainSchedule } from '../models/railway.model';

@Injectable({
  providedIn: 'root'
})
export class RailwayDataService {
  private stationsSubject = new BehaviorSubject<Station[]>([]);
  private blockSectionsSubject = new BehaviorSubject<BlockSection[]>([]);
  private signalsSubject = new BehaviorSubject<Signal[]>([]);
  private trainsSubject = new BehaviorSubject<Train[]>([]);
  private schedulesSubject = new BehaviorSubject<TrainSchedule[]>([]);

  stations$: Observable<Station[]> = this.stationsSubject.asObservable();
  blockSections$: Observable<BlockSection[]> = this.blockSectionsSubject.asObservable();
  signals$: Observable<Signal[]> = this.signalsSubject.asObservable();
  trains$: Observable<Train[]> = this.trainsSubject.asObservable();
  schedules$: Observable<TrainSchedule[]> = this.schedulesSubject.asObservable();

  private nextStationId = 1;
  private nextBlockId = 1;
  private nextSignalId = 1;
  private nextTrainId = 1;

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData(): void {
    const stationA: Station = { id: 'S1', name: 'A站', x: 100, y: 200 };
    const stationB: Station = { id: 'S2', name: 'B站', x: 350, y: 200 };
    const stationC: Station = { id: 'S3', name: 'C站', x: 600, y: 200 };
    const stationD: Station = { id: 'S4', name: 'D站', x: 850, y: 200 };

    const blockAB: BlockSection = {
      id: 'B1',
      name: 'A-B区间',
      fromStationId: 'S1',
      toStationId: 'S2',
      length: 250,
      isOccupied: false
    };

    const blockBC: BlockSection = {
      id: 'B2',
      name: 'B-C区间',
      fromStationId: 'S2',
      toStationId: 'S3',
      length: 250,
      isOccupied: false
    };

    const blockCD: BlockSection = {
      id: 'B3',
      name: 'C-D区间',
      fromStationId: 'S3',
      toStationId: 'S4',
      length: 250,
      isOccupied: false
    };

    const signalAEntry: Signal = {
      id: 'sig1',
      name: 'A进站信号',
      stationId: 'S1',
      blockSectionId: 'B1',
      position: 'entry',
      state: 'stop',
      x: 130,
      y: 170
    };

    const signalBEntry: Signal = {
      id: 'sig2',
      name: 'B进站信号',
      stationId: 'S2',
      blockSectionId: 'B2',
      position: 'entry',
      state: 'stop',
      x: 380,
      y: 170
    };

    const signalCEntry: Signal = {
      id: 'sig3',
      name: 'C进站信号',
      stationId: 'S3',
      blockSectionId: 'B3',
      position: 'entry',
      state: 'stop',
      x: 630,
      y: 170
    };

    blockAB.entrySignalId = 'sig1';
    blockBC.entrySignalId = 'sig2';
    blockCD.entrySignalId = 'sig3';

    const schedule1: TrainSchedule = {
      trainId: 'T1',
      startTime: 2,
      startStationId: 'S1',
      endStationId: 'S4',
      direction: 'forward',
      speed: 50,
      color: '#2196f3',
      name: '列车1号'
    };

    const schedule2: TrainSchedule = {
      trainId: 'T2',
      startTime: 10,
      startStationId: 'S4',
      endStationId: 'S1',
      direction: 'backward',
      speed: 45,
      color: '#ff9800',
      name: '列车2号'
    };

    this.stationsSubject.next([stationA, stationB, stationC, stationD]);
    this.blockSectionsSubject.next([blockAB, blockBC, blockCD]);
    this.signalsSubject.next([signalAEntry, signalBEntry, signalCEntry]);
    this.trainsSubject.next([]);
    this.schedulesSubject.next([schedule1, schedule2]);

    this.nextStationId = 5;
    this.nextBlockId = 4;
    this.nextSignalId = 4;
    this.nextTrainId = 3;
  }

  getStations(): Station[] {
    return this.stationsSubject.value;
  }

  getBlockSections(): BlockSection[] {
    return this.blockSectionsSubject.value;
  }

  getSignals(): Signal[] {
    return this.signalsSubject.value;
  }

  getTrains(): Train[] {
    return this.trainsSubject.value;
  }

  getSchedules(): TrainSchedule[] {
    return this.schedulesSubject.value;
  }

  addStation(station: Omit<Station, 'id'>): Station {
    const newStation: Station = {
      ...station,
      id: `S${this.nextStationId++}`
    };
    const stations = [...this.stationsSubject.value, newStation];
    this.stationsSubject.next(stations);
    return newStation;
  }

  updateStation(station: Station): void {
    const stations = this.stationsSubject.value.map(s =>
      s.id === station.id ? station : s
    );
    this.stationsSubject.next(stations);
  }

  removeStation(stationId: string): void {
    const stations = this.stationsSubject.value.filter(s => s.id !== stationId);
    this.stationsSubject.next(stations);

    const relatedBlocks = this.blockSectionsSubject.value.filter(
      b => b.fromStationId === stationId || b.toStationId === stationId
    );

    const relatedBlockIds = new Set(relatedBlocks.map(b => b.id));

    const signals = this.signalsSubject.value.filter(
      s => !relatedBlockIds.has(s.blockSectionId)
    );
    this.signalsSubject.next(signals);

    const blocks = this.blockSectionsSubject.value.filter(
      b => b.fromStationId !== stationId && b.toStationId !== stationId
    );
    this.blockSectionsSubject.next(blocks);
  }

  addBlockSection(block: Omit<BlockSection, 'id' | 'isOccupied'>): BlockSection {
    const newBlock: BlockSection = {
      ...block,
      id: `B${this.nextBlockId++}`,
      isOccupied: false
    };
    const blocks = [...this.blockSectionsSubject.value, newBlock];
    this.blockSectionsSubject.next(blocks);
    return newBlock;
  }

  updateBlockSection(block: BlockSection): void {
    const blocks = this.blockSectionsSubject.value.map(b =>
      b.id === block.id ? block : b
    );
    this.blockSectionsSubject.next(blocks);
  }

  removeBlockSection(blockId: string): void {
    const blocks = this.blockSectionsSubject.value.filter(b => b.id !== blockId);
    this.blockSectionsSubject.next(blocks);

    const signals = this.signalsSubject.value.filter(s => s.blockSectionId !== blockId);
    this.signalsSubject.next(signals);
  }

  addSignal(signal: Omit<Signal, 'id' | 'state'>): Signal {
    const newSignal: Signal = {
      ...signal,
      id: `sig${this.nextSignalId++}`,
      state: 'stop'
    };
    const signals = [...this.signalsSubject.value, newSignal];
    this.signalsSubject.next(signals);

    const blocks = this.blockSectionsSubject.value.map(b => {
      if (b.id === signal.blockSectionId) {
        if (signal.position === 'entry') {
          return { ...b, entrySignalId: newSignal.id };
        } else {
          return { ...b, exitSignalId: newSignal.id };
        }
      }
      return b;
    });
    this.blockSectionsSubject.next(blocks);

    return newSignal;
  }

  updateSignal(signal: Signal): void {
    const signals = this.signalsSubject.value.map(s =>
      s.id === signal.id ? signal : s
    );
    this.signalsSubject.next(signals);
  }

  removeSignal(signalId: string): void {
    const signal = this.signalsSubject.value.find(s => s.id === signalId);
    if (signal) {
      const signals = this.signalsSubject.value.filter(s => s.id !== signalId);
      this.signalsSubject.next(signals);

      const blocks = this.blockSectionsSubject.value.map(b => {
        if (b.id === signal.blockSectionId) {
          if (signal.position === 'entry') {
            return { ...b, entrySignalId: undefined };
          } else {
            return { ...b, exitSignalId: undefined };
          }
        }
        return b;
      });
      this.blockSectionsSubject.next(blocks);
    }
  }

  addTrain(train: Omit<Train, 'id'>): Train {
    const newTrain: Train = {
      ...train,
      id: `T${this.nextTrainId++}`
    };
    const trains = [...this.trainsSubject.value, newTrain];
    this.trainsSubject.next(trains);
    return newTrain;
  }

  updateTrain(train: Train): void {
    const trains = this.trainsSubject.value.map(t =>
      t.id === train.id ? train : t
    );
    this.trainsSubject.next(trains);
  }

  removeTrain(trainId: string): void {
    const trains = this.trainsSubject.value.filter(t => t.id !== trainId);
    this.trainsSubject.next(trains);
  }

  addSchedule(schedule: Omit<TrainSchedule, 'trainId'>): TrainSchedule {
    const newSchedule: TrainSchedule = {
      ...schedule,
      trainId: `T${this.nextTrainId++}`
    };
    const schedules = [...this.schedulesSubject.value, newSchedule];
    this.schedulesSubject.next(schedules);
    return newSchedule;
  }

  updateSchedule(schedule: TrainSchedule): void {
    const schedules = this.schedulesSubject.value.map(s =>
      s.trainId === schedule.trainId ? schedule : s
    );
    this.schedulesSubject.next(schedules);
  }

  removeSchedule(trainId: string): void {
    const schedules = this.schedulesSubject.value.filter(s => s.trainId !== trainId);
    this.schedulesSubject.next(schedules);
  }

  resetAll(): void {
    const blocks = this.blockSectionsSubject.value.map(b => ({
      ...b,
      isOccupied: false,
      occupiedByTrainId: undefined
    }));
    this.blockSectionsSubject.next(blocks);

    const signals = this.signalsSubject.value.map(s => ({
      ...s,
      state: 'stop' as const
    }));
    this.signalsSubject.next(signals);

    this.trainsSubject.next([]);
  }

  setTrains(trains: Train[]): void {
    this.trainsSubject.next(trains);
  }

  setBlockSections(blocks: BlockSection[]): void {
    this.blockSectionsSubject.next(blocks);
  }

  setSignals(signals: Signal[]): void {
    this.signalsSubject.next(signals);
  }

  addTrainWithId(train: Train): Train {
    const existingIndex = this.trainsSubject.value.findIndex(t => t.id === train.id);
    if (existingIndex >= 0) {
      const trains = [...this.trainsSubject.value];
      trains[existingIndex] = train;
      this.trainsSubject.next(trains);
    } else {
      const trains = [...this.trainsSubject.value, train];
      this.trainsSubject.next(trains);
    }
    return train;
  }

  getBlockSectionById(blockId: string): BlockSection | undefined {
    return this.blockSectionsSubject.value.find(b => b.id === blockId);
  }

  getStationById(stationId: string): Station | undefined {
    return this.stationsSubject.value.find(s => s.id === stationId);
  }

  getSignalById(signalId: string): Signal | undefined {
    return this.signalsSubject.value.find(s => s.id === signalId);
  }

  getTrainById(trainId: string): Train | undefined {
    return this.trainsSubject.value.find(t => t.id === trainId);
  }

  getBlocksForStation(stationId: string): BlockSection[] {
    return this.blockSectionsSubject.value.filter(
      b => b.fromStationId === stationId || b.toStationId === stationId
    );
  }

  getNextBlockSection(currentStationId: string, direction: 'forward' | 'backward'): BlockSection | undefined {
    const blocks = this.blockSectionsSubject.value;
    if (direction === 'forward') {
      return blocks.find(b => b.fromStationId === currentStationId);
    } else {
      return blocks.find(b => b.toStationId === currentStationId);
    }
  }

  areStationsConnected(fromId: string, toId: string): boolean {
    const blocks = this.blockSectionsSubject.value;
    return blocks.some(
      b => (b.fromStationId === fromId && b.toStationId === toId) ||
           (b.fromStationId === toId && b.toStationId === fromId)
    );
  }
}
