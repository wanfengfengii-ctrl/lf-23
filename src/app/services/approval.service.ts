import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  OperationApproval,
  ApprovalActionType,
  ApprovalStatus,
  DispatcherRole,
  ConflictAlert,
  Dispatcher,
} from '../models/railway.model';
import { AuthService } from './auth.service';

export type ApprovalTargetType = 'signal' | 'switch' | 'route' | 'block' | 'fault' | 'train';

export interface ApprovalRequest {
  actionType: ApprovalActionType;
  targetId: string;
  targetName: string;
  targetType: ApprovalTargetType;
  actionData: any;
  conflictInfo?: ConflictAlert;
}

@Injectable({
  providedIn: 'root',
})
export class ApprovalService {
  private approvalsSubject = new BehaviorSubject<OperationApproval[]>([]);
  approvals$: Observable<OperationApproval[]> = this.approvalsSubject.asObservable();

  private pendingApprovalsSubject = new BehaviorSubject<OperationApproval[]>([]);
  pendingApprovals$: Observable<OperationApproval[]> = this.pendingApprovalsSubject.asObservable();

  private approvalResultSubject = new BehaviorSubject<{ approval: OperationApproval; actionData: any } | null>(null);
  approvalResult$: Observable<{ approval: OperationApproval; actionData: any } | null> = this.approvalResultSubject.asObservable();

  private nextApprovalId = 1;
  private simTime = 0;

  constructor(private authService: AuthService) {}

  setSimTime(time: number): void {
    this.simTime = time;
  }

  getApprovals(): OperationApproval[] {
    return this.approvalsSubject.value;
  }

  getPendingApprovals(): OperationApproval[] {
    return this.approvalsSubject.value.filter(a => a.status === 'pending');
  }

  getMyPendingApprovals(): OperationApproval[] {
    const currentDispatcher = this.authService.getCurrentDispatcher();
    if (!currentDispatcher) return [];

    if (currentDispatcher.role === 'chief_dispatcher') {
      return this.getPendingApprovals();
    }

    if (currentDispatcher.role === 'section_dispatcher') {
      return this.getPendingApprovals().filter(a => a.requestorRole === 'station_dispatcher');
    }

    return [];
  }

  getApprovalById(id: string): OperationApproval | undefined {
    return this.approvalsSubject.value.find(a => a.id === id);
  }

  requiresApproval(actionType: ApprovalActionType): boolean {
    return this.authService.requiresApproval(actionType);
  }

  submitForApproval(request: ApprovalRequest): { success: boolean; approval?: OperationApproval; message?: string } {
    const requestor = this.authService.getCurrentDispatcher();
    if (!requestor) {
      return { success: false, message: '未登录，无法提交申请' };
    }

    if (!this.requiresApproval(request.actionType)) {
      return { success: false, message: '该操作不需要审批' };
    }

    const approval: OperationApproval = {
      id: 'APR_' + this.nextApprovalId++,
      requestTime: this.simTime,
      requestorId: requestor.id,
      requestorName: requestor.realName,
      requestorRole: requestor.role,
      actionType: request.actionType,
      targetId: request.targetId,
      targetName: request.targetName,
      targetType: request.targetType,
      actionData: request.actionData,
      status: 'pending',
      conflictInfo: request.conflictInfo,
    };

    const approvals = [...this.approvalsSubject.value, approval];
    this.approvalsSubject.next(approvals);
    this.updatePendingSubject();

    return { success: true, approval };
  }

  approve(approvalId: string): { success: boolean; approval?: OperationApproval; message?: string } {
    const approval = this.getApprovalById(approvalId);
    if (!approval) {
      return { success: false, message: '审批申请不存在' };
    }

    const approver = this.authService.getCurrentDispatcher();
    if (!approver) {
      return { success: false, message: '未登录' };
    }

    const canApproveCheck = this.canApprove(approval, approver);
    if (!canApproveCheck.allowed) {
      return { success: false, message: canApproveCheck.reason };
    }

    if (approval.status !== 'pending') {
      return { success: false, message: '该申请状态不允许审批' };
    }

    const updatedApproval: OperationApproval = {
      ...approval,
      status: 'approved',
      approverId: approver.id,
      approverName: approver.realName,
      approverRole: approver.role,
      decisionTime: this.simTime,
    };

    const approvals = this.approvalsSubject.value.map(a =>
      a.id === approvalId ? updatedApproval : a
    );
    this.approvalsSubject.next(approvals);
    this.updatePendingSubject();

    this.approvalResultSubject.next({ approval: updatedApproval, actionData: approval.actionData });

    return { success: true, approval: updatedApproval };
  }

