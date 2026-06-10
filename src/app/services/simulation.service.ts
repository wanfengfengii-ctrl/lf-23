import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import {
  SimulationState,
  SimulationEvent,
  ConflictAlert,
  Train,
  BlockSection,
  Signal,
  TrainSchedule,
} from '../models/railway.model';
import { RailwayDataService } from './railway-data.service';
import { PlaybackService } from './playback.service';

@Injectable({
  providedIn: 'root'
})
export class SimulationService implements OnDestroy {
  private stateSubject = new BehaviorSubject<SimulationState>({
    currentTime: 0,
    isRunning: false,
    isPaused: false,
    speedMultiplier: 1,
    mode: 'live',
  });
  state$: Observable<SimulationState> = this.stateSubject.asObservable();

  private eventsSubject = new BehaviorSubject<SimulationEvent[]>([]);
  events$: Observable<SimulationEvent[]> = this.eventsSubject.asObservable();

  private simulationSubscription?: Subscription;

  constructor(
    private railwayDataService: RailwayDataService,
    private playbackService: PlaybackService
  ) {}

  ngOnDestroy(): void {
    this.stop();
  }

  getState(): SimulationState {
    return this.stateSubject.value;
  }

  start(): void {
    const state = this.stateSubject.value;

    if (state.isRunning && state.isPaused) {
      this.resume();
      return;
    }

    if (state.isRunning) return;

    if (state.mode === 'live') {
      this.initializeLiveSimulation();
    }

    const newState = {
      ...this.stateSubject.value,
      isRunning: true,
      isPaused: false,
    };
    this.stateSubject.next(newState);

    this.startSimulationLoop();
  }

  private initializeLiveSimulation(): void {
    this.railwayDataService.resetAll();
    this.eventsSubject.next([]);
    this.playbackService.clearRecording();

    const state = { ...this.stateSubject.value, currentTime: 0 };
    this.stateSubject.next(state);

    const schedules = this.railwayDataService.getSchedules();
    schedules.forEach(schedule => {
      this.scheduleTrainStart(schedule);
    });
  }

  private scheduleTrainStart(schedule: TrainSchedule): void {
    const event: SimulationEvent = {
      timestamp: schedule.startTime,
      type: 'train_start',
      data: { schedule },
    };
    this.addEvent(event);
  }

  private startSimulationLoop(): void {
    if (this.simulationSubscription) {
      this.simulationSubscription.unsubscribe();
    }

    const tickInterval = 100;
    this.simulationSubscription = interval(tickInterval).subscribe(() => {
      if (!this.stateSubject.value.isRunning || this.stateSubject.value.isPaused) {
        return;
      }
      this.tick(tickInterval / 1000);
    });
  }

  private tick(deltaSeconds: number): void {
    const currentState = this.stateSubject.value;
    if (currentState.mode === 'playback') {
      this.tickPlayback(deltaSeconds);
    } else {
      this.tickLive(deltaSeconds);
    }
  }

  private tickLive(deltaSeconds: number): void {
    const state = this.stateSubject.value;
    const newTime = state.currentTime + deltaSeconds * state.speedMultiplier;

    this.stateSubject.next({
      ...state,
      currentTime: newTime,
    });

    const events = this.eventsSubject.value;
    const pendingEvents = events.filter(e => e.timestamp <= newTime && e.timestamp > state.currentTime);

    pendingEvents.sort((a, b) => a.timestamp - b.timestamp);
    pendingEvents.forEach(event => this.processEvent(event));

    this.updateTrains(deltaSeconds * state.speedMultiplier);
    this.updateSignals();
    this.checkConflicts();

    if (state.mode === 'live') {
      this.playbackService.recordState({
        time: newTime,
        trains: this.railwayDataService.getTrains(),
        blocks: this.railwayDataService.getBlockSections(),
        signals: this.railwayDataService.getSignals(),
      });
    }
  }

  private processEvent(event: SimulationEvent): void {
    switch (event.type) {
      case 'train_start':
        this.startTrain(event.data.schedule);
        break;
    }
  }

  private startTrain(schedule: TrainSchedule): void {
    const train: Train = {
      id: schedule.trainId,
      name: schedule.name,
      currentStationId: schedule.startStationId,
      progress: 0,
      direction: schedule.direction,
      speed: schedule.speed,
      state: 'waiting',
      color: schedule.color,
    };

    this.railwayDataService.addTrainWithId(train);
    this.tryMoveTrainToNextBlock(schedule.trainId);
  }

  private updateTrains(deltaSeconds: number): void {
    const trains = this.railwayDataService.getTrains();
    const blocks = this.railwayDataService.getBlockSections();

    trains.forEach(train => {
      if (train.state !== 'running' || !train.currentBlockSectionId) {
        return;
      }

      const block = blocks.find(b => b.id === train.currentBlockSectionId);
      if (!block) return;

      const distanceToMove = train.speed * deltaSeconds;
      let newProgress = train.progress + distanceToMove;

      if (newProgress >= block.length) {
        newProgress = block.length;
        this.arriveAtNextStation(train.id, block);
      } else {
        this.railwayDataService.updateTrain({
          ...train,
          progress: newProgress,
        });
      }
    });
  }

