export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface Signal {
  id: string;
  name: string;
  stationId: string;
  blockSectionId: string;
  position: 'entry' | 'exit';
  state: SignalState;
  x: number;
  y: number;
}

export type SignalState = 'clear' | 'stop';

export interface BlockSection {
  id: string;
  name: string;
  fromStationId: string;
  toStationId: string;
  length: number;
  isOccupied: boolean;
  occupiedByTrainId?: string;
  entrySignalId?: string;
  exitSignalId?: string;
}

export interface Train {
  id: string;
  name: string;
  currentStationId?: string;
  currentBlockSectionId?: string;
  progress: number;
  direction: 'forward' | 'backward';
  speed: number;
  state: TrainState;
  color: string;
}

export type TrainState = 'waiting' | 'running' | 'stopped' | 'completed';

export interface TrainSchedule {
  trainId: string;
  startTime: number;
  startStationId: string;
  endStationId: string;
  direction: 'forward' | 'backward';
  speed: number;
  color: string;
  name: string;
}

export interface SimulationState {
  currentTime: number;
  isRunning: boolean;
  isPaused: boolean;
  speedMultiplier: number;
  mode: 'live' | 'playback';
  conflictAlert?: ConflictAlert;
}

export interface SimulationEvent {
  timestamp: number;
  type: SimulationEventType;
  data: any;
}

export type SimulationEventType =
  | 'train_start'
  | 'train_enter_block'
  | 'train_exit_block'
  | 'train_arrive'
  | 'signal_change'
  | 'block_occupied'
  | 'block_cleared'
  | 'conflict_detected'
  | 'simulation_pause';

export interface ConflictAlert {
  message: string;
  type: ConflictType;
  trainId?: string;
  blockSectionId?: string;
}

export type ConflictType =
  | 'block_already_occupied'
  | 'signal_at_stop'
  | 'no_connection'
  | 'invalid_route';
