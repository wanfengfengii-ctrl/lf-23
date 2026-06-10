import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RailwayMapComponent } from './components/railway-map/railway-map.component';
import { ControlPanelComponent } from './components/control-panel/control-panel.component';
import { ConfigPanelComponent } from './components/config-panel/config-panel.component';
import { DispatcherPanelComponent } from './components/dispatcher-panel/dispatcher-panel.component';
import { TimelineComponent } from './components/timeline/timeline.component';
import { SimulationService } from './services/simulation.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    RailwayMapComponent,
    ControlPanelComponent,
    ConfigPanelComponent,
    DispatcherPanelComponent,
    TimelineComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [SimulationService],
})
export class AppComponent {
  title = '铁路人工闭塞高级仿真系统';
  showConfigPanel = false;
  showDispatcherPanel = true;
}
