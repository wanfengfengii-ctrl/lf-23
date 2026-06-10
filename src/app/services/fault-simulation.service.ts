import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Fault,
  FaultType,
  FaultSeverity,
  FaultStatus,
  FaultAction,
  FaultActionType,
  SpeedRestriction,
  BlockedSection,
  EmergencyLogEntry,
  FaultSimulationState,
  BlockSection,
  Signal,
  Switch,
  Train,
  ConflictAlert,
} from '../models/railway.model';
import { RailwayDataService } from './railway-data.service';

export interface SequenceViolation {
  faultId: string;
  attemptedAction: string;
  reason: string;
  requiredStatus: FaultStatus;
  currentStatus: FaultStatus;
}

@Injectable({
  providedIn: 'root',
})
export class FaultSimulationService {
  private stateSubject = new BehaviorSubject<FaultSimulationState>({
    faults: [],
    faultActions: [],
    emergencyLog: [],
    blockedSections: [],
    speedRestrictions: [],
    isRandomFaultsEnabled: false,
    randomFaultInterval: 30,
  });
  state$: Observable<FaultSimulationState> = this.stateSubject.asObservable();

  private sequenceViolationSubject = new BehaviorSubject<SequenceViolation | null>(null);
  sequenceViolation$: Observable<SequenceViolation | null> = this.sequenceViolationSubject.asObservable();

  private nextFaultId = 1;
  private nextActionId = 1;
  private nextLogId = 1;
  private lastRandomFaultTime = 0;

  constructor(private railwayDataService: RailwayDataService) {}

  getState(): FaultSimulationState {
    return this.stateSubject.value;
  }

  getFaults(): Fault[] {
    return this.stateSubject.value.faults;
  }

  getActiveFaults(): Fault[] {
    return this.stateSubject.value.faults.filter(f => f.status !== 'resolved');
  }

  getFaultById(faultId: string): Fault | undefined {
    return this.stateSubject.value.faults.find(f => f.id === faultId);
  }

  getFaultActions(): FaultAction[] {
    return this.stateSubject.value.faultActions;
  }

  getEmergencyLog(): EmergencyLogEntry[] {
    return this.stateSubject.value.emergencyLog;
  }

  getBlockedSections(): BlockedSection[] {
    return this.stateSubject.value.blockedSections;
  }

  getSpeedRestrictions(): SpeedRestriction[] {
    return this.stateSubject.value.speedRestrictions;
  }

  isSectionBlocked(blockSectionId: string): boolean {
    return this.stateSubject.value.blockedSections.some(
      bs => bs.blockSectionId === blockSectionId
    );
  }

  getSpeedRestrictionForBlock(blockSectionId: string): SpeedRestriction | undefined {
    return this.stateSubject.value.speedRestrictions.find(
      sr => sr.blockSectionId === blockSectionId
    );
  }

  isSignalFaulty(signalId: string): boolean {
    return this.getActiveFaults().some(
      f => f.type === 'signal_fault' && f.targetId === signalId
    );
  }

  isSwitchJammed(switchId: string): boolean {
    return this.getActiveFaults().some(
      f => f.type === 'switch_jammed' && f.targetId === switchId
    );
  }

  isTrainInEmergencyStop(trainId: string): boolean {
    return this.getActiveFaults().some(
      f => f.type === 'train_emergency_stop' && f.targetId === trainId
    );
  }

  hasBlockOccupancyAnomaly(blockSectionId: string): boolean {
    return this.getActiveFaults().some(
      f => f.type === 'block_occupancy_anomaly' && f.targetId === blockSectionId
    );
  }

