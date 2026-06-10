import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  Dispatcher,
  DispatcherRole,
  DispatcherSession,
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_PERMISSIONS,
} from '../../models/railway.model';
import { AuthService } from '../../services/auth.service';

interface LoginDialogData {
  dispatcher: Dispatcher;
}

@Component({
  selector: 'app-login-dialog',
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
      <mat-icon style="vertical-align: middle; margin-right: 8px;">login</mat-icon>
      调度员登录
    </h2>
    <mat-divider></mat-divider>
    <mat-dialog-content style="padding: 24px;">
      <div style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div
            [style.background]="getRoleColor(data.dispatcher.role)"
            style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;"
          >
            {{ data.dispatcher.realName.charAt(0) }}
          </div>
          <div>
            <div style="font-weight: bold; font-size: 16px;">{{ data.dispatcher.realName }}</div>
            <div style="color: #666; font-size: 14px;">
              <span
                [style.background]="getRoleColor(data.dispatcher.role) + '22'"
                [style.color]="getRoleColor(data.dispatcher.role)"
                style="padding: 2px 8px; border-radius: 4px;"
              >
                {{ getRoleLabel(data.dispatcher.role) }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>登录密码</mat-label>
        <input matInput [(ngModel)]="password" type="password" (keydown.enter)="onSubmit()">
        <mat-icon matSuffix>lock</mat-icon>
      </mat-form-field>
      <div *ngIf="error" style="color: #f44336; font-size: 13px; margin-bottom: 12px;">
        {{ error }}
      </div>
      <div style="color: #999; font-size: 12px;">
        提示：默认密码为 123456
      </div>
    </mat-dialog-content>
    <mat-divider></mat-divider>
    <mat-dialog-actions style="padding: 12px 24px; justify-content: flex-end;">
      <button mat-button (click)="onCancel()">取消</button>
      <button mat-raised-button color="primary" (click)="onSubmit()">
        <mat-icon style="margin-right: 4px;">login</mat-icon>
        登录
      </button>
    </mat-dialog-actions>
  `,
})
export class LoginDialogComponent {
  password = '';
  error = '';

  constructor(
    public dialogRef: MatDialogRef<LoginDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: LoginDialogData,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  getRoleColor(role: DispatcherRole): string {
    return ROLE_COLORS[role];
  }

  onSubmit(): void {
    const result = this.authService.login(this.data.dispatcher.username, this.password);
    if (result.success) {
      this.snackBar.open(`${this.data.dispatcher.realName} 登录成功`, '知道了', { duration: 2000 });
      this.dialogRef.close(true);
    } else {
      this.error = result.message || '登录失败';
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

@Component({
  selector: 'app-user-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './user-panel.component.html',
  styleUrls: ['./user-panel.component.scss'],
})
export class UserPanelComponent implements OnInit, OnDestroy {
  allDispatchers: Dispatcher[] = [];
  activeSessions: DispatcherSession[] = [];
  currentSession: DispatcherSession | null = null;

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.authService.dispatchers$.subscribe(dispatchers => {
        this.allDispatchers = dispatchers;
      })
    );

    this.subscriptions.push(
      this.authService.activeSessions$.subscribe(sessions => {
        this.activeSessions = sessions;
      })
    );

    this.subscriptions.push(
      this.authService.currentSession$.subscribe(session => {
        this.currentSession = session;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onLogin(dispatcher: Dispatcher): void {
    if (this.isActive(dispatcher.id)) {
      this.onSwitch(dispatcher);
      return;
    }

    const dialogRef = this.dialog.open(LoginDialogComponent, {
      width: '400px',
      data: { dispatcher },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // login success handled in dialog
      }
    });
  }

  onSwitch(dispatcher: Dispatcher): void {
    const result = this.authService.switchSession(dispatcher.id);
    if (result) {
      this.snackBar.open(`已切换到 ${dispatcher.realName}`, '知道了', { duration: 2000 });
    }
  }

  onLogout(dispatcherId: string): void {
    const dispatcher = this.allDispatchers.find(d => d.id === dispatcherId);
    const result = this.authService.logout(dispatcherId);
    if (result && dispatcher) {
      this.snackBar.open(`${dispatcher.realName} 已登出`, '知道了', { duration: 2000 });
    }
  }

  isActive(dispatcherId: string): boolean {
    return this.activeSessions.some(s => s.dispatcher.id === dispatcherId);
  }

  isCurrent(dispatcherId: string): boolean {
    return this.currentSession?.dispatcher.id === dispatcherId;
  }

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  getRoleColor(role: DispatcherRole): string {
    return ROLE_COLORS[role];
  }

  getPermissionsSummary(role: DispatcherRole): string[] {
    const perms = ROLE_PERMISSIONS[role];
    const summary: string[] = [];
    if (perms.canSetRoute) summary.push('进路');
    if (perms.canManualSignal) summary.push('信号');
    if (perms.canSwitchPosition) summary.push('道岔');
    if (perms.canBlockRequest) summary.push('请求闭塞');
    if (perms.canBlockConfirm) summary.push('确认闭塞');
    if (perms.canTriggerFault) summary.push('故障');
    if (perms.canResolveFault) summary.push('处置');
    if (perms.canApprove) summary.push('审批');
    if (perms.canViewAudit) summary.push('审计');
    return summary;
  }

  formatTime(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
}
