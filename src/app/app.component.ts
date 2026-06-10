import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { RailwayMapComponent } from './components/railway-map/railway-map.component';
import { ControlPanelComponent } from './components/control-panel/control-panel.component';
import { ConfigPanelComponent } from './components/config-panel/config-panel.component';
import { DispatcherPanelComponent } from './components/dispatcher-panel/dispatcher-panel.component';
import { FaultPanelComponent } from './components/fault-panel/fault-panel.component';
import { TimelineComponent } from './components/timeline/timeline.component';
import { SimulationService } from './services/simulation.service';
import { FaultSimulationService } from './services/fault-simulation.service';
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
    RailwayMapComponent,
    ControlPanelComponent,
    ConfigPanelComponent,
    DispatcherPanelComponent,
    FaultPanelComponent,
    TimelineComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [SimulationService, FaultSimulationService],
})
export class AppComponent {
  title = '铁路人工闭塞高级仿真系统';
  showConfigPanel = false;
  showDispatcherPanel = true;
  showFaultPanel = true;

  activeFaultCount = 0;
  private subscriptions: Subscription[] = [];

  constructor(private faultSimulationService: FaultSimulationService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.faultSimulationService.state$.subscribe(state => {
        this.activeFaultCount = state.faults.filter(f => f.status !== 'resolved').length;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