  triggerSignalFault(signalId: string, isRandom: boolean = false): Fault | null {
    const signal = this.railwayDataService.getSignalById(signalId);
    if (!signal) return null;

    const existingFaults = this.getActiveFaults();
    const hasExistingFault = existingFaults.some(
      f => f.type === 'signal_fault' && f.targetId === signalId
    );
    if (hasExistingFault) return null;

    const affectedBlocks = this.getAffectedBlocksForSignal(signalId);
    const affectedTrains = this.getAffectedTrainsForBlocks(affectedBlocks);

    const fault: Fault = {
      id: `F${this.nextFaultId++}`,
      type: 'signal_fault',
      severity: 'major',
      status: 'active',
      targetId: signalId,
      targetName: signal.name,
      description: `信号机「${signal.name}」发生故障，信号显示异常`,
      startTime: this.getCurrentTime(),
      affectedBlockIds: affectedBlocks,
      affectedTrainIds: affectedTrains,
      isRandom,
    };

    this.addFault(fault);
    this.applySignalFaultEffect(signalId);
    this.addEmergencyLog('fault', `信号机故障：${signal.name} 信号显示异常，信号已强制关闭`, { signalId });
    this.addFaultAction(fault.id, 'fault_trigger', fault.type, { signalId, signalName: signal.name });

    return fault;
  }

  triggerSwitchJammed(switchId: string, isRandom: boolean = false): Fault | null {
    const sw = this.railwayDataService.getSwitchById(switchId);
    if (!sw) return null;

    const existingFaults = this.getActiveFaults();
    const hasExistingFault = existingFaults.some(
      f => f.type === 'switch_jammed' && f.targetId === switchId
    );
    if (hasExistingFault) return null;

    const affectedBlocks = [sw.normalBlockId, sw.reverseBlockId, sw.commonBlockId].filter(
      (id): id is string => !!id
    );
    const affectedTrains = this.getAffectedTrainsForBlocks(affectedBlocks);

    const fault: Fault = {
      id: `F${this.nextFaultId++}`,
      type: 'switch_jammed',
      severity: 'critical',
      status: 'active',
      targetId: switchId,
      targetName: sw.name,
      description: `道岔「${sw.name}」发生卡阻，无法转换位置`,
      startTime: this.getCurrentTime(),
      affectedBlockIds: affectedBlocks,
      affectedTrainIds: affectedTrains,
      isRandom,
    };

    this.addFault(fault);
    this.applySwitchJammedEffect(switchId);
    this.addEmergencyLog('fault', `道岔卡阻：${sw.name} 无法转换，道岔已锁定`, { switchId });
    this.addFaultAction(fault.id, 'fault_trigger', fault.type, { switchId, switchName: sw.name });

    return fault;
  }

  triggerBlockOccupancyAnomaly(blockSectionId: string, isRandom: boolean = false): Fault | null {
    const block = this.railwayDataService.getBlockSectionById(blockSectionId);
    if (!block) return null;

    const existingFaults = this.getActiveFaults();
    const hasExistingFault = existingFaults.some(
      f => f.type === 'block_occupancy_anomaly' && f.targetId === blockSectionId
    );
    if (hasExistingFault) return null;

    const affectedTrains = this.getAffectedTrainsForBlocks([blockSectionId]);

    const fault: Fault = {
      id: `F${this.nextFaultId++}`,
      type: 'block_occupancy_anomaly',
      severity: 'critical',
      status: 'active',
      targetId: blockSectionId,
      targetName: block.name,
      description: `区间「${block.name}」出现占用异常，轨道电路显示异常`,
      startTime: this.getCurrentTime(),
      affectedBlockIds: [blockSectionId],
      affectedTrainIds: affectedTrains,
      isRandom,
    };

    this.addFault(fault);
    this.applyBlockAnomalyEffect(blockSectionId);
    this.addEmergencyLog('fault', `区间占用异常：${block.name} 轨道电路异常，区间显示占用`, { blockSectionId });
    this.addFaultAction(fault.id, 'fault_trigger', fault.type, { blockSectionId, blockName: block.name });

    return fault;
  }

