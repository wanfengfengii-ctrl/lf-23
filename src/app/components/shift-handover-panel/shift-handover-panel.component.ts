import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import {
  ShiftHandover,
  ShiftItem,
  Dispatcher,
  DispatcherRole,
  ROLE_LABELS,
  ROLE_COLORS,
  Fault,
  Route,
  BlockRequest,
} from '../../models/railway.model';
import { ShiftHandoverService } from '../../services/shift-handover.service';
import { AuthService } from '../../services/auth.service';
import { SimulationService } from '../../services/simulation.service';
import { RailwayDataService } from '../../services/railway-data.service';
import { RouteControlService } from '../../services/route-control.service';
import { FaultSimulationService } from '../../services/fault-simulation.service';

interface HandoverDialogData {
  mode: 'create' | 'confirm';
  handover?: ShiftHandover;
  availableDispatchers?: Dispatcher[];
}

@Component({
  selector: 'app-handover-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatChipsModule,
    FormsModule,
  ],
  template: `
    <h2 mat-dialog-title style="margin: 0; padding: 16px 24px;">
      <mat-icon style="vertical-align: middle; margin-right: 8px; color: #2196f3;">swap_horiz</mat-icon>
      {{ data.mode === 'create' ? '发起交接班' : '确认交接班' }}
    </h2>
    <mat-divider></mat-divider>
    <mat-dialog-content style="padding: 24px;">
      <ng-container *ngIf="data.mode === 'create'">
        <div *ngIf="currentDispatcher" style="margin-bottom: 16px;">
          <div style="font-weight: 600; margin-bottom: 8px;">交班人员</div>
          <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f5f5f5; border-radius: 8px;">
            <div
              [style.background]="getRoleColor(currentDispatcher.role)"
              style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;"
            >
              {{ currentDispatcher.realName.charAt(0) }}
            </div>
            <div>
              <div style="font-weight: 600;">{{ currentDispatcher.realName }}</div>
              <div style="font-size: 13px; color: #666;">
                {{ getRoleLabel(currentDispatcher.role) }}
              </div>
            </div>
          </div>
        </div>

        <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 16px;">
          <mat-label>接班人员（同角色）</mat-label>
          <mat-select [(ngModel)]="selectedToId">
            <mat-option
              *ngFor="let d of sameRoleDispatchers"
              [value]="d.id"
            >
              <div style="display: flex; align-items: center; gap: 8px;">
                <span
                  [style.background]="getRoleColor(d.role)"
                  style="width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 12px;"
                >
                  {{ d.realName.charAt(0) }}
                </span>
                {{ d.realName }} - {{ getRoleLabel(d.role) }}
              </div>
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 16px;">
          <mat-label>交接备注</mat-label>
          <textarea
            matInput
            [(ngModel)]="notes"
            rows="3"
            placeholder="请填写需要交接的注意事项..."
          ></textarea>
        </mat-form-field>

        <div *ngIf="pendingItems.length > 0">
          <div style="font-weight: 600; margin-bottom: 8px;">待交接事项 ({{ pendingItems.length }})</div>
          <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">
            <mat-list dense>
              <mat-list-item *ngFor="let item of pendingItems">
                <span matListItemMeta>
                  <mat-chip
                    highlighted
                    [class.priority-high]="item.priority === 'high'"
                    [class.priority-medium]="item.priority === 'medium'"
                    [class.priority-low]="item.priority === 'low'"
                  >
                    {{ getPriorityLabel(item.priority) }}
                  </mat-chip>
                </span>
                <mat-icon matListItemIcon>{{ getItemIcon(item.type) }}</mat-icon>
                <div matListItemTitle style="font-size: 13px;">{{ item.targetName }}</div>
                <div matListItemLine style="font-size: 12px; color: #888;">{{ item.description }}</div>
              </mat-list-item>
            </mat-list>
          </div>
        </div>
      </ng-container>

      <ng-container *ngIf="data.mode === 'confirm' && data.handover">
        <div style="display: flex; align-items: center; justify-content: space-around; padding: 16px; background: #f5f5f5; border-radius: 8px; margin-bottom: 16px;">
          <div style="text-align: center;">
            <div
              [style.background]="getRoleColor(data.handover.fromRole)"
              style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin: 0 auto 8px;"
            >
              {{ data.handover.fromDispatcherName.charAt(0) }}
            </div>
            <div style="font-weight: 600;">{{ data.handover.fromDispatcherName }}</div>
            <div style="font-size: 12px; color: #666;">{{ getRoleLabel(data.handover.fromRole) }}</div>
            <div style="font-size: 11px; color: #999; margin-top: 4px;">交班人</div>
          </div>
          <div>
            <mat-icon style="font-size: 36px; color: #2196f3;">arrow_forward</mat-icon>
          </div>
          <div style="text-align: center;">
            <div
              [style.background]="getRoleColor(data.handover.toRole)"
              style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin: 0 auto 8px;"
            >
              {{ data.handover.toDispatcherName.charAt(0) }}
            </div>
            <div style="font-weight: 600;">{{ data.handover.toDispatcherName }}</div>
            <div style="font-size: 12px; color: #666;">{{ getRoleLabel(data.handover.toRole) }}</div>
            <div style="font-size: 11px; color: #999; margin-top: 4px;">接班人</div>
          </div>
        </div>

        <div *ngIf="data.handover.notes" style="margin-bottom: 16px;">
          <div style="font-weight: 600; margin-bottom: 4px;">交接备注</div>
          <div style="padding: 12px; background: #fff3e0; border-radius: 8px; font-size: 13px;">
            {{ data.handover.notes }}
          </div>
        </div>

        <div *ngIf="data.handover.pendingItems.length > 0">
          <div style="font-weight: 600; margin-bottom: 8px;">交接事项</div>
          <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">
            <mat-list dense>
              <mat-list-item *ngFor="let item of data.handover.pendingItems">
                <span matListItemMeta>
                  <mat-chip
                    highlighted
                    [class.priority-high]="item.priority === 'high'"
                    [class.priority-medium]="item.priority === 'medium'"
                    [class.priority-low]="item.priority === 'low'"
                  >
                    {{ getPriorityLabel(item.priority) }}
                  </mat-chip>
                </span>
                <mat-icon matListItemIcon>{{ getItemIcon(item.type) }}</mat-icon>
                <div matListItemTitle style="font-size: 13px;">{{ item.targetName }}</div>
                <div matListItemLine style="font-size: 12px; color: #888;">{{ item.description }}</div>
              </mat-list-item>
            </mat-list>
          </div>
        </div>
      </ng-container>
    </mat-dialog-content>
    <mat-divider></mat-divider>
    <mat-dialog-actions style="padding: 12px 24px; justify-content: flex-end;">
      <button mat-button (click)="onCancel()">取消</button>
      <ng-container *ngIf="data.mode === 'create'">
        <button mat-raised-button color="primary" [disabled]="!selectedToId" (click)="onCreate()">
          <mat-icon style="margin-right: 4px;">send</mat-icon>
          发起交接
        </button>
      </ng-container>
      <ng-container *ngIf="data.mode === 'confirm'">
        <button mat-raised-button color="primary" (click)="onConfirm()">
          <mat-icon style="margin-right: 4px;">check_circle</mat-icon>
          确认接收
        </button>
      </ng-container>
    </mat-dialog-actions>
  `,
  styles: [`
    .priority-high { background: #ffebee !important; color: #f44336 !important; }
    .priority-medium { background: #fff3e0 !important; color: #ff9800 !important; }
    .priority-low { background: #e8f5e9 !important; color: #4caf50 !important; }
  `],
})
export class HandoverDialogComponent {
  selectedToId = '';
  notes = '';
  pendingItems: ShiftItem[] = [];
  currentDispatcher: Dispatcher | null = null;
  sameRoleDispatchers: Dispatcher[] = [];

