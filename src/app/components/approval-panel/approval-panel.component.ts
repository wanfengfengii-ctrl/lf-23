import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import {
  OperationApproval,
  ApprovalStatus,
  ApprovalActionType,
  DispatcherRole,
  ROLE_LABELS,
  ROLE_COLORS,
  Dispatcher,
} from '../../models/railway.model';
import { ApprovalService } from '../../services/approval.service';
import { AuthService } from '../../services/auth.service';

interface RejectDialogData {
  approval: OperationApproval;
}

@Component({
  selector: 'app-reject-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    FormsModule,
  ],
  template: `
    <h2 mat-dialog-title style="margin: 0; padding: 16px 24px;">
      <mat-icon style="vertical-align: middle; margin-right: 8px; color: #f44336;">cancel</mat-icon>
      驳回申请
    </h2>
    <mat-divider></mat-divider>
    <mat-dialog-content style="padding: 24px;">
      <div style="margin-bottom: 16px; padding: 12px; background: #fff3e0; border-radius: 8px;">
        <div style="font-weight: 600; margin-bottom: 4px;">申请内容</div>
        <div style="font-size: 14px; color: #666;">
          操作类型：{{ getActionTypeLabel(data.approval.actionType) }}<br>
          操作对象：{{ data.approval.targetName }}<br>
          申请人：{{ data.approval.requestorName }} ({{ getRoleLabel(data.approval.requestorRole) }})
        </div>
      </div>
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>驳回原因（必填）</mat-label>
        <textarea
          matInput
          [(ngModel)]="rejectReason"
          rows="3"
          placeholder="请详细说明驳回原因..."
        ></textarea>
        <mat-icon matSuffix>edit_note</mat-icon>
      </mat-form-field>
      <div *ngIf="error" style="color: #f44336; font-size: 13px;">
        {{ error }}
      </div>
    </mat-dialog-content>
    <mat-divider></mat-divider>
    <mat-dialog-actions style="padding: 12px 24px; justify-content: flex-end;">
      <button mat-button (click)="onCancel()">取消</button>
      <button mat-raised-button color="warn" (click)="onConfirm()">
        <mat-icon style="margin-right: 4px;">cancel</mat-icon>
        确认驳回
      </button>
    </mat-dialog-actions>
  `,
})
export class RejectDialogComponent {
  rejectReason = '';
  error = '';

  constructor(
    public dialogRef: MatDialogRef<RejectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RejectDialogData,
    private approvalService: ApprovalService,
    private snackBar: MatSnackBar
  ) {}

  getActionTypeLabel(type: ApprovalActionType): string {
    return this.approvalService.getActionTypeLabel(type);
  }

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  onConfirm(): void {
    if (!this.rejectReason.trim()) {
      this.error = '请填写驳回原因';
      return;
    }

    const result = this.approvalService.reject(this.data.approval.id, this.rejectReason.trim());
    if (result.success) {
      this.snackBar.open('已驳回申请', '知道了', { duration: 2000 });
      this.dialogRef.close(true);
    } else {
      this.error = result.message || '操作失败';
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

@Component({
  selector: 'app-approval-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatTabsModule,
  ],
  templateUrl: './approval-panel.component.html',
  styleUrls: ['./approval-panel.component.scss'],
})
export class ApprovalPanelComponent implements OnInit, OnDestroy {
  pendingApprovals: OperationApproval[] = [];
  allApprovals: OperationApproval[] = [];
  canApprove = false;
  currentDispatcher: Dispatcher | null = null;
  selectedTab = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private approvalService: ApprovalService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.approvalService.pendingApprovals$.subscribe(approvals => {
        this.pendingApprovals = [...approvals].reverse();
      })
    );

    this.subscriptions.push(
      this.approvalService.approvals$.subscribe(approvals => {
        this.allApprovals = [...approvals].reverse().slice(0, 50);
      })
    );

    this.subscriptions.push(
      this.authService.currentSession$.subscribe(session => {
        this.currentDispatcher = session?.dispatcher || null;
        this.canApprove = this.authService.canApprove().allowed;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onApprove(approval: OperationApproval): void {
    const result = this.approvalService.approve(approval.id);
    if (result.success) {
      this.snackBar.open(`已批准 ${result.approval?.requestorName} 的申请`, '知道了', { duration: 2000 });
    } else if (result.message) {
      this.snackBar.open(result.message, '关闭', { duration: 3000, panelClass: ['error-snackbar'] });
    }
  }

  onReject(approval: OperationApproval): void {
    this.dialog.open(RejectDialogComponent, {
      width: '450px',
      data: { approval },
    });
  }

  onCancel(approval: OperationApproval): void {
    const result = this.approvalService.cancel(approval.id);
    if (result.success) {
      this.snackBar.open('已撤回申请', '知道了', { duration: 2000 });
    } else if (result.message) {
      this.snackBar.open(result.message, '关闭', { duration: 3000, panelClass: ['error-snackbar'] });
    }
  }

  isMyRequest(approval: OperationApproval): boolean {
    return approval.requestorId === this.currentDispatcher?.id;
  }

  getActionTypeLabel(type: ApprovalActionType): string {
    return this.approvalService.getActionTypeLabel(type);
  }

  getStatusLabel(status: ApprovalStatus): string {
    return this.approvalService.getStatusLabel(status);
  }

  getStatusClass(status: ApprovalStatus): string {
    return this.approvalService.getStatusClass(status);
  }

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  getRoleColor(role: DispatcherRole): string {
    return ROLE_COLORS[role];
  }

  getTargetTypeIcon(targetType: string): string {
    switch (targetType) {
      case 'signal':
        return 'traffic';
      case 'switch':
        return 'shuffle';
      case 'route':
        return 'route';
      case 'block':
        return 'link';
      case 'fault':
        return 'error';
      case 'train':
        return 'directions_railway';
      default:
        return 'info';
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getPendingCount(): number {
    return this.pendingApprovals.length;
  }
}