  triggerTrainEmergencyStop(trainId: string, isRandom: boolean = false): Fault | null {
    const train = this.railwayDataService.getTrainById(trainId);
    if (!train) return null;

    const existingFaults = this.getActiveFaults();
    const hasExistingFault = existingFaults.some(
      f => f.type === 'train_emergency_stop' && f.targetId === trainId
    );
    if (hasExistingFault) return null;

    const affectedBlocks = train.currentBlockSectionId ? [train.currentBlockSectionId] : [];

    const fault: Fault = {
      id: `F${this.nextFaultId++}`,
      type: 'train_emergency_stop',
      severity: 'major',
      status: 'active',
      targetId: trainId,
      targetName: train.name,
      description: `列车「${train.name}」临时停车，原因待查`,
      startTime: this.getCurrentTime(),
      affectedBlockIds: affectedBlocks,
      affectedTrainIds: [trainId],
      isRandom,
    };

    this.addFault(fault);
    this.applyTrainEmergencyStopEffect(trainId);
    this.addEmergencyLog('fault', `列车临时停车：${train.name} 紧急制动`, { trainId });
    this.addFaultAction(fault.id, 'fault_trigger', fault.type, { trainId, trainName: train.name });

    return fault;
  }

  acknowledgeFault(faultId: string): { success: boolean; violation?: SequenceViolation } {
    const state = this.stateSubject.value;
    const fault = state.faults.find(f => f.id === faultId);

    if (!fault) {
      return { success: false };
    }

    if (fault.status !== 'active') {
      const violation: SequenceViolation = {
        faultId,
        attemptedAction: 'fault_acknowledge',
        reason: '故障已确认或已处理，不能重复确认',
        requiredStatus: 'active',
        currentStatus: fault.status,
      };
      this.sequenceViolationSubject.next(violation);
      this.addEmergencyLog('warning', `操作违规：尝试确认非活动故障「${fault.description}」`, { faultId, violation });
      return { success: false, violation };
    }

    const updatedFault: Fault = {
      ...fault,
      status: 'acknowledged',
      acknowledgeTime: this.getCurrentTime(),
    };

    const updatedFaults = state.faults.map(f =>
      f.id === faultId ? updatedFault : f
    );

    this.stateSubject.next({
      ...state,
      faults: updatedFaults,
    });

    this.addEmergencyLog('action', `故障确认：${fault.description}`, { faultId });
    this.addFaultAction(faultId, 'fault_acknowledge', fault.type, {});
    this.sequenceViolationSubject.next(null);

    return { success: true };
  }

  blockSection(faultId: string, blockSectionId: string): { success: boolean; violation?: SequenceViolation } {
    const state = this.stateSubject.value;
    const fault = state.faults.find(f => f.id === faultId);

    if (!fault) {
      return { success: false };
    }

    if (fault.status === 'resolved') {
      return { success: false };
    }

    if (fault.status !== 'active' && fault.status !== 'acknowledged' && fault.status !== 'blocked') {
      const violation: SequenceViolation = {
        faultId,
        attemptedAction: 'block_section',
        reason: '故障未确认，应先确认故障再封锁区间',
        requiredStatus: 'acknowledged',
        currentStatus: fault.status,
      };
      this.sequenceViolationSubject.next(violation);
      this.addEmergencyLog('warning', `操作违规：尝试封锁区间但故障「${fault.description}」未确认`, { faultId, violation });
      return { success: false, violation };
    }

    if (this.isSectionBlocked(blockSectionId)) return { success: false };

    const block = this.railwayDataService.getBlockSectionById(blockSectionId);
    if (!block) return { success: false };

    const blockedSection: BlockedSection = {
      blockSectionId,
      faultId,
      blockedAt: this.getCurrentTime(),
      reason: fault.description,
    };

    const updatedBlockedSections = [...state.blockedSections, blockedSection];

    let updatedStatus: FaultStatus = fault.status;
    if (fault.status === 'acknowledged' || fault.status === 'active') {
      updatedStatus = 'blocked';
    }

    const updatedFault: Fault = {
      ...fault,
      status: updatedStatus,
    };

    const updatedFaults = state.faults.map(f =>
      f.id === faultId ? updatedFault : f
    );

    this.stateSubject.next({
      ...state,
      faults: updatedFaults,
      blockedSections: updatedBlockedSections,
    });

    this.addEmergencyLog('action', `区间封锁：${block.name} 已封锁`, { faultId, blockSectionId });
    this.addFaultAction(faultId, 'block_section', fault.type, { blockSectionId, blockName: block.name });
    this.sequenceViolationSubject.next(null);

    return { success: true };
  }

