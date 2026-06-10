import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  AuditLogEntry,
  AuditActionResult,
  ConcurrentConflict,
  Dispatcher,
  DispatcherRole,
} from '../models/railway.model';
import { AuthService } from './auth.service';

export interface AuditRecordParams {
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
  dispatcher?: Dispatcher;
}

@Injectable({
  providedIn: 'root',
})
export class AuditService {
  private auditLogsSubject = new BehaviorSubject<AuditLogEntry[]>([]);
  auditLogs$: Observable<AuditLogEntry[]> = this.auditLogsSubject.asObservable();

  private concurrentConflictsSubject = new BehaviorSubject<ConcurrentConflict[]>([]);
  concurrentConflicts$: Observable<ConcurrentConflict[]> = this.concurrentConflictsSubject.asObservable();

  private nextAuditId = 1;
  private nextConflictId = 1;
  private simTime = 0;
  private activeOperations = new Map<string, { operatorId: string; operatorName: string; timestamp: number }>();

  constructor(private authService: AuthService) {}

  setSimTime(time: number): void {
    this.simTime = time;
  }

  getAuditLogs(): AuditLogEntry[] {
    return this.auditLogsSubject.value;
  }

  getRecentLogs(limit: number = 100): AuditLogEntry[] {
    const logs = [...this.auditLogsSubject.value];
    return logs.reverse().slice(0, limit);
  }

  getLogsByOperator(operatorId: string): AuditLogEntry[] {
    return this.auditLogsSubject.value.filter(log => log.operatorId === operatorId);
  }

  getLogsByRole(role: DispatcherRole): AuditLogEntry[] {
    return this.auditLogsSubject.value.filter(log => log.operatorRole === role);
  }

  getLogsByResult(result: AuditActionResult): AuditLogEntry[] {
    return this.auditLogsSubject.value.filter(log => log.result === result);
  }

  getLogsByTimeRange(startSimTime: number, endSimTime: number): AuditLogEntry[] {
    return this.auditLogsSubject.value.filter(
      log => log.simTime >= startSimTime && log.simTime <= endSimTime
    );
  }

  getConcurrentConflicts(): ConcurrentConflict[] {
    return this.concurrentConflictsSubject.value;
  }

  record(params: AuditRecordParams): AuditLogEntry {
    const dispatcher = params.dispatcher || this.authService.getCurrentDispatcher();

    const entry: AuditLogEntry = {
      id: 'AUD_' + this.nextAuditId++,
      timestamp: Date.now(),
      simTime: this.simTime,
      operatorId: dispatcher?.id || 'unknown',
      operatorName: dispatcher?.realName || '未知用户',
      operatorRole: dispatcher?.role || 'station_dispatcher',
      actionType: params.actionType,
      targetId: params.targetId,
      targetName: params.targetName,
      targetType: params.targetType,
      result: params.result,
      details: params.details,
      rejectionReason: params.rejectionReason,
      approverId: params.approverId,
      approverName: params.approverName,
      approvalTime: params.approvalTime,
      sessionId: this.authService.getCurrentSession()?.sessionId,
    };

    const logs = [...this.auditLogsSubject.value, entry];
    this.auditLogsSubject.next(logs);

    return entry;
  }