  private arriveAtNextStation(trainId: string, block: BlockSection): void {
    const trains = this.railwayDataService.getTrains();
    const train = trains.find(t => t.id === trainId);
    if (!train) return;

    const arrivalStationId = train.direction === 'forward'
      ? block.toStationId
      : block.fromStationId;

    this.freeBlock(block.id, trainId);

    const schedules = this.railwayDataService.getSchedules();
    const schedule = schedules.find(s => s.trainId === trainId);

    if (schedule && arrivalStationId === schedule.endStationId) {
      this.railwayDataService.updateTrain({
        ...train,
        currentStationId: arrivalStationId,
        currentBlockSectionId: undefined,
        progress: 0,
        state: 'completed',
      });

      const event: SimulationEvent = {
        timestamp: this.stateSubject.value.currentTime,
        type: 'train_arrive',
        data: { trainId, stationId: arrivalStationId },
      };
      this.addEvent(event);
    } else {
      this.railwayDataService.updateTrain({
        ...train,
        currentStationId: arrivalStationId,
        currentBlockSectionId: undefined,
        progress: 0,
        state: 'waiting',
      });

      this.tryMoveTrainToNextBlock(trainId);
    }
  }

  private tryMoveTrainToNextBlock(trainId: string): void {
    const trains = this.railwayDataService.getTrains();
    const train = trains.find(t => t.id === trainId);
    if (!train || train.state !== 'waiting' || !train.currentStationId) {
      return;
    }

    const nextBlock = this.railwayDataService.getNextBlockSection(
      train.currentStationId,
      train.direction
    );

    if (!nextBlock) {
      const stationName = this.railwayDataService.getStationById(train.currentStationId)?.name || train.currentStationId;
      const conflict: ConflictAlert = {
        message: `线路冲突：列车「${train.name}」在 ${stationName} 站找不到${train.direction === 'forward' ? '正向' : '反向'}可用线路`,
        type: 'invalid_route',
        trainId: trainId,
      };
      this.triggerConflict(conflict);
      return;
    }

    const entrySignal = nextBlock.entrySignalId
      ? this.railwayDataService.getSignalById(nextBlock.entrySignalId)
      : undefined;

    if (entrySignal && entrySignal.state === 'stop') {
      return;
    }

    if (nextBlock.isOccupied) {
      return;
    }

    this.occupyBlock(nextBlock.id, trainId);

    this.railwayDataService.updateTrain({
      ...train,
      currentBlockSectionId: nextBlock.id,
      currentStationId: undefined,
      progress: 0,
      state: 'running',
    });

    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'train_enter_block',
      data: { trainId, blockId: nextBlock.id },
    };
    this.addEvent(event);
  }

  private occupyBlock(blockId: string, trainId: string): void {
    const blocks = this.railwayDataService.getBlockSections();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    this.railwayDataService.updateBlockSection({
      ...block,
      isOccupied: true,
      occupiedByTrainId: trainId,
    });

    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'block_occupied',
      data: { blockId, trainId },
    };
    this.addEvent(event);
  }

  private freeBlock(blockId: string, trainId: string): void {
    const blocks = this.railwayDataService.getBlockSections();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    this.railwayDataService.updateBlockSection({
      ...block,
      isOccupied: false,
      occupiedByTrainId: undefined,
    });

    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'block_cleared',
      data: { blockId, trainId },
    };
    this.addEvent(event);
  }

  private updateSignals(): void {
    const blocks = this.railwayDataService.getBlockSections();
    const signals = this.railwayDataService.getSignals();

    signals.forEach(signal => {
      const block = blocks.find(b => b.id === signal.blockSectionId);
      if (!block) return;

      let newState: 'clear' | 'stop' = 'stop';

      if (signal.position === 'entry') {
        newState = block.isOccupied ? 'stop' : 'clear';
      }

      if (signal.state !== newState) {
        this.railwayDataService.updateSignal({
          ...signal,
          state: newState,
        });

        const event: SimulationEvent = {
          timestamp: this.stateSubject.value.currentTime,
          type: 'signal_change',
          data: { signalId: signal.id, oldState: signal.state, newState },
        };
        this.addEvent(event);
      }
    });

    this.checkWaitingTrains();
  }

  private checkWaitingTrains(): void {
    const trains = this.railwayDataService.getTrains();
    trains.forEach(train => {
      if (train.state === 'waiting' && train.currentStationId) {
        this.tryMoveTrainToNextBlock(train.id);
      }
    });
  }

  private checkConflicts(): void {
    const currentState = this.stateSubject.value;
    if (currentState.conflictAlert) return;

    const blocks = this.railwayDataService.getBlockSections();

    for (const block of blocks) {
      const trainsInBlock = this.railwayDataService.getTrains().filter(
        t => t.currentBlockSectionId === block.id && t.state === 'running'
      );

      if (trainsInBlock.length > 1) {
        const conflict: ConflictAlert = {
          message: `冲突：${block.name} 区间同时存在 ${trainsInBlock.length} 列列车`,
          type: 'block_already_occupied',
          blockSectionId: block.id,
        };
        this.triggerConflict(conflict);
        return;
      }
    }
  }

  private triggerConflict(conflict: ConflictAlert): void {
    const state = this.stateSubject.value;
    this.stateSubject.next({
      ...state,
      isPaused: true,
      conflictAlert: conflict,
    });

    const event: SimulationEvent = {
      timestamp: state.currentTime,
      type: 'conflict_detected',
      data: conflict,
    };
    this.addEvent(event);
  }

  private addEvent(event: SimulationEvent): void {
    const events = [...this.eventsSubject.value, event];
    this.eventsSubject.next(events);
  }

  pause(): void {
    const state = this.stateSubject.value;
    if (!state.isRunning || state.isPaused) return;

    this.stateSubject.next({
      ...state,
      isPaused: true,
    });

    const event: SimulationEvent = {
      timestamp: state.currentTime,
      type: 'simulation_pause',
      data: { reason: 'user_pause' },
    };
    this.addEvent(event);
  }

  resume(): void {
    const state = this.stateSubject.value;
    if (!state.isRunning || !state.isPaused) return;

    this.stateSubject.next({
      ...state,
      isPaused: false,
      conflictAlert: undefined,
    });
  }

  stop(): void {
    if (this.simulationSubscription) {
      this.simulationSubscription.unsubscribe();
      this.simulationSubscription = undefined;
    }

    const state = this.stateSubject.value;
    this.stateSubject.next({
      ...state,
      isRunning: false,
      isPaused: false,
    });
  }

  reset(): void {
    this.stop();
    this.railwayDataService.resetAll();
    this.eventsSubject.next([]);

    this.stateSubject.next({
      currentTime: 0,
      isRunning: false,
      isPaused: false,
      speedMultiplier: this.stateSubject.value.speedMultiplier,
      mode: 'live',
      conflictAlert: undefined,
    });

    this.playbackService.clearRecording();
  }

  setSpeed(multiplier: number): void {
    const state = this.stateSubject.value;
    this.stateSubject.next({
      ...state,
      speedMultiplier: multiplier,
    });
  }

  dismissConflict(): void {
    const state = this.stateSubject.value;
    this.stateSubject.next({
      ...state,
      conflictAlert: undefined,
    });
  }

  startPlayback(): void {
    if (!this.playbackService.hasRecording()) return;

    this.stop();
    this.railwayDataService.resetAll();

    this.stateSubject.next({
      currentTime: 0,
      isRunning: true,
      isPaused: false,
      speedMultiplier: 1,
      mode: 'playback',
      conflictAlert: undefined,
    });

    this.playbackService.seekTo(0);
    this.startSimulationLoop();
  }

  private tickPlayback(deltaSeconds: number): void {
    const state = this.stateSubject.value;
    const newTime = state.currentTime + deltaSeconds * state.speedMultiplier;

    const recording = this.playbackService.getStateAtTime(newTime);

    if (recording) {
      const { trains, blocks, signals } = recording;
      this.railwayDataService.setTrains(trains);
      this.railwayDataService.setBlockSections(blocks);
      this.railwayDataService.setSignals(signals);
    }

    this.stateSubject.next({
      ...state,
      currentTime: newTime,
    });

    const duration = this.playbackService.getDuration();
    if (newTime >= duration) {
      this.stop();
      this.stateSubject.next({
        ...this.stateSubject.value,
        currentTime: duration,
      });
    }
  }

  seekTo(time: number): void {
    const state = this.stateSubject.value;
    const clampedTime = Math.max(0, time);

    if (state.mode === 'playback') {
      const recording = this.playbackService.getStateAtTime(clampedTime);
      if (recording) {
        this.railwayDataService.setTrains(recording.trains);
        this.railwayDataService.setBlockSections(recording.blocks);
        this.railwayDataService.setSignals(recording.signals);
      }
    } else if (state.mode === 'live' && this.playbackService.hasRecording()) {
      const recording = this.playbackService.getStateAtTime(clampedTime);
      if (recording) {
        this.railwayDataService.setTrains(recording.trains);
        this.railwayDataService.setBlockSections(recording.blocks);
        this.railwayDataService.setSignals(recording.signals);
      }
      this.stateSubject.next({
        ...state,
        currentTime: clampedTime,
        isPaused: true,
        conflictAlert: undefined,
      });
      return;
    }

    this.stateSubject.next({
      ...state,
      currentTime: clampedTime,
    });
  }

  switchToLive(): void {
    this.stop();
    this.railwayDataService.resetAll();

    this.stateSubject.next({
      currentTime: 0,
      isRunning: false,
      isPaused: false,
      speedMultiplier: 1,
      mode: 'live',
      conflictAlert: undefined,
    });
  }
}