  unblockSection(faultId: string, blockSectionId: string): boolean {
    const state = this.stateSubject.value;
    const fault = state.faults.find(f => f.id === faultId);
    if (!fault || fault.status === 'resolved') return false;

    const blockedSection = state.blockedSections.find(
      bs => bs.blockSectionId === blockSectionId && bs.faultId === faultId
    );
    if (!blockedSection) return false;

    const block = this.railwayDataService.getBlockSectionById(blockSectionId);

    const updatedBlockedSections = state.blockedSections.filter(
      bs => !(bs.blockSectionId === blockSectionId && bs.faultId === faultId)
    );

    this.stateSubject.next({
      ...state,
      blockedSections: updatedBlockedSections,
    });

    this.addEmergencyLog('action', `区间解封：${block?.name || blockSectionId} 已解除封锁`, { faultId, blockSectionId });
    this.addFaultAction(faultId, 'unblock_section', fault.type, { blockSectionId });

    return true;
  }

  setSpeedRestriction(blockSectionId: string, maxSpeed: number, reason: string, faultId: string): boolean {
    const state = this.stateSubject.value;
    const block = this.railwayDataService.getBlockSectionById(blockSectionId);
    if (!block) return false;

    const existingRestriction = state.speedRestrictions.find(
      sr => sr.blockSectionId === blockSectionId
    );
    if (existingRestriction) return false;

    const fault = this.getFaultById(faultId);
    const faultType = fault ? fault.type : 'signal_fault';

    const restriction: SpeedRestriction = {
      blockSectionId,
      maxSpeed,
      reason,
      startTime: this.getCurrentTime(),
    };

    const updatedRestrictions = [...state.speedRestrictions, restriction];

    this.stateSubject.next({
      ...state,
      speedRestrictions: updatedRestrictions,
    });

    this.addEmergencyLog('action', `限速设置：${block.name} 限速 ${maxSpeed} km/h`, { faultId, blockSectionId, maxSpeed });
    this.addFaultAction(faultId, 'speed_restriction', faultType, { blockSectionId, maxSpeed });

    return true;
  }

  liftSpeedRestriction(blockSectionId: string, faultId: string): boolean {
    const state = this.stateSubject.value;
    const restriction = state.speedRestrictions.find(
      sr => sr.blockSectionId === blockSectionId
    );
    if (!restriction) return false;

    const block = this.railwayDataService.getBlockSectionById(blockSectionId);
    const fault = this.getFaultById(faultId);
    const faultType = fault ? fault.type : 'signal_fault';

    const updatedRestrictions = state.speedRestrictions.filter(
      sr => sr.blockSectionId !== blockSectionId
    );

    this.stateSubject.next({
      ...state,
      speedRestrictions: updatedRestrictions,
    });

    this.addEmergencyLog('action', `解除限速：${block?.name || blockSectionId} 恢复正常速度`, { faultId, blockSectionId });
    this.addFaultAction(faultId, 'lift_speed_restriction', faultType, { blockSectionId });

    return true;
  }

  recordManualRouteSetup(faultId: string, routeId: string, routeName: string): void {
    const fault = this.getFaultById(faultId);
    if (!fault) return;

    this.addEmergencyLog('action', `人工办理进路：${routeName}`, { faultId, routeId });
    this.addFaultAction(faultId, 'manual_route_setup', fault.type, { routeId, routeName });
  }

