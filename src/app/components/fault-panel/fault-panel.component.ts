import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  Fault,
  FaultType,
  FaultStatus,
  FaultSeverity,
  EmergencyLogEntry,
  BlockedSection,
  SpeedRestriction,
  BlockSection,
  Route,
} from '../../models/railway.model';
import { FaultSimulationService, SequenceViolation } from '../../services/fault-simulation.service';
import { SimulationService } from '../../services/simulation.service';
import { RailwayDataService } from '../../services/railway-data.service';
import { RouteControlService } from '../../services/route-control.service';

interface HandlingStep {
  id: string;
  label: string;
  icon: string;
  completed: boolean;
  required: boolean;
}

@Component({
  selector: 'app-fault-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatBadgeModule,
    MatTooltipModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatCardModule,
    MatChipsModule,
    MatSnackBarModule,
    FormsModule,
  ],
  templateUrl: './fault-panel.component.html',
  styleUrls: ['./fault-panel.component.scss'],
})
export class FaultPanelComponent implements OnInit, OnDestroy {
  faults: Fault[] = [];
  emergencyLog: EmergencyLogEntry[] = [];
  blockedSections: BlockedSection[] = [];
  speedRestrictions: SpeedRestriction[] = [];
  isRandomFaultsEnabled = false;
  randomFaultInterval = 30;

  selectedFaultType: FaultType = 'signal_fault';
  selectedTargetId = '';
  selectedBlockForSpeed = '';
  speedLimit = 20;
  selectedFaultForAction = '';
  selectedBlockToBlock = '';
  selectedRouteId = '';

  blocks: BlockSection[] = [];
  routes: Route[] = [];

  currentViolation: SequenceViolation | null = null;

  private subscriptions: Subscription[] = [];

  faultTypes: { type: FaultType; label: string; icon: string }[] = [
    { type: 'signal_fault', label: '信号机故障', icon: 'warning' },
    { type: 'switch_jammed', label: '道岔卡阻', icon: 'shuffle' },
    { type: 'block_occupancy_anomaly', label: '区间占用异常', icon: 'warning_amber' },
    { type: 'train_emergency_stop', label: '列车临时停车', icon: 'directions_railway' },
  ];

  constructor(
    private faultSimulationService: FaultSimulationService,
    private simulationService: SimulationService,
    private railwayDataService: RailwayDataService,
    private routeControlService: RouteControlService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.faultSimulationService.state$.subscribe(state => {
        this.faults = state.faults;
        this.emergencyLog = state.emergencyLog;
        this.blockedSections = state.blockedSections;
        this.speedRestrictions = state.speedRestrictions;
        this.isRandomFaultsEnabled = state.isRandomFaultsEnabled;
        this.randomFaultInterval = state.randomFaultInterval;
      })
    );

    this.subscriptions.push(
      this.faultSimulationService.sequenceViolation$.subscribe(violation => {
        this.currentViolation = violation;
        if (violation) {
          this.snackBar.open(violation.reason, '关闭', {
            duration: 5000,
            panelClass: ['violation-snackbar'],
          });
        }
      })
    );

