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
  Route,
  Switch,
  DispatcherAction,
  BlockRequest,
  FaultSimulationState,
  FaultType,
  OperationApproval,
  ApprovalActionType,
  AuditActionResult,
  PermissionViolation,
} from '../models/railway.model';
import { RailwayDataService } from './railway-data.service';
import { PlaybackService } from './playback.service';
import { RouteControlService } from './route-control.service';
import { FaultSimulationService } from './fault-simulation.service';
import { AuthService } from './auth.service';
import { ApprovalService } from './approval.service';
import { AuditService } from './audit.service';
import { ShiftHandoverService } from './shift-handover.service';

@Injectable({
  providedIn: 'root',
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

  private dispatcherActionsSubject = new BehaviorSubject<DispatcherAction[]>([]);
  dispatcherActions$: Observable<DispatcherAction[]> = this.dispatcherActionsSubject.asObservable();

  private blockRequestsSubject = new BehaviorSubject<BlockRequest[]>([]);
  blockRequests$: Observable<BlockRequest[]> = this.blockRequestsSubject.asObservable();

  private simulationSubscription?: Subscription;
  private nextActionId = 1;
  private nextRequestId = 1;

  private permissionAlertSubject = new BehaviorSubject<{ message: string; reason: string; permission?: string } | null>(null);
  permissionAlert$: Observable<{ message: string; reason: string; permission?: string } | null> = this.permissionAlertSubject.asObservable();

  constructor(
    private railwayDataService: RailwayDataService,
    private playbackService: PlaybackService,
    private routeControlService: RouteControlService,
    private faultSimulationService: FaultSimulationService,
    private authService: AuthService,
    private approvalService: ApprovalService,
    private auditService: AuditService,
    private shiftHandoverService: ShiftHandoverService
  ) {
    this.setupApprovalListener();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private setupApprovalListener(): void {
    this.approvalService.approvalResult$.subscribe(result => {
      if (!result) return;
      const { approval, actionData } = result;
      if (approval.status === 'approved') {
        this.executeApprovedAction(approval.actionType, actionData);
      }
    });
  }

  private executeApprovedAction(actionType: ApprovalActionType, data: any): void {
    switch (actionType) {
      case 'set_route':
        this.setRouteInternal(data.routeId, true);
        break;
      case 'cancel_route':
        this.cancelRouteInternal(data.routeId, true);
        break;
      case 'manual_signal':
        this.setSignalManualInternal(data.signalId, data.state, true);
        break;
      case 'switch_position':
        this.setSwitchPositionInternal(data.switchId, data.position, true);
        break;
      case 'block_confirm':
        this.confirmBlockRequestInternal(data.requestId, data.confirm, true);
        break;
      case 'block_section':
        this.faultSimulationService.blockSection(data.faultId, data.blockSectionId);
        break;
      case 'unblock_section':
        this.faultSimulationService.unblockSection(data.faultId, data.blockSectionId);
        break;
      case 'resolve_fault':
        this.faultSimulationService.resolveFault(data.faultId);
        break;
      case 'speed_restriction':
        this.faultSimulationService.setSpeedRestriction(
          data.blockSectionId,
          data.maxSpeed,
          data.reason,
          data.faultId
        );
        break;
      case 'lift_speed_restriction':
        this.faultSimulationService.liftSpeedRestriction(data.blockSectionId, data.faultId);
        break;
    }
  }

  private syncSimTimeToServices(): void {
    const currentTime = this.stateSubject.value.currentTime;
    this.authService.setSimTime(currentTime);
    this.approvalService.setSimTime(currentTime);
    this.auditService.setSimTime(currentTime);
    this.shiftHandoverService.setSimTime(currentTime);
  }

  private triggerPermissionAlert(message: string, reason: string, permission?: string): void {
    this.permissionAlertSubject.next({ message, reason, permission });
  }

  dismissPermissionAlert(): void {
    this.permissionAlertSubject.next(null);
  }

  private recordAuditWithResult(
    actionType: string,
    targetId: string,
    targetName: string,
    targetType: string,
    result: AuditActionResult,
    details: any,
    rejectionReason?: string
  ): void {
    this.auditService.record({
      actionType,
      targetId,
      targetName,
      targetType,
      result,
      details,
      rejectionReason,
    });
  }

  getDispatcherName(): string {
    return this.authService.getCurrentDispatcher()?.realName || '未登录';
  }

  getCurrentRoleLabel(): string {
    const role = this.authService.getCurrentRole();
    return role ? this.authService.getRoleLabel(role) : '';
  }

  getState(): SimulationState {
    return this.stateSubject.value;
  }

  getEvents(): SimulationEvent[] {
    return this.eventsSubject.value;
  }

  getDispatcherActions(): DispatcherAction[] {
    return this.dispatcherActionsSubject.value;
  }

  getBlockRequests(): BlockRequest[] {
    return this.blockRequestsSubject.value;
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
    this.routeControlService.resetAll();
    this.faultSimulationService.reset();
    this.eventsSubject.next([]);
    this.dispatcherActionsSubject.next([]);
    this.blockRequestsSubject.next([]);
    this.playbackService.clearRecording();

    const state = { ...this.stateSubject.value, currentTime: 0 };
    this.stateSubject.next(state);

    this.initializeDefaultRoutes();

    const schedules = this.railwayDataService.getSchedules();
    schedules.forEach(schedule => {
      this.scheduleTrainStart(schedule);
    });
  }

  private initializeDefaultRoutes(): void {
    const signals = this.railwayDataService.getSignals();
    const stations = this.railwayDataService.getStations();

    const routeConfigs = [
      {
        name: 'A→D 主线进路',
        startSignalName: 'A出站信号',
        endSignalName: 'D进站信号',
        routeStations: ['S1', 'S2', 'S3', 'S4'],
        direction: 'forward' as const,
      },
      {
        name: 'A→E 支线进路',
        startSignalName: 'A出站信号',
        endSignalName: 'E进站信号',
        routeStations: ['S1', 'S2', 'S5'],
        direction: 'forward' as const,
      },
      {
        name: 'D→E 联络进路',
        startSignalName: 'C出站信号',
        endSignalName: 'E进站信号',
        routeStations: ['S3', 'S5'],
        direction: 'backward' as const,
      },
      {
        name: 'D→A 反向进路',
        startSignalName: 'D进站信号',
        endSignalName: 'A出站信号',
        routeStations: ['S4', 'S3', 'S2', 'S1'],
        direction: 'backward' as const,
      },
    ];

    for (const config of routeConfigs) {
      const startSignal = signals.find(s => s.name === config.startSignalName);
      const endSignal = signals.find(s => s.name === config.endSignalName);

      if (!startSignal || !endSignal) continue;

      const path = this.railwayDataService.findPath(
        config.routeStations[0],
        config.routeStations[config.routeStations.length - 1],
        config.routeStations
      );

      if (path) {
        this.routeControlService.addRoute({
          name: config.name,
          startSignalId: startSignal.id,
          endSignalId: endSignal.id,
          blockSectionIds: path.blocks,
          switchIds: path.switches.map(s => s.switchId),
          switchPositions: path.switches,
          direction: config.direction,
        });
      }
    }
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

    this.syncSimTimeToServices();

    this.authService.touchCurrentSession();

    const events = this.eventsSubject.value;
    const pendingEvents = events.filter(e => e.timestamp <= newTime && e.timestamp > state.currentTime);

    pendingEvents.sort((a, b) => a.timestamp - b.timestamp);
    pendingEvents.forEach(event => this.processEvent(event));

    this.routeControlService.tickUnlock(deltaSeconds * state.speedMultiplier);

    this.faultSimulationService.tick(newTime);
    this.faultSimulationService.applyFaultEffects();

    this.updateTrains(deltaSeconds * state.speedMultiplier);
    this.updateSignals();
    this.checkConflicts();
    this.checkFaultViolations();

    if (state.mode === 'live') {
      const currentDispatcher = this.authService.getCurrentDispatcher();
      const permissionViolations: PermissionViolation[] = [];
      const multiDispatcherState = {
        activeDispatchers: this.authService.getActiveSessions(),
        currentDispatcherId: currentDispatcher?.id || null,
        shiftHandovers: this.shiftHandoverService.getHandovers(),
        pendingApprovals: this.approvalService.getApprovals(),
        auditLogs: this.auditService.getAuditLogs(),
        permissionViolations,
        concurrentConflicts: this.auditService.getConcurrentConflicts(),
      };

      this.playbackService.recordState({
        time: newTime,
        trains: this.railwayDataService.getTrains(),
        blocks: this.railwayDataService.getBlockSections(),
        signals: this.railwayDataService.getSignals(),
        switches: this.railwayDataService.getSwitches(),
        routes: this.routeControlService.getRoutes(),
        dispatcherActions: this.dispatcherActionsSubject.value,
        faultState: this.faultSimulationService.getState(),
        multiDispatcherState,
        auditLogs: multiDispatcherState.auditLogs,
        activeSessions: multiDispatcherState.activeDispatchers,
        currentDispatcherId: multiDispatcherState.currentDispatcherId,
        pendingApprovals: multiDispatcherState.pendingApprovals,
        shiftHandovers: multiDispatcherState.shiftHandovers,
        permissionViolations: multiDispatcherState.permissionViolations,
        concurrentConflicts: multiDispatcherState.concurrentConflicts,
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
      currentTrackId: schedule.startTrackId,
      progress: 0,
      direction: schedule.direction,
      speed: schedule.speed,
      state: 'waiting',
      color: schedule.color,
    };

    this.railwayDataService.addTrainWithId(train);
    this.trySetupRouteForTrain(schedule.trainId);
  }

  private trySetupRouteForTrain(trainId: string): boolean {
    const trains = this.railwayDataService.getTrains();
    const train = trains.find(t => t.id === trainId);
    if (!train || train.state !== 'waiting' || !train.currentStationId) {
      return false;
    }

    const schedules = this.railwayDataService.getSchedules();
    const schedule = schedules.find(s => s.trainId === trainId);
    if (!schedule) return false;

    const routes = this.routeControlService.findRoutesForTrain(
      train.currentStationId,
      schedule.endStationId,
      train.direction
    );

    const availableRoute = routes.find(r => r.state === 'idle');
    if (!availableRoute) return false;

    const result = this.routeControlService.setRoute(availableRoute.id);
    if (!result.success) {
      if (result.conflict) {
        this.triggerConflict(result.conflict);
      }
      return false;
    }

    this.routeControlService.lockRouteForTrain(availableRoute.id, trainId);

    train.currentRouteId = availableRoute.id;
    this.railwayDataService.updateTrain(train);

    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'route_setup',
      data: { routeId: availableRoute.id, trainId, routeName: availableRoute.name },
    };
    this.addEvent(event);

    this.tryMoveTrainToNextBlock(trainId);

    return true;
  }

  private updateTrains(deltaSeconds: number): void {
    const trains = this.railwayDataService.getTrains();
    const blocks = this.railwayDataService.getBlockSections();
    const speedRestrictions = this.faultSimulationService.getState().speedRestrictions;

    trains.forEach(train => {
      if (train.state !== 'running' || !train.currentBlockSectionId) {
        return;
      }

      const block = blocks.find(b => b.id === train.currentBlockSectionId);
      if (!block) return;

      const speedRestriction = speedRestrictions.find(sr => sr.blockSectionId === block.id);
      const effectiveSpeed = speedRestriction ? Math.min(train.speed, speedRestriction.maxSpeed) : train.speed;

      const distanceToMove = effectiveSpeed * deltaSeconds;
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

    const arrivalStationId =
      train.direction === 'forward' ? block.toStationId : block.fromStationId;

    this.freeBlock(block.id, trainId);

    if (train.currentRouteId) {
      const route = this.routeControlService.getRouteById(train.currentRouteId);
      if (route && route.state === 'locked') {
        this.routeControlService.markRouteUsed(train.currentRouteId);
        this.routeControlService.startDelayedUnlock(train.currentRouteId, 3);

        const event: SimulationEvent = {
          timestamp: this.stateSubject.value.currentTime,
          type: 'route_unlock',
          data: { routeId: train.currentRouteId, trainId, delayed: true },
        };
        this.addEvent(event);
      }
    }

    const schedules = this.railwayDataService.getSchedules();
    const schedule = schedules.find(s => s.trainId === trainId);

    if (schedule && arrivalStationId === schedule.endStationId) {
      this.railwayDataService.updateTrain({
        ...train,
        currentStationId: arrivalStationId,
        currentBlockSectionId: undefined,
        currentRouteId: undefined,
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
        currentRouteId: undefined,
        progress: 0,
        state: 'waiting',
      });

      this.trySetupRouteForTrain(trainId);
    }
  }

  private tryMoveTrainToNextBlock(trainId: string): void {
    const trains = this.railwayDataService.getTrains();
    const train = trains.find(t => t.id === trainId);
    if (!train || train.state !== 'waiting' || !train.currentStationId) {
      return;
    }

    if (!train.currentRouteId) {
      const schedule = this.railwayDataService.getSchedules().find(s => s.trainId === trainId);
      if (schedule) {
        const routeSet = this.trySetupRouteForTrain(trainId);
        if (!routeSet) return;
      } else {
        return;
      }
    }

    const route = train.currentRouteId
      ? this.routeControlService.getRouteById(train.currentRouteId)
      : null;

    const nextBlock = this.getNextBlockForTrain(train);
    if (!nextBlock) {
      const stationName =
        this.railwayDataService.getStationById(train.currentStationId)?.name ||
        train.currentStationId;
      const conflict: ConflictAlert = {
        message: `线路冲突：列车「${train.name}」在 ${stationName} 站找不到可用线路`,
        type: 'invalid_route',
        trainId: trainId,
      };
      this.triggerConflict(conflict);
      return;
    }

    const safetyCheck = this.faultSimulationService.checkOperationSafety('train_enter_block', {
      blockSectionId: nextBlock.id,
    });
    if (!safetyCheck.safe) {
      const conflict: ConflictAlert = {
        message: `${safetyCheck.reason} - 列车「${train.name}」`,
        type: 'invalid_route',
        trainId: trainId,
        blockSectionId: nextBlock.id,
      };
      this.triggerFaultViolation(conflict);
      return;
    }

    const trainDepartCheck = this.faultSimulationService.checkOperationSafety('train_depart', {
      trainId: trainId,
      blockSectionId: nextBlock.id,
    });
    if (!trainDepartCheck.safe) {
      const conflict: ConflictAlert = {
        message: `${trainDepartCheck.reason}`,
        type: 'invalid_route',
        trainId: trainId,
        blockSectionId: nextBlock.id,
      };
      this.triggerFaultViolation(conflict);
      return;
    }

    const entrySignal = nextBlock.entrySignalId
      ? this.railwayDataService.getSignalById(nextBlock.entrySignalId)
      : undefined;

    const exitSignal = nextBlock.exitSignalId
      ? this.railwayDataService.getSignalById(nextBlock.exitSignalId)
      : undefined;

    const startSignal =
      train.direction === 'forward' ? exitSignal : entrySignal;

    if (startSignal && startSignal.state === 'stop') {
      return;
    }

    if (nextBlock.isOccupied) {
      return;
    }

    if (!this.verifyRouteIntegrity(train)) {
      return;
    }

    const speedRestriction = this.faultSimulationService.getSpeedRestrictionForBlock(nextBlock.id);
    let actualSpeed = train.speed;
    if (speedRestriction && train.speed > speedRestriction.maxSpeed) {
      actualSpeed = speedRestriction.maxSpeed;
    }

    this.occupyBlock(nextBlock.id, trainId);

    this.railwayDataService.updateTrain({
      ...train,
      currentBlockSectionId: nextBlock.id,
      currentStationId: undefined,
      progress: 0,
      state: 'running',
      speed: actualSpeed,
    });

    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'train_enter_block',
      data: { trainId, blockId: nextBlock.id },
    };
    this.addEvent(event);
  }

  private getNextBlockForTrain(train: Train): BlockSection | undefined {
    const blocks = this.railwayDataService.getBlockSections();
    const switches = this.railwayDataService.getSwitches();

    if (train.currentRouteId) {
      const route = this.routeControlService.getRouteById(train.currentRouteId);
      if (route) {
        const currentBlockIndex = train.currentBlockSectionId
          ? route.blockSectionIds.indexOf(train.currentBlockSectionId)
          : -1;
        const nextBlockId = route.blockSectionIds[currentBlockIndex + 1];

        if (nextBlockId) {
          return blocks.find(b => b.id === nextBlockId);
        }
      }
    }

    const stationSwitches = switches.filter(sw => sw.stationId === train.currentStationId);

    if (train.direction === 'forward') {
      const forwardBlocks = blocks.filter(b => b.fromStationId === train.currentStationId);

      if (stationSwitches.length > 0) {
        const sw = stationSwitches[0];
        const targetBlockId =
          sw.position === 'normal' ? sw.normalBlockId : sw.reverseBlockId;
        return forwardBlocks.find(b => b.id === targetBlockId);
      }

      return forwardBlocks[0];
    } else {
      const backwardBlocks = blocks.filter(b => b.toStationId === train.currentStationId);

      if (stationSwitches.length > 0) {
        const sw = stationSwitches[0];
        const targetBlockId =
          sw.position === 'normal' ? sw.normalBlockId : sw.reverseBlockId;
        return backwardBlocks.find(b => b.id === targetBlockId);
      }

      return backwardBlocks[0];
    }
  }

  private verifyRouteIntegrity(train: Train): boolean {
    if (!train.currentRouteId) return true;

    const route = this.routeControlService.getRouteById(train.currentRouteId);
    if (!route) return false;

    const blocks = this.railwayDataService.getBlockSections();
    const switches = this.railwayDataService.getSwitches();

    for (const blockId of route.blockSectionIds) {
      const block = blocks.find(b => b.id === blockId);
      if (!block || block.isOccupied) {
        return false;
      }
    }

    for (const sp of route.switchPositions) {
      const sw = switches.find(s => s.id === sp.switchId);
      if (!sw || sw.position !== sp.position) {
        return false;
      }
    }

    return true;
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
    const routes = this.routeControlService.getRoutes();

    signals.forEach(signal => {
      if (signal.isManualMode) return;

      const block = blocks.find(b => b.id === signal.blockSectionId);
      if (!block) return;

      const relatedRoute = routes.find(r => {
        if (signal.position === 'exit' && r.startSignalId === signal.id) {
          return r.state === 'setup' || r.state === 'locked';
        }
        if (signal.position === 'entry' && r.endSignalId === signal.id) {
          return r.state === 'setup' || r.state === 'locked';
        }
        return false;
      });

      let newState: 'clear' | 'stop' = 'stop';

      if (relatedRoute) {
        if (signal.position === 'exit' && relatedRoute.startSignalId === signal.id) {
          newState = 'clear';
        }
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

    this.addDispatcherAction({
      type: 'emergency_stop',
      data: { reason: conflict.message, conflictType: conflict.type },
      operator: 'system',
    });
  }

  private triggerFaultViolation(conflict: ConflictAlert): void {
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

    this.addDispatcherAction({
      type: 'emergency_stop',
      data: { reason: conflict.message, conflictType: conflict.type },
      operator: 'system',
    });
  }

  private checkFaultViolations(): void {
    const trains = this.railwayDataService.getTrains();
    const blockedSections = this.faultSimulationService.getBlockedSections();
    const blockedIds = new Set(blockedSections.map(bs => bs.blockSectionId));

    for (const train of trains) {
      if (train.state !== 'running' || !train.currentBlockSectionId) continue;

      if (blockedIds.has(train.currentBlockSectionId)) {
        const block = this.railwayDataService.getBlockSectionById(train.currentBlockSectionId);
        const conflict: ConflictAlert = {
          message: `安全违规：列车「${train.name}」进入了被封锁的区间「${block?.name || train.currentBlockSectionId}」`,
          type: 'invalid_route',
          trainId: train.id,
          blockSectionId: train.currentBlockSectionId,
        };
        this.triggerFaultViolation(conflict);
        return;
      }
    }
  }

  private addEvent(event: SimulationEvent): void {
    const events = [...this.eventsSubject.value, event];
    this.eventsSubject.next(events);
  }

  setRoute(routeId: string): { success: boolean; conflict?: ConflictAlert; pendingApproval?: OperationApproval; message?: string } {
    const route = this.routeControlService.getRouteById(routeId);
    if (!route) {
      return { success: false, conflict: { message: '进路不存在', type: 'invalid_route' } };
    }

    const startSignal = this.railwayDataService.getSignalById(route.startSignalId);
    const endSignal = this.railwayDataService.getSignalById(route.endSignalId);
    const startStationId = startSignal?.stationId || '';
    const endStationId = endSignal?.stationId || '';

    const permissionCheck = this.authService.canOperateRoute(routeId, startStationId, endStationId);
    if (!permissionCheck.allowed) {
      this.triggerPermissionAlert(`越权操作：排列进路「${route.name}」`, permissionCheck.reason || '无权限');
      this.authService.recordViolation('set_route', 'canSetRoute', routeId, route.name, permissionCheck.reason || '无权限');
      this.recordAuditWithResult('set_route', routeId, route.name, 'route', 'blocked', { routeId, routeName: route.name }, permissionCheck.reason);
      return { success: false, message: permissionCheck.reason };
    }

    const conflictCheck = this.auditService.checkConcurrentConflict(routeId, route.name, 'route', 'set_route');
    if (conflictCheck.conflict) {
      this.recordAuditWithResult('set_route', routeId, route.name, 'route', 'blocked', { routeId }, conflictCheck.reason);
      return { success: false, message: conflictCheck.reason };
    }

    if (this.approvalService.requiresApproval('set_route')) {
      const approvalResult = this.approvalService.submitForApproval({
        actionType: 'set_route',
        targetId: routeId,
        targetName: route.name,
        targetType: 'route',
        actionData: { routeId, routeName: route.name },
      });
      if (approvalResult.success && approvalResult.approval) {
        this.recordAuditWithResult('set_route', routeId, route.name, 'route', 'pending_approval', { routeId, approvalId: approvalResult.approval.id });
        this.auditService.releaseOperation(routeId, 'route');
        return { success: false, pendingApproval: approvalResult.approval, message: '操作已提交审批，请等待批准' };
      }
    }

    return this.setRouteInternal(routeId, false);
  }

  private setRouteInternal(routeId: string, fromApproval: boolean): { success: boolean; conflict?: ConflictAlert } {
    const route = this.routeControlService.getRouteById(routeId);
    if (!route) {
      return { success: false, conflict: { message: '进路不存在', type: 'invalid_route' } };
    }

    const safetyCheck = this.faultSimulationService.checkOperationSafety('set_route', {
      blockSectionIds: route.blockSectionIds,
      switchIds: route.switchIds,
    });
    if (!safetyCheck.safe) {
      this.recordAuditWithResult('set_route', routeId, route.name, 'route', 'failed', { routeId }, safetyCheck.reason);
      this.auditService.releaseOperation(routeId, 'route');
      return {
        success: false,
        conflict: {
          message: safetyCheck.reason || '安全检查未通过',
          type: 'invalid_route',
          routeId,
        },
      };
    }

    const result = this.routeControlService.setRoute(routeId);

    if (result.success) {
      const currentDispatcher = this.authService.getCurrentDispatcher();
      const event: SimulationEvent = {
        timestamp: this.stateSubject.value.currentTime,
        type: 'route_setup',
        data: { routeId },
      };
      this.addEvent(event);

      this.addDispatcherAction({
        type: 'set_route',
        data: { routeId },
        operator: currentDispatcher?.realName || 'dispatcher',
      });

      const activeFaults = this.faultSimulationService.getActiveFaults();
      if (activeFaults.length > 0) {
        this.faultSimulationService.recordManualRouteSetup(
          activeFaults[0].id,
          routeId,
          route.name
        );
      }

      this.recordAuditWithResult('set_route', routeId, route.name, 'route', 'success', {
        routeId,
        fromApproval,
        approver: fromApproval ? this.authService.getCurrentDispatcher()?.realName : undefined,
      });

      this.checkWaitingTrains();
    } else {
      this.recordAuditWithResult('set_route', routeId, route.name, 'route', 'failed', { routeId, conflict: result.conflict }, result.conflict?.message);
    }

    this.auditService.releaseOperation(routeId, 'route');
    return result;
  }

  cancelRoute(routeId: string): { success: boolean; message?: string; pendingApproval?: OperationApproval } {
    const route = this.routeControlService.getRouteById(routeId);
    if (!route) {
      return { success: false, message: '进路不存在' };
    }

    const startSignal = this.railwayDataService.getSignalById(route.startSignalId);
    const endSignal = this.railwayDataService.getSignalById(route.endSignalId);
    const startStationId = startSignal?.stationId || '';
    const endStationId = endSignal?.stationId || '';

    if (!this.authService.hasPermission('canCancelRoute')) {
      this.triggerPermissionAlert(`越权操作：取消进路「${route.name}」`, '无取消进路权限');
      this.authService.recordViolation('cancel_route', 'canCancelRoute', routeId, route.name, '无取消进路权限');
      this.recordAuditWithResult('cancel_route', routeId, route.name, 'route', 'blocked', { routeId }, '无取消进路权限');
      return { success: false, message: '无取消进路权限' };
    }

    const permissionCheck = this.authService.canOperateRoute(routeId, startStationId, endStationId);
    if (!permissionCheck.allowed) {
      this.triggerPermissionAlert(`越权操作：取消进路「${route.name}」`, permissionCheck.reason || '无权限');
      this.authService.recordViolation('cancel_route', 'canCancelRoute', routeId, route.name, permissionCheck.reason || '无权限');
      this.recordAuditWithResult('cancel_route', routeId, route.name, 'route', 'blocked', { routeId }, permissionCheck.reason);
      return { success: false, message: permissionCheck.reason };
    }

    const conflictCheck = this.auditService.checkConcurrentConflict(routeId, route.name, 'route', 'cancel_route');
    if (conflictCheck.conflict) {
      this.recordAuditWithResult('cancel_route', routeId, route.name, 'route', 'blocked', { routeId }, conflictCheck.reason);
      return { success: false, message: conflictCheck.reason };
    }

    if (this.approvalService.requiresApproval('cancel_route')) {
      const approvalResult = this.approvalService.submitForApproval({
        actionType: 'cancel_route',
        targetId: routeId,
        targetName: route.name,
        targetType: 'route',
        actionData: { routeId, routeName: route.name },
      });
      if (approvalResult.success && approvalResult.approval) {
        this.recordAuditWithResult('cancel_route', routeId, route.name, 'route', 'pending_approval', { routeId, approvalId: approvalResult.approval.id });
        this.auditService.releaseOperation(routeId, 'route');
        return { success: false, pendingApproval: approvalResult.approval, message: '操作已提交审批，请等待批准' };
      }
    }

    return this.cancelRouteInternal(routeId, false);
  }

  private cancelRouteInternal(routeId: string, fromApproval: boolean): { success: boolean } {
    const route = this.routeControlService.getRouteById(routeId);
    const routeName = route?.name || routeId;
    const success = this.routeControlService.cancelRoute(routeId);

    if (success) {
      const currentDispatcher = this.authService.getCurrentDispatcher();
      const event: SimulationEvent = {
        timestamp: this.stateSubject.value.currentTime,
        type: 'route_cancel',
        data: { routeId },
      };
      this.addEvent(event);

      this.addDispatcherAction({
        type: 'cancel_route',
        data: { routeId },
        operator: currentDispatcher?.realName || 'dispatcher',
      });

      this.recordAuditWithResult('cancel_route', routeId, routeName, 'route', 'success', {
        routeId,
        fromApproval,
      });
    } else {
      this.recordAuditWithResult('cancel_route', routeId, routeName, 'route', 'failed', { routeId }, '进路状态不允许取消');
    }

    this.auditService.releaseOperation(routeId, 'route');
    return { success };
  }

  setSignalManual(signalId: string, state: 'clear' | 'stop'): { success: boolean; message?: string; pendingApproval?: OperationApproval } {
    const signal = this.railwayDataService.getSignalById(signalId);
    if (!signal) {
      return { success: false, message: '信号机不存在' };
    }

    const permissionCheck = this.authService.canOperateSignal(signalId, signal.stationId);
    if (!permissionCheck.allowed) {
      this.triggerPermissionAlert(`越权操作：信号机「${signal.name}」`, permissionCheck.reason || '无权限');
      this.authService.recordViolation('manual_signal', 'canManualSignal', signalId, signal.name, permissionCheck.reason || '无权限');
      this.recordAuditWithResult('manual_signal', signalId, signal.name, 'signal', 'blocked', { signalId, state }, permissionCheck.reason);
      return { success: false, message: permissionCheck.reason };
    }

    const conflictCheck = this.auditService.checkConcurrentConflict(signalId, signal.name, 'signal', 'manual_signal');
    if (conflictCheck.conflict) {
      this.recordAuditWithResult('manual_signal', signalId, signal.name, 'signal', 'blocked', { signalId, state }, conflictCheck.reason);
      return { success: false, message: conflictCheck.reason };
    }

    if (this.approvalService.requiresApproval('manual_signal')) {
      const approvalResult = this.approvalService.submitForApproval({
        actionType: 'manual_signal',
        targetId: signalId,
        targetName: signal.name,
        targetType: 'signal',
        actionData: { signalId, signalName: signal.name, state },
      });
      if (approvalResult.success && approvalResult.approval) {
        this.recordAuditWithResult('manual_signal', signalId, signal.name, 'signal', 'pending_approval', { signalId, state, approvalId: approvalResult.approval.id });
        this.auditService.releaseOperation(signalId, 'signal');
        return { success: false, pendingApproval: approvalResult.approval, message: '操作已提交审批，请等待批准' };
      }
    }

    return this.setSignalManualInternal(signalId, state, false);
  }

  private setSignalManualInternal(signalId: string, state: 'clear' | 'stop', fromApproval: boolean): { success: boolean; message?: string } {
    const signal = this.railwayDataService.getSignalById(signalId);
    const signalName = signal?.name || signalId;

    if (state === 'clear') {
      const safetyCheck = this.faultSimulationService.checkOperationSafety('signal_clear', {
        signalId,
      });
      if (!safetyCheck.safe) {
        const conflict: ConflictAlert = {
          message: safetyCheck.reason || '信号开放失败',
          type: 'invalid_route',
        };
        this.triggerFaultViolation(conflict);
        this.recordAuditWithResult('manual_signal', signalId, signalName, 'signal', 'failed', { signalId, state }, safetyCheck.reason);
        this.auditService.releaseOperation(signalId, 'signal');
        return { success: false, message: safetyCheck.reason };
      }
    }

    const result = this.routeControlService.setSignalManual(signalId, state);

    if (result.success) {
      const currentDispatcher = this.authService.getCurrentDispatcher();
      const event: SimulationEvent = {
        timestamp: this.stateSubject.value.currentTime,
        type: 'manual_signal',
        data: { signalId, state },
      };
      this.addEvent(event);

      this.addDispatcherAction({
        type: 'manual_signal',
        data: { signalId, state },
        operator: currentDispatcher?.realName || 'dispatcher',
      });

      this.recordAuditWithResult('manual_signal', signalId, signalName, 'signal', 'success', {
        signalId,
        state,
        fromApproval,
      });

      this.checkWaitingTrains();
    } else {
      this.recordAuditWithResult('manual_signal', signalId, signalName, 'signal', 'failed', { signalId, state }, result.message);
    }

    this.auditService.releaseOperation(signalId, 'signal');
    return result;
  }

  setSwitchPosition(switchId: string, position: 'normal' | 'reverse'): { success: boolean; message?: string; pendingApproval?: OperationApproval } {
    const sw = this.railwayDataService.getSwitchById(switchId);
    if (!sw) {
      return { success: false, message: '道岔不存在' };
    }
    if (sw.isLocked) {
      return { success: false, message: '道岔已锁闭' };
    }

    const permissionCheck = this.authService.canOperateSwitch(switchId, sw.stationId);
    if (!permissionCheck.allowed) {
      this.triggerPermissionAlert(`越权操作：道岔「${sw.name}」`, permissionCheck.reason || '无权限');
      this.authService.recordViolation('switch_position', 'canSwitchPosition', switchId, sw.name, permissionCheck.reason || '无权限');
      this.recordAuditWithResult('switch_position', switchId, sw.name, 'switch', 'blocked', { switchId, position }, permissionCheck.reason);
      return { success: false, message: permissionCheck.reason };
    }

    const conflictCheck = this.auditService.checkConcurrentConflict(switchId, sw.name, 'switch', 'switch_position');
    if (conflictCheck.conflict) {
      this.recordAuditWithResult('switch_position', switchId, sw.name, 'switch', 'blocked', { switchId, position }, conflictCheck.reason);
      return { success: false, message: conflictCheck.reason };
    }

    if (this.approvalService.requiresApproval('switch_position')) {
      const approvalResult = this.approvalService.submitForApproval({
        actionType: 'switch_position',
        targetId: switchId,
        targetName: sw.name,
        targetType: 'switch',
        actionData: { switchId, switchName: sw.name, position },
      });
      if (approvalResult.success && approvalResult.approval) {
        this.recordAuditWithResult('switch_position', switchId, sw.name, 'switch', 'pending_approval', { switchId, position, approvalId: approvalResult.approval.id });
        this.auditService.releaseOperation(switchId, 'switch');
        return { success: false, pendingApproval: approvalResult.approval, message: '操作已提交审批，请等待批准' };
      }
    }

    return this.setSwitchPositionInternal(switchId, position, false);
  }

  private setSwitchPositionInternal(switchId: string, position: 'normal' | 'reverse', fromApproval: boolean): { success: boolean; message?: string } {
    const sw = this.railwayDataService.getSwitchById(switchId);
    if (!sw || sw.isLocked) {
      this.auditService.releaseOperation(switchId, 'switch');
      return { success: false, message: sw?.isLocked ? '道岔已锁闭' : '道岔不存在' };
    }
    const switchName = sw.name;

    const safetyCheck = this.faultSimulationService.checkOperationSafety('switch_change', {
      switchId,
    });
    if (!safetyCheck.safe) {
      const conflict: ConflictAlert = {
        message: safetyCheck.reason || '道岔操作失败',
        type: 'invalid_route',
      };
      this.triggerFaultViolation(conflict);
      this.recordAuditWithResult('switch_position', switchId, switchName, 'switch', 'failed', { switchId, position }, safetyCheck.reason);
      this.auditService.releaseOperation(switchId, 'switch');
      return { success: false, message: safetyCheck.reason };
    }

    this.railwayDataService.updateSwitch({
      ...sw,
      position,
    });

    const currentDispatcher = this.authService.getCurrentDispatcher();
    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'switch_change',
      data: { switchId, position, switchName },
    };
    this.addEvent(event);

    this.addDispatcherAction({
      type: 'switch_position',
      data: { switchId, position },
      operator: currentDispatcher?.realName || 'dispatcher',
    });

    this.recordAuditWithResult('switch_position', switchId, switchName, 'switch', 'success', {
      switchId,
      position,
      fromApproval,
    });

    this.auditService.releaseOperation(switchId, 'switch');
    return { success: true };
  }

  requestBlock(fromStationId: string, toStationId: string, trainId?: string): { request?: BlockRequest; success: boolean; message?: string } {
    if (!this.authService.hasPermission('canBlockRequest')) {
      this.triggerPermissionAlert('越权操作：闭塞请求', '无闭塞请求权限');
      this.authService.recordViolation('block_request', 'canBlockRequest', `${fromStationId}→${toStationId}`, '闭塞请求', '无闭塞请求权限');
      return { success: false, message: '无闭塞请求权限' };
    }

    const permissionCheck = this.authService.canOperateBlockSection(
      'virtual_' + fromStationId + '_' + toStationId,
      fromStationId,
      toStationId
    );
    if (!permissionCheck.allowed) {
      this.triggerPermissionAlert('越权操作：闭塞请求', permissionCheck.reason || '无权限');
      this.authService.recordViolation('block_request', 'canBlockRequest', `${fromStationId}→${toStationId}`, '闭塞请求', permissionCheck.reason || '无权限');
      return { success: false, message: permissionCheck.reason };
    }

    const currentDispatcher = this.authService.getCurrentDispatcher();
    const request: BlockRequest = {
      id: `REQ${this.nextRequestId++}`,
      fromStationId,
      toStationId,
      trainId,
      status: 'pending',
      timestamp: this.stateSubject.value.currentTime,
    };

    const requests = [...this.blockRequestsSubject.value, request];
    this.blockRequestsSubject.next(requests);

    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'block_request',
      data: { requestId: request.id, fromStationId, toStationId, trainId },
    };
    this.addEvent(event);

    this.addDispatcherAction({
      type: 'block_request',
      data: { requestId: request.id, fromStationId, toStationId, trainId },
      operator: currentDispatcher?.realName || 'station',
    });

    this.recordAuditWithResult(
      'block_request',
      request.id,
      `${fromStationId}→${toStationId}`,
      'block',
      'success',
      { requestId: request.id, fromStationId, toStationId, trainId }
    );

    return { request, success: true };
  }

  confirmBlockRequest(requestId: string, confirm: boolean): { success: boolean; message?: string; pendingApproval?: OperationApproval } {
    const requests = this.blockRequestsSubject.value;
    const request = requests.find(r => r.id === requestId);
    if (!request || request.status !== 'pending') {
      return { success: false, message: '请求不存在或状态不允许' };
    }

    const confirmPermission = this.authService.canConfirmBlockRequest();
    if (!confirmPermission.allowed && confirm) {
      this.triggerPermissionAlert(`越权操作：确认闭塞请求 ${requestId}`, confirmPermission.reason || '无权限');
      this.authService.recordViolation('block_confirm', 'canBlockConfirm', requestId, `${request.fromStationId}→${request.toStationId}`, confirmPermission.reason || '无权限');
      this.recordAuditWithResult('block_confirm', requestId, `${request.fromStationId}→${request.toStationId}`, 'block', 'blocked', { requestId, confirm }, confirmPermission.reason);
      return { success: false, message: confirmPermission.reason };
    }

    const conflictCheck = this.auditService.checkConcurrentConflict(requestId, `${request.fromStationId}→${request.toStationId}`, 'block', 'block_confirm');
    if (conflictCheck.conflict) {
      this.recordAuditWithResult('block_confirm', requestId, `${request.fromStationId}→${request.toStationId}`, 'block', 'blocked', { requestId, confirm }, conflictCheck.reason);
      return { success: false, message: conflictCheck.reason };
    }

    if (this.approvalService.requiresApproval('block_confirm') && confirm) {
      const approvalResult = this.approvalService.submitForApproval({
        actionType: 'block_confirm',
        targetId: requestId,
        targetName: `${request.fromStationId}→${request.toStationId}`,
        targetType: 'block',
        actionData: { requestId, confirm, fromStationId: request.fromStationId, toStationId: request.toStationId },
      });
      if (approvalResult.success && approvalResult.approval) {
        this.recordAuditWithResult('block_confirm', requestId, `${request.fromStationId}→${request.toStationId}`, 'block', 'pending_approval', { requestId, confirm, approvalId: approvalResult.approval.id });
        this.auditService.releaseOperation(requestId, 'block');
        return { success: false, pendingApproval: approvalResult.approval, message: '操作已提交审批，请等待批准' };
      }
    }

    return this.confirmBlockRequestInternal(requestId, confirm, false);
  }

  private confirmBlockRequestInternal(requestId: string, confirm: boolean, fromApproval: boolean): { success: boolean; message?: string } {
    const requests = this.blockRequestsSubject.value;
    const request = requests.find(r => r.id === requestId);
    if (!request || request.status !== 'pending') {
      this.auditService.releaseOperation(requestId, 'block');
      return { success: false, message: '请求不存在或状态不允许' };
    }

    request.status = confirm ? 'confirmed' : 'rejected';
    this.blockRequestsSubject.next([...requests]);

    const currentDispatcher = this.authService.getCurrentDispatcher();
    const event: SimulationEvent = {
      timestamp: this.stateSubject.value.currentTime,
      type: 'block_confirm',
      data: { requestId, confirmed: confirm },
    };
    this.addEvent(event);

    this.addDispatcherAction({
      type: 'block_confirm',
      data: { requestId, confirmed: confirm },
      operator: currentDispatcher?.realName || 'dispatcher',
    });

    this.recordAuditWithResult('block_confirm', requestId, `${request.fromStationId}→${request.toStationId}`, 'block', 'success', {
      requestId,
      confirm,
      fromApproval,
    });

    if (confirm && request.trainId) {
      const train = this.railwayDataService.getTrainById(request.trainId);
      if (train && train.state === 'waiting') {
        this.tryMoveTrainToNextBlock(request.trainId);
      }
    }

    this.auditService.releaseOperation(requestId, 'block');
    return { success: true };
  }

  private addDispatcherAction(action: Omit<DispatcherAction, 'id' | 'timestamp'>): void {
    const newAction: DispatcherAction = {
      ...action,
      id: `ACT${this.nextActionId++}`,
      timestamp: this.stateSubject.value.currentTime,
    };
    const actions = [...this.dispatcherActionsSubject.value, newAction];
    this.dispatcherActionsSubject.next(actions);
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
    this.routeControlService.resetAll();
    this.faultSimulationService.reset();
    this.authService.reset();
    this.approvalService.reset();
    this.auditService.reset();
    this.shiftHandoverService.reset();
    this.eventsSubject.next([]);
    this.dispatcherActionsSubject.next([]);
    this.blockRequestsSubject.next([]);
    this.permissionAlertSubject.next(null);

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
    this.routeControlService.resetAll();
    this.faultSimulationService.reset();

    this.stateSubject.next({
      currentTime: 0,
      isRunning: true,
      isPaused: false,
      speedMultiplier: 1,
      mode: 'playback',
      conflictAlert: undefined,
    });

    this.playbackService.seekTo(0);
    const initialState = this.playbackService.getStateAtTime(0);
    if (initialState) {
      this.railwayDataService.setTrains(initialState.trains);
      this.railwayDataService.setBlockSections(initialState.blocks);
      this.railwayDataService.setSignals(initialState.signals);
      if (initialState.switches) this.railwayDataService.setSwitches(initialState.switches);
      if (initialState.routes) this.routeControlService.setRoutes(initialState.routes);
      if (initialState.dispatcherActions)
        this.dispatcherActionsSubject.next(initialState.dispatcherActions);
      if (initialState.faultState)
        this.faultSimulationService.setState(initialState.faultState);
    }

    this.startSimulationLoop();
  }

  private tickPlayback(deltaSeconds: number): void {
    const state = this.stateSubject.value;
    const newTime = state.currentTime + deltaSeconds * state.speedMultiplier;

    const recording = this.playbackService.getStateAtTime(newTime);

    if (recording) {
      const { trains, blocks, signals, switches, routes, dispatcherActions, faultState } = recording;
      this.railwayDataService.setTrains(trains);
      this.railwayDataService.setBlockSections(blocks);
      this.railwayDataService.setSignals(signals);
      if (switches) this.railwayDataService.setSwitches(switches);
      if (routes) this.routeControlService.setRoutes(routes);
      if (dispatcherActions) this.dispatcherActionsSubject.next(dispatcherActions);
      if (faultState) this.faultSimulationService.setState(faultState);
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
        if (recording.switches) this.railwayDataService.setSwitches(recording.switches);
        if (recording.routes) this.routeControlService.setRoutes(recording.routes);
        if (recording.dispatcherActions)
          this.dispatcherActionsSubject.next(recording.dispatcherActions);
        if (recording.faultState)
          this.faultSimulationService.setState(recording.faultState);
      }
      this.stateSubject.next({
        ...state,
        currentTime: clampedTime,
        conflictAlert: undefined,
      });
    } else if (state.mode === 'live') {
      this.stateSubject.next({
        ...state,
        currentTime: clampedTime,
      });
    }
  }

  switchToLive(): void {
    this.stop();
    this.railwayDataService.resetAll();
    this.routeControlService.resetAll();
    this.faultSimulationService.reset();

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