  resolveFault(faultId: string): { success: boolean; conflict?: ConflictAlert; violation?: SequenceViolation } {
    const state = this.stateSubject.value;
    const fault = state.faults.find(f => f.id === faultId);

    if (!fault || fault.status === 'resolved') {
      return { success: false };
    }

    if (fault.status === 'active') {
      const violation: SequenceViolation = {
        faultId,
        attemptedAction: 'fault_resolve',
        reason: '故障未确认，应先确认故障、封锁区间后再解除',
        requiredStatus: 'blocked',
        currentStatus: fault.status,
      };
      this.sequenceViolationSubject.next(violation);
      this.addEmergencyLog('warning', `操作违规：尝试解除未确认的故障「${fault.description}」`, { faultId, violation });
      return { success: false, violation };
    }

    if (fault.status === 'acknowledged') {
      const hasBlockedAnyAffected = state.blockedSections.some(
        bs => bs.faultId === faultId
      );
      if (!hasBlockedAnyAffected && fault.affectedBlockIds.length > 0) {
        const violation: SequenceViolation = {
          faultId,
          attemptedAction: 'fault_resolve',
          reason: '故障已确认但尚未封锁受影响区间，应先封锁区间',
          requiredStatus: 'blocked',
          currentStatus: fault.status,
        };
        this.sequenceViolationSubject.next(violation);
        this.addEmergencyLog('warning', `操作违规：尝试解除故障但未封锁受影响区间「${fault.description}」`, { faultId, violation });
        return { success: false, violation };
      }
    }

    const relatedBlockedSections = state.blockedSections.filter(
      bs => bs.faultId === faultId
    );
    const trainsInBlockedSections = this.getTrainsInBlockedSections(relatedBlockedSections);

    if (trainsInBlockedSections.length > 0) {
      const trainNames = trainsInBlockedSections.map(t => t.name).join('、');
      return {
        success: false,
        conflict: {
          message: `故障解除失败：封锁区间内仍有列车（${trainNames}），请先确保列车已安全通过`,
          type: 'invalid_route',
        },
      };
    }

    const updatedFault: Fault = {
      ...fault,
      status: 'resolved',
      resolveTime: this.getCurrentTime(),
    };

    const updatedFaults = state.faults.map(f =>
      f.id === faultId ? updatedFault : f
    );

    const updatedBlockedSections = state.blockedSections.filter(
      bs => bs.faultId !== faultId
    );

    const updatedSpeedRestrictions = state.speedRestrictions.filter(sr => {
      const isFaultRelated = fault.affectedBlockIds.includes(sr.blockSectionId);
      return !isFaultRelated;
    });

    this.stateSubject.next({
      ...state,
      faults: updatedFaults,
      blockedSections: updatedBlockedSections,
      speedRestrictions: updatedSpeedRestrictions,
    });

    this.removeFaultEffects(fault);
    this.addEmergencyLog('info', `故障解除：${fault.description}`, { faultId });
    this.addFaultAction(faultId, 'fault_resolve', fault.type, {});
    this.sequenceViolationSubject.next(null);

    return { success: true };
  }

  checkOperationSafety(
    operationType: string,
    data: any
  ): { safe: boolean; reason?: string } {
    const state = this.stateSubject.value;
    const activeFaults = this.getActiveFaults();

    if (activeFaults.length === 0) {
      return { safe: true };
    }

    switch (operationType) {
      case 'train_enter_block': {
        const blockId = data.blockSectionId;
        if (this.isSectionBlocked(blockId)) {
          return {
            safe: false,
            reason: `禁止通行：该区间已被封锁，请先解除封锁`,
          };
        }
        const hasAnomaly = activeFaults.find(
          f => f.type === 'block_occupancy_anomaly' && f.targetId === blockId && f.status !== 'resolved'
        );
        if (hasAnomaly) {
          return {
            safe: false,
            reason: `禁止通行：区间存在占用异常，禁止列车进入`,
          };
        }
        return { safe: true };
      }

      case 'set_route': {
        const blockIds = data.blockSectionIds || [];
        for (const blockId of blockIds) {
          if (this.isSectionBlocked(blockId)) {
            return {
              safe: false,
              reason: `进路排列失败：包含被封锁的区间`,
            };
          }
          const hasAnomaly = activeFaults.find(
            f => f.type === 'block_occupancy_anomaly' && f.targetId === blockId && f.status !== 'resolved'
          );
          if (hasAnomaly) {
            return {
              safe: false,
              reason: `进路排列失败：区间「${hasAnomaly.targetName}」占用异常`,
            };
          }
        }

        const relatedSwitchIds = data.switchIds || [];
        for (const switchId of relatedSwitchIds) {
          const jammedFault = activeFaults.find(
            f => f.type === 'switch_jammed' && f.targetId === switchId && f.status !== 'resolved'
          );
          if (jammedFault) {
            return {
              safe: false,
              reason: `进路排列失败：道岔「${jammedFault.targetName}」卡阻`,
            };
          }
        }

        return { safe: true };
      }

      case 'signal_clear': {
        const fault = activeFaults.find(
          f => f.type === 'signal_fault' && f.targetId === data.signalId && f.status !== 'resolved'
        );
        if (fault) {
          return {
            safe: false,
            reason: `信号开放失败：信号机故障`,
          };
        }
        return { safe: true };
      }

      case 'switch_change': {
        const fault = activeFaults.find(
          f => f.type === 'switch_jammed' && f.targetId === data.switchId && f.status !== 'resolved'
        );
        if (fault) {
          return {
            safe: false,
            reason: `道岔操作失败：道岔「${fault.targetName}」卡阻`,
          };
        }
        return { safe: true };
      }

      case 'train_depart': {
        const trainId = data.trainId;
        const fault = activeFaults.find(
          f => f.type === 'train_emergency_stop' && f.targetId === trainId && f.status !== 'resolved'
        );
        if (fault) {
          return {
            safe: false,
            reason: `列车放行失败：列车「${fault.targetName}」处于紧急停车状态，故障未解除`,
          };
        }

        if (data.blockSectionId) {
          if (this.isSectionBlocked(data.blockSectionId)) {
            return {
              safe: false,
              reason: `列车放行失败：前方区间已被封锁`,
            };
          }
        }
        return { safe: true };
      }

      default:
        return { safe: true };
    }
  }