    this.subscriptions.push(
      this.railwayDataService.blockSections$.subscribe(blocks => {
        this.blocks = blocks;
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

  getActiveFaults(): Fault[] {
    return this.faults.filter(f => f.status !== 'resolved');
  }

  getResolvedFaults(): Fault[] {
    return this.faults.filter(f => f.status === 'resolved');
  }

  getAvailableTargets(): { id: string; name: string }[] {
    return this.faultSimulationService.getAvailableTargetsForFaultType(this.selectedFaultType);
  }

  getHandlingSteps(fault: Fault): HandlingStep[] {
    const hasBlocked = this.blockedSections.some(bs => bs.faultId === fault.id);
    const hasSpeedRestriction = this.speedRestrictions.some(sr =>
      fault.affectedBlockIds.includes(sr.blockSectionId)
    );
    const hasManualRoute = this.faultSimulationService.getFaultActions().some(
      a => a.faultId === fault.id && a.type === 'manual_route_setup'
    );

    return [
      {
        id: 'acknowledge',
        label: '故障确认',
        icon: 'check_circle',
        completed: fault.status !== 'active',
        required: true,
      },
      {
        id: 'block',
        label: '封锁区间',
        icon: 'block',
        completed: hasBlocked,
        required: fault.affectedBlockIds.length > 0,
      },
      {
        id: 'speed_restriction',
        label: '限速放行',
        icon: 'speed',
        completed: hasSpeedRestriction,
        required: false,
      },
      {
        id: 'manual_route',
        label: '人工办理进路',
        icon: 'route',
        completed: hasManualRoute,
        required: false,
      },
      {
        id: 'resolve',
        label: '故障解除',
        icon: 'task_alt',
        completed: fault.status === 'resolved',
        required: true,
      },
    ];
  }

  getStepStatus(step: HandlingStep, fault: Fault): 'completed' | 'active' | 'pending' | 'disabled' {
    if (step.completed) return 'completed';

    switch (step.id) {
      case 'acknowledge':
        return fault.status === 'active' ? 'active' : 'disabled';
      case 'block':
        return fault.status === 'acknowledged' || fault.status === 'active' || fault.status === 'blocked'
          ? 'active' : 'disabled';
      case 'speed_restriction':
      case 'manual_route':
        return fault.status !== 'active' && fault.status !== 'resolved' ? 'active' : 'disabled';
      case 'resolve':
        return fault.status !== 'resolved' && fault.status !== 'active' ? 'active' : 'disabled';
      default:
        return 'pending';
    }
  }

  getProgressPercentage(fault: Fault): number {
    const steps = this.getHandlingSteps(fault);
    const requiredSteps = steps.filter(s => s.required);
    if (requiredSteps.length === 0) return 100;
    const completedRequired = requiredSteps.filter(s => s.completed).length;
    return Math.round((completedRequired / requiredSteps.length) * 100);
  }

  onTriggerFault(): void {
    if (!this.selectedTargetId) return;

    switch (this.selectedFaultType) {
      case 'signal_fault':
        this.faultSimulationService.triggerSignalFault(this.selectedTargetId, false);
        break;
      case 'switch_jammed':
        this.faultSimulationService.triggerSwitchJammed(this.selectedTargetId, false);
        break;
      case 'block_occupancy_anomaly':
        this.faultSimulationService.triggerBlockOccupancyAnomaly(this.selectedTargetId, false);
        break;
      case 'train_emergency_stop':
        this.faultSimulationService.triggerTrainEmergencyStop(this.selectedTargetId, false);
        break;
    }

    this.selectedTargetId = '';
  }

  onAcknowledgeFault(faultId: string): void {
    const result = this.faultSimulationService.acknowledgeFault(faultId);
    if (!result.success && result.violation) {
      this.currentViolation = result.violation;
    }
  }

  onBlockSection(faultId: string): void {
    if (!this.selectedBlockToBlock) return;
    const result = this.faultSimulationService.blockSection(faultId, this.selectedBlockToBlock);
    if (!result.success && result.violation) {
      this.currentViolation = result.violation;
    }
    this.selectedBlockToBlock = '';
  }

  onUnblockSection(faultId: string, blockSectionId: string): void {
    this.faultSimulationService.unblockSection(faultId, blockSectionId);
  }

  onSetSpeedRestriction(faultId: string): void {
    if (!this.selectedBlockForSpeed) return;
    this.faultSimulationService.setSpeedRestriction(
      this.selectedBlockForSpeed,
      this.speedLimit,
      '故障处置-限速放行',
      faultId
    );
    this.selectedBlockForSpeed = '';
  }

  onLiftSpeedRestriction(faultId: string, blockSectionId: string): void {
    this.faultSimulationService.liftSpeedRestriction(blockSectionId, faultId);
  }

  onManualRouteSetup(faultId: string): void {
    if (!this.selectedRouteId) return;
    const route = this.routes.find(r => r.id === this.selectedRouteId);
    if (route) {
      this.faultSimulationService.recordManualRouteSetup(faultId, route.id, route.name);
      const result = this.simulationService.setRoute(route.id);
      if (!result.success && result.conflict) {
        this.snackBar.open(result.conflict.message, '关闭', { duration: 4000 });
      }
    }
    this.selectedRouteId = '';
  }

  onResolveFault(faultId: string): void {
    const result = this.faultSimulationService.resolveFault(faultId);
    if (!result.success) {
      if (result.violation) {
        this.currentViolation = result.violation;
      }
      if (result.conflict) {
        this.snackBar.open(result.conflict.message, '关闭', { duration: 4000 });
      }
    }
  }

  onDismissViolation(): void {
    this.currentViolation = null;
    this.faultSimulationService.dismissSequenceViolation();
  }

  onToggleRandomFaults(): void {
    this.faultSimulationService.setRandomFaultsEnabled(!this.isRandomFaultsEnabled);
  }

  onRandomFaultIntervalChange(): void {
    this.faultSimulationService.setRandomFaultInterval(this.randomFaultInterval);
  }

  getFaultTypeLabel(type: FaultType): string {
    const found = this.faultTypes.find(f => f.type === type);
    return found ? found.label : type;
  }

  getFaultTypeIcon(type: FaultType): string {
    const found = this.faultTypes.find(f => f.type === type);
    return found ? found.icon : 'error';
  }

  getFaultStatusLabel(status: FaultStatus): string {
    switch (status) {
      case 'active':
        return '待处理';
      case 'acknowledged':
        return '已确认';
      case 'blocked':
        return '已封锁';
      case 'resolved':
        return '已解除';
      default:
        return status;
    }
  }

  getFaultStatusClass(status: FaultStatus): string {
    return `status-${status}`;
  }

  getSeverityLabel(severity: FaultSeverity): string {
    switch (severity) {
      case 'minor':
        return '轻微';
      case 'major':
        return '严重';
      case 'critical':
        return '危急';
      default:
        return severity;
    }
  }

  getSeverityClass(severity: FaultSeverity): string {
    return `severity-${severity}`;
  }

  getLogCategoryClass(category: string): string {
    return `log-${category}`;
  }

  getLogCategoryIcon(category: string): string {
    switch (category) {
      case 'fault':
        return 'error';
      case 'action':
        return 'build';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'description';
    }
  }

  getBlockedSectionsForFault(faultId: string): BlockedSection[] {
    return this.blockedSections.filter(bs => bs.faultId === faultId);
  }

  getSpeedRestrictionsForFault(faultId: Fault['id']): SpeedRestriction[] {
    return this.speedRestrictions.filter(sr => {
      const fault = this.faults.find(f => f.id === faultId);
      return fault && fault.affectedBlockIds.includes(sr.blockSectionId);
    });
  }

  getBlockName(blockId: string): string {
    const block = this.blocks.find(b => b.id === blockId);
    return block ? block.name : blockId;
  }

  getAvailableRoutes(): Route[] {
    return this.routes.filter(r => r.state === 'idle');
  }

  formatTime(seconds: number): string {
    const date = new Date(seconds * 1000);
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getReversedLog(): EmergencyLogEntry[] {
    return [...this.emergencyLog].reverse().slice(0, 100);
  }

  canAcknowledge(fault: Fault): boolean {
    return fault.status === 'active';
  }

  canBlock(fault: Fault): boolean {
    return fault.status === 'active' || fault.status === 'acknowledged' || fault.status === 'blocked';
  }

  canResolve(fault: Fault): boolean {
    return fault.status !== 'resolved';
  }

  getElapsedTimeString(startTime: number): string {
    const elapsed = this.faultSimulationService.getState().faults.length > 0
      ? Date.now() / 1000 - startTime
      : 0;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    return `${mins}分${secs}秒`;
  }

  getImpactDescription(fault: Fault): string {
    const parts: string[] = [];
    if (fault.affectedBlockIds.length > 0) {
      const blockNames = fault.affectedBlockIds.map(id => this.getBlockName(id)).join('、');
      parts.push(`影响区间：${blockNames}`);
    }
    if (fault.affectedTrainIds.length > 0) {
      parts.push(`影响列车：${fault.affectedTrainIds.join('、')}`);
    }
    return parts.join(' | ');
  }
}
