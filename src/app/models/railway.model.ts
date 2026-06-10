export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  tracks?: Track[];
}

export interface Track {
  id: string;
  name: string;
  stationId: string;
  position: number;
}

export interface Switch {
  id: string;
  name: string;
  stationId: string;
  x: number;
  y: number;
  position: SwitchPosition;
  normalBlockId: string;
  reverseBlockId: string;
  commonBlockId: string;
  isLocked: boolean;
  lockedByRouteId?: string;
}

export type SwitchPosition = 'normal' | 'reverse';

export interface Signal {
  id: string;
  name: string;
  stationId: string;
  blockSectionId: string;
  position: 'entry' | 'exit';
  signalType: 'home' | 'starting' | 'block';
  state: SignalState;
  isManualMode: boolean;
  x: number;
  y: number;
}

export type SignalState = 'clear' | 'stop';

export interface BlockSection {
  id: string;
  name: string;
  fromStationId: string;
  toStationId: string;
  fromTrackId?: string;
  toTrackId?: string;
  length: number;
  isOccupied: boolean;
  occupiedByTrainId?: string;
  entrySignalId?: string;
  exitSignalId?: string;
  isRouteLocked: boolean;
  lockedByRouteId?: string;
}

export interface Route {
  id: string;
  name: string;
  startSignalId: string;
  endSignalId: string;
  blockSectionIds: string[];
  switchIds: string[];
  switchPositions: { switchId: string; position: SwitchPosition }[];
  direction: 'forward' | 'backward';
  state: RouteState;
  lockedByTrainId?: string;
  unlockTimer?: number;
}

export type RouteState = 'idle' | 'setup' | 'locked' | 'used' | 'unlocking';

export interface Train {
  id: string;
  name: string;
  currentStationId?: string;
  currentTrackId?: string;
  currentBlockSectionId?: string;
  currentRouteId?: string;
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
  startTrackId?: string;
  endStationId: string;
  endTrackId?: string;
  direction: 'forward' | 'backward';
  speed: number;
  color: string;
  name: string;
  routeStations?: string[];
}

export interface SimulationState {
  currentTime: number;
  isRunning: boolean;
  isPaused: boolean;
  speedMultiplier: number;
  mode: 'live' | 'playback';
  conflictAlert?: ConflictAlert;
  selectedRouteId?: string;
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
  | 'simulation_pause'
  | 'route_setup'
  | 'route_cancel'
  | 'route_lock'
  | 'route_unlock'
  | 'switch_change'
  | 'manual_signal'
  | 'block_request'
  | 'block_confirm';

export interface ConflictAlert {
  message: string;
  type: ConflictType;
  trainId?: string;
  blockSectionId?: string;
  routeId?: string;
}

export type ConflictType =
  | 'block_already_occupied'
  | 'signal_at_stop'
  | 'no_connection'
  | 'invalid_route'
  | 'conflicting_route'
  | 'switch_locked'
  | 'route_setup_failed';

export interface DispatcherAction {
  id: string;
  timestamp: number;
  type: DispatcherActionType;
  data: any;
  operator?: string;
}

export type DispatcherActionType =
  | 'set_route'
  | 'cancel_route'
  | 'manual_signal'
  | 'switch_position'
  | 'block_request'
  | 'block_confirm'
  | 'emergency_stop';

export interface BlockRequest {
  id: string;
  fromStationId: string;
  toStationId: string;
  trainId?: string;
  status: 'pending' | 'confirmed' | 'rejected';
  timestamp: number;
}
