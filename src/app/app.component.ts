import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RailwayMapComponent } from './components/railway-map/railway-map.component';
import { ControlPanelComponent } from './components/control-panel/control-panel.component';
import { ConfigPanelComponent } from './components/config-panel/config-panel.component';
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
    TimelineComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [SimulationService],
})
export class AppComponent {
  title = '铁路闭塞系统模拟器';
  showConfigPanel = true;
}

