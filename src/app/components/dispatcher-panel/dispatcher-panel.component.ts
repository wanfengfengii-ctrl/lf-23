import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import {
  Route,
  Signal,
  Switch,
  BlockRequest,
  DispatcherAction,
  Station,
} from '../../models/railway.model';
import { RouteControlService } from '../../services/route-control.service';
import { RailwayDataService } from '../../services/railway-data.service';
import { SimulationService } from '../../services/simulation.service';

@Component({
  selector: 'app-dispatcher-panel',
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
  ],
  templateUrl: './dispatcher-panel.component.html',
  styleUrls: ['./dispatcher-panel.component.scss'],
})
export class DispatcherPanelComponent implements OnInit, OnDestroy {
  routes: Route[] = [];
  signals: Signal[] = [];
  switches: Switch[] = [];
  stations: Station[] = [];
  blockRequests: BlockRequest[] = [];
  dispatcherActions: DispatcherAction[] = [];

  selectedStationId = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private routeControlService: RouteControlService,
    private railwayDataService: RailwayDataService,
    private simulationService: SimulationService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.routeControlService.routes$.subscribe(routes => {
        this.routes = routes;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.signals$.subscribe(signals => {
        this.signals = signals;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.switches$.subscribe(switches => {
        this.switches = switches;
      })
    );

    this.subscriptions.push(
      this.railwayDataService.stations$.subscribe(stations => {
        this.stations = stations;
        if (stations.length > 0 && !this.selectedStationId) {
          this.selectedStationId = stations[0].id;
        }
      })
    );

    this.subscriptions.push(
      this.simulationService.blockRequests$.subscribe(requests => {
        this.blockRequests = requests;
      })
    );

    this.subscriptions.push(
      this.simulationService.dispatcherActions$.subscribe(actions => {
        this.dispatcherActions = [...actions].reverse().slice(0, 50);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onSetRoute(routeId: string): void {
    const result = this.simulationService.setRoute(routeId);
    if (!result.success && result.conflict) {
      console.warn('进路排列失败:', result.conflict.message);
    }
  }

  onCancelRoute(routeId: string): void {
    this.simulationService.cancelRoute(routeId);
  }

  onToggleSignal(signalId: string): void {
    const signal = this.signals.find(s => s.id === signalId);
    if (!signal) return;

    const newState = signal.state === 'clear' ? 'stop' : 'clear';
    this.simulationService.setSignalManual(signalId, newState);
  }

  onToggleSwitch(switchId: string): void {
    const sw = this.switches.find(s => s.id === switchId);
    if (!sw || sw.isLocked) return;

    const newPosition = sw.position === 'normal' ? 'reverse' : 'normal';
    this.simulationService.setSwitchPosition(switchId, newPosition);
  }

  onConfirmRequest(requestId: string, confirm: boolean): void {
    this.simulationService.confirmBlockRequest(requestId, confirm);
  }

  getRouteStatusClass(state: string): string {
    switch (state) {
      case 'idle':
        return 'status-idle';
      case 'setup':
        return 'status-setup';
      case 'locked':
        return 'status-locked';
      case 'used':
        return 'status-used';
      case 'unlocking':
        return 'status-unlocking';
      default:
        return '';
    }
  }

  getRouteStatusText(state: string): string {
    switch (state) {
      case 'idle':
        return '空闲';
      case 'setup':
        return '已排列';
      case 'locked':
        return '锁闭中';
      case 'used':
        return '使用中';
      case 'unlocking':
        return '延时解锁';
      default:
        return state;
    }
  }

  getStationRoutes(stationId: string): Route[] {
    return this.routes.filter(route => {
      const startSignal = this.signals.find(s => s.id === route.startSignalId);
      return startSignal && startSignal.stationId === stationId;
    });
  }

  getStationSignals(stationId: string): Signal[] {
    return this.signals.filter(s => s.stationId === stationId);
  }

  getStationSwitches(stationId: string): Switch[] {
    return this.switches.filter(sw => sw.stationId === stationId);
  }

  getPendingRequests(): BlockRequest[] {
    return this.blockRequests.filter(r => r.status === 'pending');
  }

  getStationName(stationId: string): string {
    const station = this.stations.find(s => s.id === stationId);
    return station ? station.name : stationId;
  }

  getActionIcon(type: string): string {
    switch (type) {
      case 'set_route':
        return 'route';
      case 'cancel_route':
        return 'cancel';
      case 'manual_signal':
        return 'traffic';
      case 'switch_position':
        return 'shuffle';
      case 'block_request':
        return 'send';
      case 'block_confirm':
        return 'check_circle';
      case 'emergency_stop':
        return 'warning';
      default:
        return 'info';
    }
  }

  getActionTypeText(type: string): string {
    switch (type) {
      case 'set_route':
        return '排列进路';
      case 'cancel_route':
        return '取消进路';
      case 'manual_signal':
        return '人工信号';
      case 'switch_position':
        return '道岔操作';
      case 'block_request':
        return '闭塞请求';
      case 'block_confirm':
        return '闭塞确认';
      case 'emergency_stop':
        return '紧急停车';
      default:
        return type;
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
