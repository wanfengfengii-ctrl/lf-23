import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RailwayMapComponent } from './components/railway-map/railway-map.component';
import { ControlPanelComponent } from './components/control-panel/control-panel.component';
import { ConfigPanelComponent } from './components/config-panel/config-panel.component';
import { DispatcherPanelComponent } from './components/dispatcher-panel/dispatcher-panel.component';
import { FaultPanelComponent } from './components/fault-panel/fault-panel.component';
import { TimelineComponent } from './components/timeline/timeline.component';
import { UserPanelComponent } from './components/user-panel/user-panel.component';
import { ApprovalPanelComponent } from './components/approval-panel/approval-panel.component';
import { ShiftHandoverPanelComponent } from './components/shift-handover-panel/shift-handover-panel.component';
import { AuditLogPanelComponent } from './components/audit-log-panel/audit-log-panel.component';
import { SimulationService } from './services/simulation.service';
import { FaultSimulationService } from './services/fault-simulation.service';
import { AuthService } from './services/auth.service';
import { ApprovalService } from './services/approval.service';
import { Dispatcher, DispatcherRole, ROLE_LABELS, ROLE_COLORS } from './models/railway.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatTabsModule,
    MatChipsModule,
    MatTooltipModule,
    RailwayMapComponent,
    ControlPanelComponent,
    ConfigPanelComponent,
    DispatcherPanelComponent,
    FaultPanelComponent,
    TimelineComponent,
    UserPanelComponent,
    ApprovalPanelComponent,
    ShiftHandoverPanelComponent,
    AuditLogPanelComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [SimulationService, FaultSimulationService],
})
export class AppComponent implements OnInit, OnDestroy {
  title = '铁路人工闭塞高级仿真系统';
  showConfigPanel = false;
  showDispatcherPanel = true;
  showFaultPanel = true;
  showUserPanel = true;
  showApprovalPanel = true;
  showHandoverPanel = true;
  showAuditPanel = true;

  activeFaultCount = 0;
  pendingApprovalCount = 0;
  pendingHandoverCount = 0;
  currentDispatcher: Dispatcher | null = null;
  currentRole: DispatcherRole | null = null;
  canViewAudit = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private faultSimulationService: FaultSimulationService,
    private authService: AuthService,
    private approvalService: ApprovalService,
    private simulationService: SimulationService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.faultSimulationService.state$.subscribe(state => {
        this.activeFaultCount = state.faults.filter(f => f.status !== 'resolved').length;
      })
    );

    this.subscriptions.push(
      this.authService.currentSession$.subscribe(session => {
        this.currentDispatcher = session?.dispatcher || null;
        this.currentRole = session?.dispatcher?.role || null;
        this.canViewAudit = this.authService.hasPermission('canViewAudit');
      })
    );

    this.subscriptions.push(
      this.approvalService.pendingApprovals$.subscribe(approvals => {
        this.pendingApprovalCount = approvals.length;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  getRoleLabel(): string {
    return this.currentRole ? ROLE_LABELS[this.currentRole] : '';
  }

  getRoleColor(): string {
    return this.currentRole ? ROLE_COLORS[this.currentRole] : '#757575';
  }

  togglePanel(panel: string): void {
    switch (panel) {
      case 'config': this.showConfigPanel = !this.showConfigPanel; break;
      case 'dispatcher': this.showDispatcherPanel = !this.showDispatcherPanel; break;
      case 'fault': this.showFaultPanel = !this.showFaultPanel; break;
      case 'user': this.showUserPanel = !this.showUserPanel; break;
      case 'approval': this.showApprovalPanel = !this.showApprovalPanel; break;
      case 'handover': this.showHandoverPanel = !this.showHandoverPanel; break;
      case 'audit': this.showAuditPanel = !this.showAuditPanel; break;
    }
  }
}