  constructor(
    public dialogRef: MatDialogRef<HandoverDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: HandoverDialogData,
    private shiftHandoverService: ShiftHandoverService,
    private authService: AuthService,
    private railwayDataService: RailwayDataService,
    private routeControlService: RouteControlService,
    private faultSimulationService: FaultSimulationService,
    private snackBar: MatSnackBar
  ) {
    this.currentDispatcher = this.authService.getCurrentDispatcher();
    if (this.currentDispatcher) {
      this.sameRoleDispatchers = this.authService
        .getDispatchers()
        .filter(d => d.role === this.currentDispatcher!.role && d.id !== this.currentDispatcher!.id);
    }
    if (data.mode === 'create') {
      this.loadPendingItems();
    }
  }

  loadPendingItems(): void {
    const activeFaults = this.faultSimulationService.getActiveFaults();
    const routes = this.routeControlService.getRoutes();
    const blockRequests = [] as BlockRequest[];
    this.pendingItems = this.shiftHandoverService.collectPendingItems(activeFaults, routes, blockRequests);
  }

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  getRoleColor(role: DispatcherRole): string {
    return ROLE_COLORS[role];
  }

  getPriorityLabel(priority: string): string {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return priority;
    }
  }

  getItemIcon(type: string): string {
    switch (type) {
      case 'fault': return 'error';
      case 'route': return 'route';
      case 'block_request': return 'send';
      default: return 'info';
    }
  }

  onCreate(): void {
    const toDispatcher = this.sameRoleDispatchers.find(d => d.id === this.selectedToId);
    if (!toDispatcher) return;

    const result = this.shiftHandoverService.initiateHandover(toDispatcher, this.notes, this.pendingItems);
    if (result.success) {
      this.snackBar.open('交接班已发起，请等待接班人员确认', '知道了', { duration: 3000 });
      this.dialogRef.close(true);
    } else if (result.message) {
      this.snackBar.open(result.message, '关闭', { duration: 3000, panelClass: ['error-snackbar'] });
    }
  }

  onConfirm(): void {
    if (!this.data.handover) return;
    const result = this.shiftHandoverService.confirmHandover(this.data.handover.id);
    if (result.success) {
      if (this.currentDispatcher) {
        this.authService.switchSession(this.data.handover.toDispatcherId);
      }
      this.snackBar.open('交接班完成', '知道了', { duration: 2000 });
      this.dialogRef.close(true);
    } else if (result.message) {
      this.snackBar.open(result.message, '关闭', { duration: 3000, panelClass: ['error-snackbar'] });
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

@Component({
  selector: 'app-shift-handover-panel',
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
  ],
  templateUrl: './shift-handover-panel.component.html',
  styleUrls: ['./shift-handover-panel.component.scss'],
})
export class ShiftHandoverPanelComponent implements OnInit, OnDestroy {
  myPendingHandovers: ShiftHandover[] = [];
  myInitiatedHandovers: ShiftHandover[] = [];
  completedHandovers: ShiftHandover[] = [];
  currentDispatcher: Dispatcher | null = null;
  canHandover = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private shiftHandoverService: ShiftHandoverService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.authService.currentSession$.subscribe(session => {
        this.currentDispatcher = session?.dispatcher || null;
        this.canHandover = this.authService.hasPermission('canShiftHandover');
        this.refreshLists();
      })
    );

    this.subscriptions.push(
      this.shiftHandoverService.handovers$.subscribe(() => {
        this.refreshLists();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  refreshLists(): void {
    this.myPendingHandovers = this.shiftHandoverService.getMyPendingHandovers();
    this.myInitiatedHandovers = this.shiftHandoverService.getMyInitiatedHandovers();
    this.completedHandovers = this.shiftHandoverService.getCompletedHandovers().slice(0, 20);
  }

  onCreateHandover(): void {
    this.dialog.open(HandoverDialogComponent, {
      width: '500px',
      data: { mode: 'create' },
    });
  }

  onConfirmHandover(handover: ShiftHandover): void {
    this.dialog.open(HandoverDialogComponent, {
      width: '500px',
      data: { mode: 'confirm', handover },
    });
  }

  onCancelHandover(handoverId: string): void {
    const result = this.shiftHandoverService.cancelHandover(handoverId);
    if (result.success) {
      this.snackBar.open('已取消交接班', '知道了', { duration: 2000 });
    } else if (result.message) {
      this.snackBar.open(result.message, '关闭', { duration: 3000, panelClass: ['error-snackbar'] });
    }
  }

  getRoleLabel(role: DispatcherRole): string {
    return ROLE_LABELS[role];
  }

  getRoleColor(role: DispatcherRole): string {
    return ROLE_COLORS[role];
  }

  getItemIcon(type: string): string {
    switch (type) {
      case 'fault': return 'error';
      case 'route': return 'route';
      case 'block_request': return 'send';
      default: return 'info';
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getPendingCount(): number {
    return this.myPendingHandovers.length;
  }
}
