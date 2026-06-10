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
  | 'block_confirm'
  | 'fault_trigger'
  | 'fault_acknowledge'
  | 'fault_resolve'
  | 'block_section_fault'
  | 'unblock_section_fault'
  | 'speed_restriction'
  | 'lift_speed_restriction'
  | 'manual_route_fault'
  | 'sequence_violation';

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
  | 'route_setup_failed'
  | 'fault_violation'
  | 'sequence_violation';

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

export type FaultType =
  | 'signal_fault'
  | 'switch_jammed'
  | 'block_occupancy_anomaly'
  | 'train_emergency_stop';

export type FaultSeverity = 'minor' | 'major' | 'critical';

export type FaultStatus = 'active' | 'acknowledged' | 'blocked' | 'resolved';

export interface Fault {
  id: string;
  type: FaultType;
  severity: FaultSeverity;
  status: FaultStatus;
  targetId: string;
  targetName: string;
  description: string;
  startTime: number;
  acknowledgeTime?: number;
  resolveTime?: number;
  affectedBlockIds: string[];
  affectedTrainIds: string[];
  isRandom: boolean;
  data?: any;
}

export interface FaultAction {
  id: string;
  timestamp: number;
  type: FaultActionType;
  faultId: string;
  faultType: FaultType;
  data: any;
  operator?: string;
}

export type FaultActionType =
  | 'fault_trigger'
  | 'fault_acknowledge'
  | 'block_section'
  | 'unblock_section'
  | 'manual_route_setup'
  | 'speed_restriction'
  | 'lift_speed_restriction'
  | 'fault_resolve'
  | 'emergency_log_entry';

export interface SpeedRestriction {
  blockSectionId: string;
  maxSpeed: number;
  reason: string;
  startTime: number;
}

export interface BlockedSection {
  blockSectionId: string;
  faultId: string;
  blockedAt: number;
  reason: string;
}

export interface EmergencyLogEntry {
  id: string;
  timestamp: number;
  category: 'fault' | 'action' | 'warning' | 'info';
  message: string;
  details?: any;
  operator?: string;
}

export interface FaultSimulationState {
  faults: Fault[];
  faultActions: FaultAction[];
  emergencyLog: EmergencyLogEntry[];
  blockedSections: BlockedSection[];
  speedRestrictions: SpeedRestriction[];
  isRandomFaultsEnabled: boolean;
  randomFaultInterval: number;
}

export type DispatcherRole = 'station_dispatcher' | 'section_dispatcher' | 'chief_dispatcher';

export interface RolePermission {
  canSetRoute: boolean;
  canCancelRoute: boolean;
  canManualSignal: boolean;
  canSwitchPosition: boolean;
  canBlockRequest: boolean;
  canBlockConfirm: boolean;
  canEmergencyStop: boolean;
  canTriggerFault: boolean;
  canAcknowledgeFault: boolean;
  canResolveFault: boolean;
  canBlockSection: boolean;
  canSpeedRestriction: boolean;
  canManualRoute: boolean;
  canShiftHandover: boolean;
  canApprove: boolean;
  canViewAudit: boolean;
}

export const ROLE_PERMISSIONS: Record<DispatcherRole, RolePermission> = {
  station_dispatcher: {
    canSetRoute: true,
    canCancelRoute: true,
    canManualSignal: true,
    canSwitchPosition: true,
    canBlockRequest: true,
    canBlockConfirm: false,
    canEmergencyStop: true,
    canTriggerFault: false,
    canAcknowledgeFault: true,
    canResolveFault: false,
    canBlockSection: false,
    canSpeedRestriction: false,
    canManualRoute: false,
    canShiftHandover: true,
    canApprove: false,
    canViewAudit: false,
  },
  section_dispatcher: {
    canSetRoute: true,
    canCancelRoute: true,
    canManualSignal: true,
    canSwitchPosition: true,
    canBlockRequest: true,
    canBlockConfirm: true,
    canEmergencyStop: true,
    canTriggerFault: true,
    canAcknowledgeFault: true,
    canResolveFault: true,
    canBlockSection: true,
    canSpeedRestriction: true,
    canManualRoute: true,
    canShiftHandover: true,
    canApprove: true,
    canViewAudit: false,
  },
  chief_dispatcher: {
    canSetRoute: true,
    canCancelRoute: true,
    canManualSignal: true,
    canSwitchPosition: true,
    canBlockRequest: true,
    canBlockConfirm: true,
    canEmergencyStop: true,
    canTriggerFault: true,
    canAcknowledgeFault: true,
    canResolveFault: true,
    canBlockSection: true,
    canSpeedRestriction: true,
    canManualRoute: true,
    canShiftHandover: true,
    canApprove: true,
    canViewAudit: true,
  },
};

