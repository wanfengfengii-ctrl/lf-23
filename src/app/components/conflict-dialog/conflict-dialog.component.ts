import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConflictAlert } from '../../models/railway.model';

@Component({
  selector: 'app-conflict-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './conflict-dialog.component.html',
  styleUrls: ['./conflict-dialog.component.scss'],
})
export class ConflictDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConflictDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConflictAlert
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }

  getConflictTitle(): string {
    switch (this.data.type) {
      case 'block_already_occupied':
        return '区间占用冲突';
      case 'signal_at_stop':
        return '信号机阻挡';
      case 'no_connection':
        return '线路不连通';
      case 'invalid_route':
        return '无效路径';
      case 'conflicting_route':
        return '敌对进路冲突';
      case 'switch_locked':
        return '道岔已锁闭';
      case 'route_setup_failed':
        return '进路排列失败';
      case 'fault_violation':
        return '故障安全违规';
      case 'sequence_violation':
        return '处置顺序违规';
      default:
        return '冲突警告';
    }
  }

  getConflictIcon(): string {
    switch (this.data.type) {
      case 'block_already_occupied':
        return 'warning';
      case 'signal_at_stop':
        return 'block';
      case 'no_connection':
        return 'link_off';
      case 'fault_violation':
        return 'error';
      case 'sequence_violation':
        return 'report_problem';
      default:
        return 'error';
    }
  }
}