  checkFaultHandlingSequence(action: string, faultId: string): { valid: boolean; reason?: string } {
    const fault = this.getFaultById(faultId);
    if (!fault) {
      return { valid: false, reason: '故障不存在' };
    }

    switch (action) {
      case 'fault_acknowledge':
        if (fault.status !== 'active') {
          return { valid: false, reason: '故障已确认或已处理' };
        }
        return { valid: true };

      case 'block_section':
        if (fault.status !== 'active' && fault.status !== 'acknowledged' && fault.status !== 'blocked') {
          return { valid: false, reason: '应先确认故障再封锁区间' };
        }
        return { valid: true };

      case 'speed_restriction':
        if (fault.status === 'active') {
          return { valid: false, reason: '应先确认故障再设置限速' };
        }
        return { valid: true };

      case 'manual_route_setup':
        if (fault.status === 'active') {
          return { valid: false, reason: '应先确认故障再人工办理进路' };
        }
        return { valid: true };

      case 'fault_resolve':
        if (fault.status === 'resolved') {
          return { valid: false, reason: '故障已解除' };
        }
        if (fault.status === 'active') {
          return { valid: false, reason: '应先确认故障、封锁区间后再解除' };
        }
        return { valid: true };

      default:
        return { valid: true };
    }
  }

  dismissSequenceViolation(): void {
    this.sequenceViolationSubject.next(null);
  }

  getSequenceViolation(): SequenceViolation | null {
    return this.sequenceViolationSubject.value;
  }

  setRandomFaultsEnabled(enabled: boolean): void {
    const state = this.stateSubject.value;
    this.stateSubject.next({
      ...state,
      isRandomFaultsEnabled: enabled,
    });

    if (enabled) {
      this.lastRandomFaultTime = this.getCurrentTime();
      this.addEmergencyLog('info', '随机故障模式已启用', {});
    } else {
      this.addEmergencyLog('info', '随机故障模式已禁用', {});
    }
  }

  setRandomFaultInterval(interval: number): void {
    const state = this.stateSubject.value;
    this.stateSubject.next({
      ...state,
      randomFaultInterval: Math.max(10, interval),
    });
  }

  tick(currentTime: number): void {
    const state = this.stateSubject.value;
    if (!state.isRandomFaultsEnabled) return;

    if (currentTime - this.lastRandomFaultTime >= state.randomFaultInterval) {
      this.triggerRandomFault();
      this.lastRandomFaultTime = currentTime;
    }
  }

