import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { SimulationState, ConflictAlert } from '../../models/railway.model';
import { SimulationService } from '../../services/simulation.service';
import { ConflictDialogComponent } from '../conflict-dialog/conflict-dialog.component';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    MatDialogModule,
  ],
  templateUrl: './control-panel.component.html',
  styleUrls: ['./control-panel.component.scss'],
})
export class ControlPanelComponent implements OnInit, OnDestroy {
  state: SimulationState = {
    currentTime: 0,
    isRunning: false,
    isPaused: false,
    speedMultiplier: 1,
    mode: 'live',
  };
  speedOptions = [0.5, 1, 2, 4, 8];
  currentSpeedIndex = 1;

  private subscriptions: Subscription[] = [];

  constructor(
    private simulationService: SimulationService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.simulationService.state$.subscribe(state => {
        this.state = state;

        if (state.conflictAlert) {
          this.showConflictDialog(state.conflictAlert);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onPlayPause(): void {
    if (this.state.mode === 'playback') {
      if (this.state.isRunning && !this.state.isPaused) {
        this.simulationService.pause();
      } else {
        this.simulationService.start();
      }
    } else {
      if (this.state.isRunning && !this.state.isPaused) {
        this.simulationService.pause();
      } else {
        if (this.state.conflictAlert) {
          this.simulationService.dismissConflict();
        }
        this.simulationService.start();
      }
    }
  }

  onReset(): void {
    this.simulationService.reset();
  }

  onSpeedChange(): void {
    this.currentSpeedIndex = (this.currentSpeedIndex + 1) % this.speedOptions.length;
    this.simulationService.setSpeed(this.speedOptions[this.currentSpeedIndex]);
  }

  onPlayback(): void {
    this.simulationService.startPlayback();
  }

  onLive(): void {
    this.simulationService.switchToLive();
  }

  private showConflictDialog(conflict: ConflictAlert): void {
    this.dialog.open(ConflictDialogComponent, {
      width: '400px',
      data: conflict,
    }).afterClosed().subscribe(() => {
      this.simulationService.dismissConflict();
    });
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
