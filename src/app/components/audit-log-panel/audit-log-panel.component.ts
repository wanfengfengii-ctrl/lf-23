import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AuditLogEntry,
  AuditActionResult,
  DispatcherRole,
  ROLE_LABELS,
  ROLE_COLORS,
  Dispatcher,
} from '../../models/railway.model';
import { AuditService } from '../../services/audit.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-audit-log-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatTabsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSnackBarModule,
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './audit-log-panel.component.html',
  styleUrls: ['./audit-log-panel.component.scss'],
})
export class AuditLogPanelComponent implements OnInit, OnDestroy {
  allLogs: AuditLogEntry[] = [];
  filteredLogs: AuditLogEntry[] = [];
  currentDispatcher: Dispatcher | null = null;
  canViewAudit = false;
  allDispatchers: Dispatcher[] = [];

  filterOperator = 'all';
  filterResult = 'all';
  filterActionType = 'all';

  stats = {
    totalOperations: 0,
    successCount: 0,
    failedCount: 0,
    blockedCount: 0,
    pendingApprovalCount: 0,
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private auditService: AuditService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.authService.currentSession$.subscribe(session => {
        this.currentDispatcher = session?.dispatcher || null;
        this.canViewAudit = this.authService.hasPermission('canViewAudit');
      })
    );

    this.subscriptions.push(
      this.authService.dispatchers$.subscribe(dispatchers => {
        this.allDispatchers = dispatchers;
      })
    );

    this.subscriptions.push(
      this.auditService.auditLogs$.subscribe(logs => {
        this.allLogs = [...logs].reverse();
        this.applyFilters();
        this.stats = this.auditService.getStatistics();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  applyFilters(): void {
    this.filteredLogs = this.allLogs.filter(log => {
      if (this.filterOperator !== 'all' && log.operatorId !== this.filterOperator) {
        return false;
      }
      if (this.filterResult !== 'all' && log.result !== this.filterResult) {
        return false;
      }
      if (this.filterActionType !== 'all' && log.actionType !== this.filterActionType) {
        return false;
      }
      return true;
    });
  }

  getUniqueActionTypes(): string[] {
    const types = new Set(this.allLogs.map(l => l.actionType));
    return Array.from(types);
  }

  onExport(format: 'json' | 'csv'): void {
    const data = this.auditService.exportLogs(format);
    const blob = new Blob([data], {
      type: format === 'json' ? 'application/json' : 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.snackBar.open(`审计日志已导出为 ${format.toUpperCase()} 格式`, '知道了', { duration: 2000 });
  }

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  getRoleColor(role: DispatcherRole): string {
    return ROLE_COLORS[role];
  }

  getResultLabel(result: AuditActionResult): string {
    const labels: Record<AuditActionResult, string> = {
      success: '成功',
      failed: '失败',
      blocked: '阻止',
      pending_approval: '待审批',
    };
    return labels[result];
  }

  getResultClass(result: AuditActionResult): string {
    return `result-${result}`;
  }

  getActionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      set_route: '排列进路',
      cancel_route: '取消进路',
      manual_signal: '人工信号',
      switch_position: '道岔操作',
      block_request: '闭塞请求',
      block_confirm: '闭塞确认',
      emergency_stop: '紧急停车',
      trigger_fault: '触发故障',
      fault_acknowledge: '确认故障',
      fault_resolve: '解除故障',
      block_section: '封锁区间',
      unblock_section: '解封区间',
      speed_restriction: '设置限速',
      lift_speed_restriction: '解除限速',
      manual_route_setup: '人工办理进路',
      shift_handover: '交接班',
      login: '登录',
      logout: '登出',
    };
    return labels[type] || type;
  }

  getActionTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      set_route: 'route',
      cancel_route: 'cancel',
      manual_signal: 'traffic',
      switch_position: 'shuffle',
      block_request: 'send',
      block_confirm: 'check_circle',
      emergency_stop: 'warning',
      trigger_fault: 'error',
      fault_acknowledge: 'visibility',
      fault_resolve: 'task_alt',
      block_section: 'block',
      unblock_section: 'check',
      speed_restriction: 'speed',
      lift_speed_restriction: 'trending_up',
      manual_route_setup: 'edit_road',
      shift_handover: 'swap_horiz',
      login: 'login',
      logout: 'logout',
    };
    return icons[type] || 'info';
  }

  getTargetTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      signal: '信号机',
      switch: '道岔',
      route: '进路',
      block: '区间',
      fault: '故障',
      train: '列车',
      user: '用户',
    };
    return labels[type] || type;
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getSuccessRate(): string {
    if (this.stats.totalOperations === 0) return '0%';
    return Math.round((this.stats.successCount / this.stats.totalOperations) * 100) + '%';
  }

  getDispatcherName(id: string): string {
    const d = this.allDispatchers.find(x => x.id === id);
    return d?.realName || id;
  }
}