  applyFaultEffects(): void {
    const activeFaults = this.getActiveFaults();
    for (const fault of activeFaults) {
      switch (fault.type) {
        case 'signal_fault':
          this.applySignalFaultEffect(fault.targetId);
          break;
        case 'switch_jammed':
          this.applySwitchJammedEffect(fault.targetId);
          break;
        case 'block_occupancy_anomaly':
          this.applyBlockAnomalyEffect(fault.targetId);
          break;
        case 'train_emergency_stop':
          this.applyTrainEmergencyStopEffect(fault.targetId);
          break;
      }
    }
  }

  private applySignalFaultEffect(signalId: string): void {
    const signal = this.railwayDataService.getSignalById(signalId);
    if (!signal) return;
    if (signal.state === 'stop') return;
    this.railwayDataService.updateSignal({
      ...signal,
      state: 'stop',
      isManualMode: true,
    });
  }

  private applySwitchJammedEffect(switchId: string): void {
    const sw = this.railwayDataService.getSwitchById(switchId);
    if (!sw) return;
    if (sw.isLocked) return;
    this.railwayDataService.updateSwitch({
      ...sw,
      isLocked: true,
    });
  }

  private applyBlockAnomalyEffect(blockSectionId: string): void {
    const block = this.railwayDataService.getBlockSectionById(blockSectionId);
    if (!block) return;
    if (block.isOccupied) return;
    this.railwayDataService.updateBlockSection({
      ...block,
      isOccupied: true,
      occupiedByTrainId: undefined,
    });
  }

  private applyTrainEmergencyStopEffect(trainId: string): void {
    const train = this.railwayDataService.getTrainById(trainId);
    if (!train) return;
    if (train.state === 'stopped') return;
    this.railwayDataService.updateTrain({
      ...train,
      state: 'stopped',
      speed: 0,
    });
  }

  private removeFaultEffects(fault: Fault): void {
    switch (fault.type) {
      case 'signal_fault': {
        const signal = this.railwayDataService.getSignalById(fault.targetId);
        if (signal) {
          this.railwayDataService.updateSignal({
            ...signal,
            isManualMode: false,
          });
        }
        break;
      }
      case 'switch_jammed': {
        const sw = this.railwayDataService.getSwitchById(fault.targetId);
        if (sw) {
          const lockedByRoute = sw.lockedByRouteId;
          this.railwayDataService.updateSwitch({
            ...sw,
            isLocked: !!lockedByRoute,
          });
        }
        break;
      }
      case 'block_occupancy_anomaly': {
        const block = this.railwayDataService.getBlockSectionById(fault.targetId);
        if (block && !block.occupiedByTrainId) {
          this.railwayDataService.updateBlockSection({
            ...block,
            isOccupied: false,
          });
        }
        break;
      }
      case 'train_emergency_stop': {
        const train = this.railwayDataService.getTrainById(fault.targetId);
        if (train && train.state === 'stopped') {
          this.railwayDataService.updateTrain({
            ...train,
            state: 'waiting',
          });
        }
        break;
      }
    }
  }

  private triggerRandomFault(): void {
    const faultTypes: FaultType[] = [
      'signal_fault',
      'switch_jammed',
      'block_occupancy_anomaly',
      'train_emergency_stop',
    ];

    const randomType = faultTypes[Math.floor(Math.random() * faultTypes.length)];

    switch (randomType) {
      case 'signal_fault': {
        const signals = this.railwayDataService.getSignals();
        if (signals.length > 0) {
          const randomSignal = signals[Math.floor(Math.random() * signals.length)];
          this.triggerSignalFault(randomSignal.id, true);
        }
        break;
      }
      case 'switch_jammed': {
        const switches = this.railwayDataService.getSwitches();
        if (switches.length > 0) {
          const randomSwitch = switches[Math.floor(Math.random() * switches.length)];
          this.triggerSwitchJammed(randomSwitch.id, true);
        }
        break;
      }
      case 'block_occupancy_anomaly': {
        const blocks = this.railwayDataService.getBlockSections();
        if (blocks.length > 0) {
          const randomBlock = blocks[Math.floor(Math.random() * blocks.length)];
          this.triggerBlockOccupancyAnomaly(randomBlock.id, true);
        }
        break;
      }
      case 'train_emergency_stop': {
        const trains = this.railwayDataService.getTrains().filter(t => t.state === 'running');
        if (trains.length > 0) {
          const randomTrain = trains[Math.floor(Math.random() * trains.length)];
          this.triggerTrainEmergencyStop(randomTrain.id, true);
        }
        break;
      }
    }
  }

