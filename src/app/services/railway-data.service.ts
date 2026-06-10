import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Station,
  BlockSection,
  Signal,
  Train,
  TrainSchedule,
  Switch,
  SwitchPosition,
  Route,
} from '../models/railway.model';

@Injectable({
  providedIn: 'root',
})
export class RailwayDataService {
  private stationsSubject = new BehaviorSubject<Station[]>([]);
  private blockSectionsSubject = new BehaviorSubject<BlockSection[]>([]);
  private signalsSubject = new BehaviorSubject<Signal[]>([]);
  private trainsSubject = new BehaviorSubject<Train[]>([]);
  private schedulesSubject = new BehaviorSubject<TrainSchedule[]>([]);
  private switchesSubject = new BehaviorSubject<Switch[]>([]);

  stations$: Observable<Station[]> = this.stationsSubject.asObservable();
  blockSections$: Observable<BlockSection[]> = this.blockSectionsSubject.asObservable();
  signals$: Observable<Signal[]> = this.signalsSubject.asObservable();
  trains$: Observable<Train[]> = this.trainsSubject.asObservable();
  schedules$: Observable<TrainSchedule[]> = this.schedulesSubject.asObservable();
  switches$: Observable<Switch[]> = this.switchesSubject.asObservable();

  private nextStationId = 1;
  private nextBlockId = 1;
  private nextSignalId = 1;
  private nextTrainId = 1;
  private nextSwitchId = 1;

  constructor() {
    this.initializeDefaultData();
  }