  checkConcurrentConflict(
    targetId: string,
    targetName: string,
    targetType: string,
    actionType: string,
    dispatcher?: Dispatcher
  ): { conflict: boolean; reason?: string; conflictInfo?: ConcurrentConflict } {
    const d = dispatcher || this.authService.getCurrentDispatcher();
    if (!d) return { conflict: false };

    const operationKey = `${targetType}_${targetId}`;
    const existing = this.activeOperations.get(operationKey);

    if (existing && existing.operatorId !== d.id) {
      const elapsed = (Date.now() - existing.timestamp) / 1000;
      if (elapsed < 30) {
        const conflict: ConcurrentConflict = {
          id: 'CON_' + this.nextConflictId++,
          timestamp: Date.now(),
          simTime: this.simTime,
          targetId,
          targetName,
          targetType,
          firstOperatorId: existing.operatorId,
          firstOperatorName: existing.operatorName,
          secondOperatorId: d.id,
          secondOperatorName: d.realName,
          actionType,
          blockedOperatorId: d.id,
          reason: `${existing.operatorName} 正在操作 ${targetName}，请稍后再试`,
        };

        const conflicts = [...this.concurrentConflictsSubject.value, conflict];
        this.concurrentConflictsSubject.next(conflicts);

        this.record({
          actionType,
          targetId,
          targetName,
          targetType,
          result: 'blocked',
          details: { reason: '并发冲突', conflictWith: existing.operatorName },
          rejectionReason: conflict.reason,
          dispatcher: d,
        });

        return { conflict: true, reason: conflict.reason, conflictInfo: conflict };
      }
    }

    this.activeOperations.set(operationKey, {
      operatorId: d.id,
      operatorName: d.realName,
      timestamp: Date.now(),
    });

    return { conflict: false };
  }

  releaseOperation(targetId: string, targetType: string): void {
    const operationKey = `${targetType}_${targetId}`;
    this.activeOperations.delete(operationKey);
  }

  exportLogs(format: 'json' | 'csv' = 'json'): string {
    const logs = this.auditLogsSubject.value;

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    const headers = [
      'ID',
      '操作时间',
      '仿真时间',
      '操作人ID',
      '操作人',
      '角色',
      '操作类型',
      '目标ID',
      '目标名称',
      '目标类型',
      '结果',
      '详情',
      '审批人',
    ];

    const rows = logs.map(log => [
      log.id,
      new Date(log.timestamp).toLocaleString(),
      this.formatSimTime(log.simTime),
      log.operatorId,
      log.operatorName,
      this.getRoleLabel(log.operatorRole),
      this.getActionLabel(log.actionType),
      log.targetId,
      log.targetName,
      log.targetType,
      this.getResultLabel(log.result),
      JSON.stringify(log.details),
      log.approverName || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }

  getStatistics(): {
    totalOperations: number;
    successCount: number;
    failedCount: number;
    blockedCount: number;
    pendingApprovalCount: number;
    byRole: Record<DispatcherRole, number>;
    byType: Record<string, number>;
  } {
    const logs = this.auditLogsSubject.value;
    const stats = {
      totalOperations: logs.length,
      successCount: 0,
      failedCount: 0,
      blockedCount: 0,
      pendingApprovalCount: 0,
      byRole: {
        station_dispatcher: 0,
        section_dispatcher: 0,
        chief_dispatcher: 0,
      } as Record<DispatcherRole, number>,
      byType: {} as Record<string, number>,
    };

    logs.forEach(log => {
      switch (log.result) {
        case 'success':
          stats.successCount++;
          break;
        case 'failed':
          stats.failedCount++;
          break;
        case 'blocked':
          stats.blockedCount++;
          break;
        case 'pending_approval':
          stats.pendingApprovalCount++;
          break;
      }

      stats.byRole[log.operatorRole] = (stats.byRole[log.operatorRole] || 0) + 1;
      stats.byType[log.actionType] = (stats.byType[log.actionType] || 0) + 1;
    });

    return stats;
  }

  private formatSimTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private getRoleLabel(role: DispatcherRole): string {
    return this.authService.getRoleLabel(role);
  }

  private getActionLabel(type: string): string {
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

  private getResultLabel(result: AuditActionResult): string {
    const labels: Record<AuditActionResult, string> = {
      success: '成功',
      failed: '失败',
      blocked: '阻止',
      pending_approval: '待审批',
    };
    return labels[result];
  }

  reset(): void {
    this.auditLogsSubject.next([]);
    this.concurrentConflictsSubject.next([]);
    this.activeOperations.clear();
    this.nextAuditId = 1;
    this.nextConflictId = 1;
  }
}