  private getAffectedBlocksForSignal(signalId: string): string[] {
    const signal = this.railwayDataService.getSignalById(signalId);
    if (!signal) return [];
    return [signal.blockSectionId];
  }

  private getAffectedTrainsForBlocks(blockIds: string[]): string[] {
    const trains = this.railwayDataService.getTrains();
    return trains
      .filter(t => t.currentBlockSectionId && blockIds.includes(t.currentBlockSectionId))
      .map(t => t.id);
  }

  private getTrainsInBlockedSections(blockedSections: BlockedSection[]): Train[] {
    const trains = this.railwayDataService.getTrains();
    const blockedIds = new Set(blockedSections.map(bs => bs.blockSectionId));
    return trains.filter(
      t => t.currentBlockSectionId && blockedIds.has(t.currentBlockSectionId)
    );
  }

  private addFault(fault: Fault): void {
    const state = this.stateSubject.value;
    const updatedFaults = [...state.faults, fault];
    this.stateSubject.next({
      ...state,
      faults: updatedFaults,
    });
  }

  private addFaultAction(
    faultId: string,
    type: FaultActionType,
    faultType: FaultType,
    data: any
  ): void {
    const state = this.stateSubject.value;
    const action: FaultAction = {
      id: `FA${this.nextActionId++}`,
      timestamp: this.getCurrentTime(),
      type,
      faultId,
      faultType,
      data,
      operator: 'dispatcher',
    };

    const updatedActions = [...state.faultActions, action];
    this.stateSubject.next({
      ...state,
      faultActions: updatedActions,
    });
  }

  private addEmergencyLog(
    category: 'fault' | 'action' | 'warning' | 'info',
    message: string,
    details?: any
  ): void {
    const state = this.stateSubject.value;
    const entry: EmergencyLogEntry = {
      id: `EL${this.nextLogId++}`,
      timestamp: this.getCurrentTime(),
      category,
      message,
      details,
      operator: 'dispatcher',
    };

    const updatedLog = [...state.emergencyLog, entry];
    this.stateSubject.next({
      ...state,
      emergencyLog: updatedLog,
    });
  }

  private getCurrentTime(): number {
    return Date.now() / 1000;
  }

  setState(state: FaultSimulationState): void {
    this.stateSubject.next(state);
  }

  reset(): void {
    this.stateSubject.next({
      faults: [],
      faultActions: [],
      emergencyLog: [],
      blockedSections: [],
      speedRestrictions: [],
      isRandomFaultsEnabled: false,
      randomFaultInterval: 30,
    });
    this.nextFaultId = 1;
    this.nextActionId = 1;
    this.nextLogId = 1;
    this.lastRandomFaultTime = 0;
    this.sequenceViolationSubject.next(null);
  }

  getAvailableTargetsForFaultType(type: FaultType): { id: string; name: string }[] {
    switch (type) {
      case 'signal_fault':
        return this.railwayDataService.getSignals().map(s => ({ id: s.id, name: s.name }));
      case 'switch_jammed':
        return this.railwayDataService.getSwitches().map(s => ({ id: s.id, name: s.name }));
      case 'block_occupancy_anomaly':
        return this.railwayDataService.getBlockSections().map(b => ({ id: b.id, name: b.name }));
      case 'train_emergency_stop':
        return this.railwayDataService
          .getTrains()
          .filter(t => t.state === 'running' || t.state === 'waiting')
          .map(t => ({ id: t.id, name: t.name }));
      default:
        return [];
    }
  }

  getFaultTimelineEvents(): { time: number; type: string; data: any }[] {
    const events: { time: number; type: string; data: any }[] = [];
    const actions = this.stateSubject.value.faultActions;
    for (const action of actions) {
      events.push({
        time: action.timestamp,
        type: `fault_${action.type}`,
        data: { faultId: action.faultId, faultType: action.faultType, actionType: action.type, actionData: action.data },
      });
    }
    return events;
  }
}