  reject(approvalId: string, rejectReason: string): { success: boolean; approval?: OperationApproval; message?: string } {
    const approval = this.getApprovalById(approvalId);
    if (!approval) {
      return { success: false, message: '审批申请不存在' };
    }

    const approver = this.authService.getCurrentDispatcher();
    if (!approver) {
      return { success: false, message: '未登录' };
    }

    const canApproveCheck = this.canApprove(approval, approver);
    if (!canApproveCheck.allowed) {
      return { success: false, message: canApproveCheck.reason };
    }

    if (approval.status !== 'pending') {
      return { success: false, message: '该申请状态不允许审批' };
    }

    if (!rejectReason || rejectReason.trim().length === 0) {
      return { success: false, message: '必须填写驳回原因' };
    }

    const updatedApproval: OperationApproval = {
      ...approval,
      status: 'rejected',
      approverId: approver.id,
      approverName: approver.realName,
      approverRole: approver.role,
      decisionTime: this.simTime,
      rejectReason: rejectReason.trim(),
    };

    const approvals = this.approvalsSubject.value.map(a =>
      a.id === approvalId ? updatedApproval : a
    );
    this.approvalsSubject.next(approvals);
    this.updatePendingSubject();

    this.approvalResultSubject.next({ approval: updatedApproval, actionData: approval.actionData });

    return { success: true, approval: updatedApproval };
  }

  cancel(approvalId: string): { success: boolean; message?: string } {
    const approval = this.getApprovalById(approvalId);
    if (!approval) {
      return { success: false, message: '审批申请不存在' };
    }

    const currentDispatcher = this.authService.getCurrentDispatcher();
    if (!currentDispatcher || currentDispatcher.id !== approval.requestorId) {
      return { success: false, message: '只有申请人可以撤回申请' };
    }

    if (approval.status !== 'pending') {
      return { success: false, message: '该申请状态不允许撤回' };
    }

    const updatedApproval: OperationApproval = {
      ...approval,
      status: 'cancelled',
      decisionTime: this.simTime,
    };

    const approvals = this.approvalsSubject.value.map(a =>
      a.id === approvalId ? updatedApproval : a
    );
    this.approvalsSubject.next(approvals);
    this.updatePendingSubject();

    return { success: true };
  }

  private canApprove(approval: OperationApproval, approver: Dispatcher): { allowed: boolean; reason?: string } {
    if (!this.authService.hasPermission('canApprove', approver)) {
      return { allowed: false, reason: `${this.authService.getRoleLabel(approver.role)}无审批权限` };
    }

    if (approval.requestorRole === 'chief_dispatcher') {
      return { allowed: false, reason: '总调度员操作无需审批' };
    }

    if (approval.requestorRole === 'section_dispatcher' && approver.role !== 'chief_dispatcher') {
      return { allowed: false, reason: '区间调度员申请仅总调度员可审批' };
    }

    if (approval.requestorRole === 'station_dispatcher' && approver.role === 'station_dispatcher') {
      return { allowed: false, reason: '车站值班员申请需区间调度员或总调度员审批' };
    }

    return { allowed: true };
  }

  getActionTypeLabel(type: ApprovalActionType): string {
    const labels: Record<ApprovalActionType, string> = {
      set_route: '排列进路',
      cancel_route: '取消进路',
      manual_signal: '人工信号',
      switch_position: '道岔操作',
      block_confirm: '闭塞确认',
      emergency_stop: '紧急停车',
      trigger_fault: '触发故障',
      resolve_fault: '解除故障',
      block_section: '封锁区间',
      unblock_section: '解封区间',
      speed_restriction: '设置限速',
      lift_speed_restriction: '解除限速',
      manual_route_setup: '人工办理进路',
    };
    return labels[type] || type;
  }

  getStatusLabel(status: ApprovalStatus): string {
    const labels: Record<ApprovalStatus, string> = {
      pending: '待审批',
      approved: '已批准',
      rejected: '已驳回',
      cancelled: '已撤回',
    };
    return labels[status];
  }

  getStatusClass(status: ApprovalStatus): string {
    const classes: Record<ApprovalStatus, string> = {
      pending: 'status-pending',
      approved: 'status-approved',
      rejected: 'status-rejected',
      cancelled: 'status-cancelled',
    };
    return classes[status];
  }

  clearApprovalResult(): void {
    this.approvalResultSubject.next(null);
  }

  private updatePendingSubject(): void {
    this.pendingApprovalsSubject.next(this.getPendingApprovals());
  }

  reset(): void {
    this.approvalsSubject.next([]);
    this.pendingApprovalsSubject.next([]);
    this.approvalResultSubject.next(null);
    this.nextApprovalId = 1;
  }
}