export const ROLE_LABELS: Record<DispatcherRole, string> = {
  station_dispatcher: '车站值班员',
  section_dispatcher: '区间调度员',
  chief_dispatcher: '总调度员',
};

export const ROLE_COLORS: Record<DispatcherRole, string> = {
  station_dispatcher: '#2196f3',
  section_dispatcher: '#ff9800',
  chief_dispatcher: '#f44336',
};

export interface Dispatcher {
  id: string;
  username: string;
  password: string;
  realName: string;
  role: DispatcherRole;
  stationScope?: string[];
  sectionScope?: string[];
  isActive: boolean;
  loginTime?: number;
  lastActiveTime?: number;
  avatarColor?: string;
}

export interface DispatcherSession {
  dispatcher: Dispatcher;
  loginTime: number;
  sessionId: string;
}

export interface ShiftHandover {
  id: string;
  fromDispatcherId: string;
  fromDispatcherName: string;
  toDispatcherId: string;
  toDispatcherName: string;
  fromRole: DispatcherRole;
  toRole: DispatcherRole;
  handoverTime: number;
  notes: string;
  pendingItems: ShiftItem[];
  status: 'pending' | 'completed' | 'cancelled';
  confirmTime?: number;
}

export interface ShiftItem {
  id: string;
  type: 'route' | 'fault' | 'block_request' | 'other';
  targetId: string;
  targetName: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type ApprovalActionType =
  | 'set_route'
  | 'cancel_route'
  | 'manual_signal'
  | 'switch_position'
  | 'block_confirm'
  | 'emergency_stop'
  | 'trigger_fault'
  | 'resolve_fault'
  | 'block_section'
  | 'unblock_section'
  | 'speed_restriction'
  | 'lift_speed_restriction'
  | 'manual_route_setup';

export interface OperationApproval {
  id: string;
  requestTime: number;
  requestorId: string;
  requestorName: string;
  requestorRole: DispatcherRole;
  approverId?: string;
  approverName?: string;
  approverRole?: DispatcherRole;
  actionType: ApprovalActionType;
  targetId: string;
  targetName: string;
  targetType: 'signal' | 'switch' | 'route' | 'block' | 'fault' | 'train';
  actionData: any;
  status: ApprovalStatus;
  decisionTime?: number;
  rejectReason?: string;
  conflictInfo?: ConflictAlert;
}

export type AuditActionResult = 'success' | 'failed' | 'blocked' | 'pending_approval';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  simTime: number;
  operatorId: string;
  operatorName: string;
  operatorRole: DispatcherRole;
  actionType: string;
  targetId: string;
  targetName: string;
  targetType: string;
  result: AuditActionResult;
  details: any;
  rejectionReason?: string;
  approverId?: string;
  approverName?: string;
  approvalTime?: number;
  sessionId?: string;
}

export interface PermissionViolation {
  operatorId: string;
  operatorName: string;
  operatorRole: DispatcherRole;
  actionType: string;
  requiredPermission: string;
  targetId: string;
  targetName: string;
  reason: string;
  timestamp: number;
  simTime: number;
}

export interface ConcurrentConflict {
  id: string;
  timestamp: number;
  simTime: number;
  targetId: string;
  targetName: string;
  targetType: string;
  firstOperatorId: string;
  firstOperatorName: string;
  secondOperatorId: string;
  secondOperatorName: string;
  actionType: string;
  blockedOperatorId: string;
  reason: string;
}

export interface MultiDispatcherState {
  activeDispatchers: DispatcherSession[];
  currentDispatcherId: string | null;
  shiftHandovers: ShiftHandover[];
  pendingApprovals: OperationApproval[];
  auditLogs: AuditLogEntry[];
  permissionViolations: PermissionViolation[];
  concurrentConflicts: ConcurrentConflict[];
}

export type AuthPermissionKey = keyof RolePermission;