  private initializeDefaultData(): void {
    const stationA: Station = { id: 'S1', name: 'A站', x: 100, y: 250 };
    const stationB: Station = { id: 'S2', name: 'B站', x: 400, y: 250 };
    const stationC: Station = { id: 'S3', name: 'C站', x: 700, y: 250 };
    const stationD: Station = { id: 'S4', name: 'D站', x: 1000, y: 250 };
    const stationE: Station = { id: 'S5', name: 'E站(支线)', x: 550, y: 100 };

    const blockAB: BlockSection = {
      id: 'B1',
      name: 'A-B区间',
      fromStationId: 'S1',
      toStationId: 'S2',
      length: 300,
      isOccupied: false,
      isRouteLocked: false,
    };

    const blockBC_Main: BlockSection = {
      id: 'B2',
      name: 'B-C主线',
      fromStationId: 'S2',
      toStationId: 'S3',
      length: 300,
      isOccupied: false,
      isRouteLocked: false,
    };

    const blockBC_Spur: BlockSection = {
      id: 'B3',
      name: 'B-E支线',
      fromStationId: 'S2',
      toStationId: 'S5',
      length: 200,
      isOccupied: false,
      isRouteLocked: false,
    };

    const blockCD: BlockSection = {
      id: 'B4',
      name: 'C-D区间',
      fromStationId: 'S3',
      toStationId: 'S4',
      length: 300,
      isOccupied: false,
      isRouteLocked: false,
    };

    const blockCE: BlockSection = {
      id: 'B5',
      name: 'C-E联络线',
      fromStationId: 'S3',
      toStationId: 'S5',
      length: 200,
      isOccupied: false,
      isRouteLocked: false,
    };

    const signalA_Exit: Signal = {
      id: 'sig1',
      name: 'A出站信号',
      stationId: 'S1',
      blockSectionId: 'B1',
      position: 'exit',
      signalType: 'starting',
      state: 'stop',
      isManualMode: false,
      x: 150,
      y: 220,
    };

    const signalB_Entry: Signal = {
      id: 'sig2',
      name: 'B进站信号',
      stationId: 'S2',
      blockSectionId: 'B1',
      position: 'entry',
      signalType: 'home',
      state: 'stop',
      isManualMode: false,
      x: 350,
      y: 220,
    };

    const signalB_Exit_Main: Signal = {
      id: 'sig3',
      name: 'B出站(主线)',
      stationId: 'S2',
      blockSectionId: 'B2',
      position: 'exit',
      signalType: 'starting',
      state: 'stop',
      isManualMode: false,
      x: 450,
      y: 220,
    };

    const signalB_Exit_Spur: Signal = {
      id: 'sig4',
      name: 'B出站(支线)',
      stationId: 'S2',
      blockSectionId: 'B3',
      position: 'exit',
      signalType: 'starting',
      state: 'stop',
      isManualMode: false,
      x: 430,
      y: 150,
    };

    const signalC_Entry: Signal = {
      id: 'sig5',
      name: 'C进站信号',
      stationId: 'S3',
      blockSectionId: 'B2',
      position: 'entry',
      signalType: 'home',
      state: 'stop',
      isManualMode: false,
      x: 650,
      y: 220,
    };

    const signalC_Exit: Signal = {
      id: 'sig6',
      name: 'C出站信号',
      stationId: 'S3',
      blockSectionId: 'B4',
      position: 'exit',
      signalType: 'starting',
      state: 'stop',
      isManualMode: false,
      x: 750,
      y: 220,
    };

    const signalD_Entry: Signal = {
      id: 'sig7',
      name: 'D进站信号',
      stationId: 'S4',
      blockSectionId: 'B4',
      position: 'entry',
      signalType: 'home',
      state: 'stop',
      isManualMode: false,
      x: 950,
      y: 220,
    };

    const signalE_Entry: Signal = {
      id: 'sig8',
      name: 'E进站信号',
      stationId: 'S5',
      blockSectionId: 'B3',
      position: 'entry',
      signalType: 'home',
      state: 'stop',
      isManualMode: false,
      x: 520,
      y: 130,
    };

    blockAB.exitSignalId = 'sig1';
    blockAB.entrySignalId = 'sig2';
    blockBC_Main.exitSignalId = 'sig3';
    blockBC_Main.entrySignalId = 'sig5';
    blockBC_Spur.exitSignalId = 'sig4';
    blockBC_Spur.entrySignalId = 'sig8';
    blockCD.exitSignalId = 'sig6';
    blockCD.entrySignalId = 'sig7';

    const switchB: Switch = {
      id: 'SW1',
      name: 'B道岔',
      stationId: 'S2',
      x: 430,
      y: 200,
      position: 'normal',
      normalBlockId: 'B2',
      reverseBlockId: 'B3',
      commonBlockId: 'B1',
      isLocked: false,
    };

    const switchC: Switch = {
      id: 'SW2',
      name: 'C道岔',
      stationId: 'S3',
      x: 670,
      y: 200,
      position: 'normal',
      normalBlockId: 'B4',
      reverseBlockId: 'B5',
      commonBlockId: 'B2',
      isLocked: false,
    };

    const schedule1: TrainSchedule = {
      trainId: 'T1',
      startTime: 2,
      startStationId: 'S1',
      endStationId: 'S4',
      direction: 'forward',
      speed: 50,
      color: '#2196f3',
      name: '列车1号(主线)',
      routeStations: ['S1', 'S2', 'S3', 'S4'],
    };

    const schedule2: TrainSchedule = {
      trainId: 'T2',
      startTime: 8,
      startStationId: 'S4',
      endStationId: 'S5',
      direction: 'backward',
      speed: 45,
      color: '#ff9800',
      name: '列车2号(支线)',
      routeStations: ['S4', 'S3', 'S5'],
    };

    const schedule3: TrainSchedule = {
      trainId: 'T3',
      startTime: 15,
      startStationId: 'S1',
      endStationId: 'S5',
      direction: 'forward',
      speed: 40,
      color: '#9c27b0',
      name: '列车3号(直达支线)',
      routeStations: ['S1', 'S2', 'S5'],
    };

    this.stationsSubject.next([stationA, stationB, stationC, stationD, stationE]);
    this.blockSectionsSubject.next([blockAB, blockBC_Main, blockBC_Spur, blockCD, blockCE]);
    this.signalsSubject.next([
      signalA_Exit,
      signalB_Entry,
      signalB_Exit_Main,
      signalB_Exit_Spur,
      signalC_Entry,
      signalC_Exit,
      signalD_Entry,
      signalE_Entry,
    ]);
    this.switchesSubject.next([switchB, switchC]);
    this.trainsSubject.next([]);
    this.schedulesSubject.next([schedule1, schedule2, schedule3]);

    this.nextStationId = 6;
    this.nextBlockId = 6;
    this.nextSignalId = 9;
    this.nextTrainId = 4;
    this.nextSwitchId = 3;
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

  getSwitches(): Switch[] {
    return this.switchesSubject.value;
  }

  addStation(station: Omit<Station, 'id'>): Station {
    const newStation: Station = {
      ...station,
      id: `S${this.nextStationId++}`,
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

    const switches = this.switchesSubject.value.filter(
      sw => sw.stationId !== stationId
    );
    this.switchesSubject.next(switches);

    const schedules = this.schedulesSubject.value.filter(
      s => s.startStationId !== stationId && s.endStationId !== stationId
    );
    this.schedulesSubject.next(schedules);

    const trains = this.trainsSubject.value.filter(
      t => t.currentStationId !== stationId
    );
    this.trainsSubject.next(trains);
  }

  addBlockSection(block: Omit<BlockSection, 'id' | 'isOccupied' | 'isRouteLocked'>): BlockSection {
    const newBlock: BlockSection = {
      ...block,
      id: `B${this.nextBlockId++}`,
      isOccupied: false,
      isRouteLocked: false,
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

    const switches = this.switchesSubject.value.filter(
      sw => sw.normalBlockId !== blockId && sw.reverseBlockId !== blockId && sw.commonBlockId !== blockId
    );
    this.switchesSubject.next(switches);
  }

  addSignal(signal: Omit<Signal, 'id' | 'state' | 'isManualMode'>): Signal {
    const newSignal: Signal = {
      ...signal,
      id: `sig${this.nextSignalId++}`,
      state: 'stop',
      isManualMode: false,
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

  addSwitch(sw: Omit<Switch, 'id' | 'isLocked' | 'position'> & { position?: SwitchPosition }): Switch {
    const newSwitch: Switch = {
      ...sw,
      id: `SW${this.nextSwitchId++}`,
      position: sw.position || 'normal',
      isLocked: false,
    };
    const switches = [...this.switchesSubject.value, newSwitch];
    this.switchesSubject.next(switches);
    return newSwitch;
  }

  updateSwitch(sw: Switch): void {
    const switches = this.switchesSubject.value.map(s =>
      s.id === sw.id ? sw : s
    );
    this.switchesSubject.next(switches);
  }

  removeSwitch(switchId: string): void {
    const switches = this.switchesSubject.value.filter(s => s.id !== switchId);
    this.switchesSubject.next(switches);
  }

  setSwitches(switches: Switch[]): void {
    this.switchesSubject.next(switches);
  }

  addTrain(train: Omit<Train, 'id'>): Train {
    const newTrain: Train = {
      ...train,
      id: `T${this.nextTrainId++}`,
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
      trainId: `T${this.nextTrainId++}`,
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
      occupiedByTrainId: undefined,
      isRouteLocked: false,
      lockedByRouteId: undefined,
    }));
    this.blockSectionsSubject.next(blocks);

    const signals = this.signalsSubject.value.map(s => ({
      ...s,
      state: 'stop' as const,
      isManualMode: false,
    }));
    this.signalsSubject.next(signals);

    const switches = this.switchesSubject.value.map(sw => ({
      ...sw,
      isLocked: false,
      lockedByRouteId: undefined,
      position: 'normal' as SwitchPosition,
    }));
    this.switchesSubject.next(switches);

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

  getSwitchById(switchId: string): Switch | undefined {
    return this.switchesSubject.value.find(sw => sw.id === switchId);
  }

  getBlocksForStation(stationId: string): BlockSection[] {
    return this.blockSectionsSubject.value.filter(
      b => b.fromStationId === stationId || b.toStationId === stationId
    );
  }

  getSwitchesForStation(stationId: string): Switch[] {
    return this.switchesSubject.value.filter(sw => sw.stationId === stationId);
  }

  getNextBlockSection(
    currentStationId: string,
    direction: 'forward' | 'backward',
    viaSwitchPosition?: SwitchPosition
  ): BlockSection | undefined {
    const blocks = this.blockSectionsSubject.value;
    const switches = this.switchesSubject.value;

    const stationSwitches = switches.filter(sw => sw.stationId === currentStationId);

    if (direction === 'forward') {
      const forwardBlocks = blocks.filter(b => b.fromStationId === currentStationId);

      if (stationSwitches.length > 0) {
        const sw = stationSwitches[0];
        const targetBlockId = viaSwitchPosition
          ? viaSwitchPosition === 'normal' ? sw.normalBlockId : sw.reverseBlockId
          : sw.position === 'normal' ? sw.normalBlockId : sw.reverseBlockId;
        return forwardBlocks.find(b => b.id === targetBlockId);
      }

      return forwardBlocks[0];
    } else {
      const backwardBlocks = blocks.filter(b => b.toStationId === currentStationId);

      if (stationSwitches.length > 0) {
        const sw = stationSwitches[0];
        const targetBlockId = viaSwitchPosition
          ? viaSwitchPosition === 'normal' ? sw.normalBlockId : sw.reverseBlockId
          : sw.position === 'normal' ? sw.normalBlockId : sw.reverseBlockId;
        return backwardBlocks.find(b => b.id === targetBlockId);
      }

      return backwardBlocks[0];
    }
  }

  areStationsConnected(fromId: string, toId: string): boolean {
    const blocks = this.blockSectionsSubject.value;
    return blocks.some(
      b =>
        (b.fromStationId === fromId && b.toStationId === toId) ||
        (b.fromStationId === toId && b.toStationId === fromId)
    );
  }

  findPath(
    fromStationId: string,
    toStationId: string,
    routeStations?: string[]
  ): { blocks: string[]; switches: { switchId: string; position: SwitchPosition }[] } | null {
    if (routeStations && routeStations.length >= 2) {
      return this.buildPathFromRouteStations(routeStations);
    }

    return this.findPathBFS(fromStationId, toStationId);
  }

  private buildPathFromRouteStations(
    routeStations: string[]
  ): { blocks: string[]; switches: { switchId: string; position: SwitchPosition }[] } | null {
    const blocks: string[] = [];
    const switches: { switchId: string; position: SwitchPosition }[] = [];
    const allBlocks = this.blockSectionsSubject.value;
    const allSwitches = this.switchesSubject.value;

    for (let i = 0; i < routeStations.length - 1; i++) {
      const fromId = routeStations[i];
      const toId = routeStations[i + 1];

      const connectingBlock = allBlocks.find(
        b =>
          (b.fromStationId === fromId && b.toStationId === toId) ||
          (b.fromStationId === toId && b.toStationId === fromId)
      );

      if (!connectingBlock) {
        return null;
      }

      blocks.push(connectingBlock.id);

      const fromSwitches = allSwitches.filter(sw => sw.stationId === fromId);
      for (const sw of fromSwitches) {
        let position: SwitchPosition | null = null;
        if (sw.normalBlockId === connectingBlock.id) {
          position = 'normal';
        } else if (sw.reverseBlockId === connectingBlock.id) {
          position = 'reverse';
        }
        if (position) {
          if (!switches.some(s => s.switchId === sw.id)) {
            switches.push({ switchId: sw.id, position });
          }
        }
      }

      const toSwitches = allSwitches.filter(sw => sw.stationId === toId);
      for (const sw of toSwitches) {
        let position: SwitchPosition | null = null;
        if (sw.normalBlockId === connectingBlock.id) {
          position = 'normal';
        } else if (sw.reverseBlockId === connectingBlock.id) {
          position = 'reverse';
        }
        if (position) {
          if (!switches.some(s => s.switchId === sw.id)) {
            switches.push({ switchId: sw.id, position });
          }
        }
      }
    }

    return { blocks, switches };
  }

  private findPathBFS(
    fromStationId: string,
    toStationId: string
  ): { blocks: string[]; switches: { switchId: string; position: SwitchPosition }[] } | null {
    const blocks = this.blockSectionsSubject.value;
    const switches = this.switchesSubject.value;

    const queue: { stationId: string; path: string[]; switchOps: { switchId: string; position: SwitchPosition }[] }[] = [
      { stationId: fromStationId, path: [], switchOps: [] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.stationId === toStationId) {
        return { blocks: current.path, switches: current.switchOps };
      }

      if (visited.has(current.stationId)) continue;
      visited.add(current.stationId);

      const outgoingBlocks = blocks.filter(b => b.fromStationId === current.stationId);
      const incomingBlocks = blocks.filter(b => b.toStationId === current.stationId);

      for (const block of outgoingBlocks) {
        const nextStation = block.toStationId;
        if (!visited.has(nextStation)) {
          const stationSwitches = switches.filter(sw => sw.stationId === current.stationId);
          const newSwitchOps = [...current.switchOps];

          for (const sw of stationSwitches) {
            let position: SwitchPosition | null = null;
            if (sw.normalBlockId === block.id) {
              position = 'normal';
            } else if (sw.reverseBlockId === block.id) {
              position = 'reverse';
            }
            if (position && !newSwitchOps.some(s => s.switchId === sw.id)) {
              newSwitchOps.push({ switchId: sw.id, position });
            }
          }

          queue.push({
            stationId: nextStation,
            path: [...current.path, block.id],
            switchOps: newSwitchOps,
          });
        }
      }

      for (const block of incomingBlocks) {
        const prevStation = block.fromStationId;
        if (!visited.has(prevStation)) {
          const stationSwitches = switches.filter(sw => sw.stationId === current.stationId);
          const newSwitchOps = [...current.switchOps];

          for (const sw of stationSwitches) {
            let position: SwitchPosition | null = null;
            if (sw.normalBlockId === block.id) {
              position = 'normal';
            } else if (sw.reverseBlockId === block.id) {
              position = 'reverse';
            }
            if (position && !newSwitchOps.some(s => s.switchId === sw.id)) {
              newSwitchOps.push({ switchId: sw.id, position });
            }
          }

          queue.push({
            stationId: prevStation,
            path: [...current.path, block.id],
            switchOps: newSwitchOps,
          });
        }
      }
    }

    return null;
  }
}
