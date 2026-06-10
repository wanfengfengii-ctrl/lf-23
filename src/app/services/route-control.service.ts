import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Route,
  RouteState,
  Switch,
  BlockSection,
  Signal,
  SwitchPosition,
  ConflictAlert,
} from '../models/railway.model';
import { RailwayDataService } from './railway-data.service';

@Injectable({
  providedIn: 'root',
})
export class RouteControlService {
  private routesSubject = new BehaviorSubject<Route[]>([]);
  routes$: Observable<Route[]> = this.routesSubject.asObservable();

  private nextRouteId = 1;

  constructor(private railwayDataService: RailwayDataService) {}

  getRoutes(): Route[] {
    return this.routesSubject.value;
  }

  getRouteById(routeId: string): Route | undefined {
    return this.routesSubject.value.find(r => r.id === routeId);
  }

  addRoute(route: Omit<Route, 'id' | 'state'>): Route {
    const newRoute: Route = {
      ...route,
      id: `R${this.nextRouteId++}`,
      state: 'idle',
    };
    const routes = [...this.routesSubject.value, newRoute];
    this.routesSubject.next(routes);
    return newRoute;
  }

  updateRoute(route: Route): void {
    const routes = this.routesSubject.value.map(r =>
      r.id === route.id ? route : r
    );
    this.routesSubject.next(routes);
  }

  removeRoute(routeId: string): void {
    const route = this.getRouteById(routeId);
    if (route && route.state !== 'idle') {
      this.cancelRoute(routeId);
    }
    const routes = this.routesSubject.value.filter(r => r.id !== routeId);
    this.routesSubject.next(routes);
  }

  removeRoutesByBlockSection(blockSectionId: string): string[] {
    const routesToRemove = this.routesSubject.value.filter(r =>
      r.blockSectionIds.includes(blockSectionId)
    );
    const removedIds = routesToRemove.map(r => r.id);

    routesToRemove.forEach(route => {
      if (route.state !== 'idle') {
        this.cancelRoute(route.id);
      }
    });

    const routes = this.routesSubject.value.filter(r =>
      !r.blockSectionIds.includes(blockSectionId)
    );
    this.routesSubject.next(routes);

    return removedIds;
  }

  setRoute(routeId: string): { success: boolean; conflict?: ConflictAlert } {
    const route = this.getRouteById(routeId);
    if (!route) {
      return {
        success: false,
        conflict: {
          message: `进路 ${routeId} 不存在`,
          type: 'invalid_route',
          routeId,
        },
      };
    }

    if (route.state !== 'idle') {
      return {
        success: false,
        conflict: {
          message: `进路「${route.name}」当前状态为 ${route.state}，无法排列`,
          type: 'invalid_route',
          routeId,
        },
      };
    }

    const conflictCheck = this.checkConflictingRoutes(route);
    if (!conflictCheck.success) {
      return conflictCheck;
    }

    const blockCheck = this.checkBlocksAvailable(route);
    if (!blockCheck.success) {
      return blockCheck;
    }

    const switchCheck = this.checkSwitchesAvailable(route);
    if (!switchCheck.success) {
      return switchCheck;
    }

    this.setSwitchesToRoutePosition(route);

    this.lockRouteBlocks(route);
    this.lockRouteSwitches(route);

    const updatedRoute: Route = {
      ...route,
      state: 'setup',
    };
    this.updateRoute(updatedRoute);

    this.openEntrySignal(route);

    return { success: true };
  }

  cancelRoute(routeId: string): boolean {
    const route = this.getRouteById(routeId);
    if (!route) return false;

    if (route.state === 'locked' || route.state === 'used') {
      return false;
    }

    this.closeEntrySignal(route);
    this.unlockRouteBlocks(route);
    this.unlockRouteSwitches(route);

    const updatedRoute: Route = {
      ...route,
      state: 'idle',
      unlockTimer: undefined,
    };
    this.updateRoute(updatedRoute);

    return true;
  }

  lockRouteForTrain(routeId: string, trainId: string): boolean {
    const route = this.getRouteById(routeId);
    if (!route || route.state !== 'setup') return false;

    const updatedRoute: Route = {
      ...route,
      state: 'locked',
      lockedByTrainId: trainId,
    };
    this.updateRoute(updatedRoute);

    return true;
  }

  markRouteUsed(routeId: string): void {
    const route = this.getRouteById(routeId);
    if (!route) return;

    const updatedRoute: Route = {
      ...route,
      state: 'used',
    };
    this.updateRoute(updatedRoute);
  }

  startDelayedUnlock(routeId: string, delaySeconds: number = 3): void {
    const route = this.getRouteById(routeId);
    if (!route || route.state !== 'used') return;

    const updatedRoute: Route = {
      ...route,
      state: 'unlocking',
      unlockTimer: delaySeconds,
    };
    this.updateRoute(updatedRoute);
  }

  tickUnlock(deltaSeconds: number): void {
    const routes = this.routesSubject.value;
    let changed = false;

    const updatedRoutes = routes.map(route => {
      if (route.state === 'unlocking' && route.unlockTimer !== undefined) {
        const newTimer = route.unlockTimer - deltaSeconds;
        if (newTimer <= 0) {
          changed = true;
          this.closeEntrySignal(route);
          this.unlockRouteBlocks(route);
          this.unlockRouteSwitches(route);
          return {
            ...route,
            state: 'idle' as RouteState,
            unlockTimer: undefined,
            lockedByTrainId: undefined,
          };
        }
        changed = true;
        return { ...route, unlockTimer: newTimer };
      }
      return route;
    });

    if (changed) {
      this.routesSubject.next(updatedRoutes);
    }
  }

  private checkConflictingRoutes(route: Route): { success: boolean; conflict?: ConflictAlert } {
    const allRoutes = this.routesSubject.value;
    const activeRoutes = allRoutes.filter(r => r.id !== route.id && r.state !== 'idle');

    for (const activeRoute of activeRoutes) {
      const hasOverlap = route.blockSectionIds.some(blockId =>
        activeRoute.blockSectionIds.includes(blockId)
      );

      if (hasOverlap) {
        return {
          success: false,
          conflict: {
            message: `敌对进路冲突：进路「${route.name}」与「${activeRoute.name}」存在重叠区段`,
            type: 'conflicting_route',
            routeId: route.id,
          },
        };
      }

      const hasSwitchConflict = route.switchIds.some(swId =>
        activeRoute.switchIds.includes(swId)
      );

      if (hasSwitchConflict) {
        const conflictingSwitch = route.switchPositions.find(sp =>
          activeRoute.switchPositions.some(
            asp => asp.switchId === sp.switchId && asp.position !== sp.position
          )
        );

        if (conflictingSwitch) {
          return {
            success: false,
            conflict: {
              message: `敌对进路冲突：道岔位置冲突 - 进路「${route.name}」与「${activeRoute.name}」`,
              type: 'conflicting_route',
              routeId: route.id,
            },
          };
        }
      }
    }

    return { success: true };
  }

  private checkBlocksAvailable(route: Route): { success: boolean; conflict?: ConflictAlert } {
    const blocks = this.railwayDataService.getBlockSections();

    for (const blockId of route.blockSectionIds) {
      const block = blocks.find(b => b.id === blockId);
      if (!block) {
        return {
          success: false,
          conflict: {
            message: `进路「${route.name}」包含不存在的区段 ${blockId}`,
            type: 'invalid_route',
            routeId: route.id,
          },
        };
      }

      if (block.isOccupied) {
        return {
          success: false,
          conflict: {
            message: `进路「${route.name}」的区段「${block.name}」已被占用`,
            type: 'block_already_occupied',
            blockSectionId: blockId,
            routeId: route.id,
          },
        };
      }

      if (block.isRouteLocked) {
        return {
          success: false,
          conflict: {
            message: `进路「${route.name}」的区段「${block.name}」已被其他进路锁闭`,
            type: 'conflicting_route',
            blockSectionId: blockId,
            routeId: route.id,
          },
        };
      }
    }

    return { success: true };
  }

  private checkSwitchesAvailable(route: Route): { success: boolean; conflict?: ConflictAlert } {
    const switches = this.railwayDataService.getSwitches();

    for (const switchId of route.switchIds) {
      const sw = switches.find(s => s.id === switchId);
      if (!sw) {
        return {
          success: false,
          conflict: {
            message: `进路「${route.name}」包含不存在的道岔 ${switchId}`,
            type: 'invalid_route',
            routeId: route.id,
          },
        };
      }

      if (sw.isLocked) {
        return {
          success: false,
          conflict: {
            message: `进路「${route.name}」的道岔「${sw.name}」已被锁闭`,
            type: 'switch_locked',
            routeId: route.id,
          },
        };
      }
    }

    return { success: true };
  }

  private setSwitchesToRoutePosition(route: Route): void {
    const switches = this.railwayDataService.getSwitches();

    for (const sp of route.switchPositions) {
      const sw = switches.find(s => s.id === sp.switchId);
      if (sw && sw.position !== sp.position) {
        this.railwayDataService.updateSwitch({
          ...sw,
          position: sp.position,
        });
      }
    }
  }

  private lockRouteBlocks(route: Route): void {
    const blocks = this.railwayDataService.getBlockSections();

    const updatedBlocks = blocks.map(block => {
      if (route.blockSectionIds.includes(block.id)) {
        return {
          ...block,
          isRouteLocked: true,
          lockedByRouteId: route.id,
        };
      }
      return block;
    });

    this.railwayDataService.setBlockSections(updatedBlocks);
  }

  private unlockRouteBlocks(route: Route): void {
    const blocks = this.railwayDataService.getBlockSections();

    const updatedBlocks = blocks.map(block => {
      if (block.lockedByRouteId === route.id) {
        return {
          ...block,
          isRouteLocked: false,
          lockedByRouteId: undefined,
        };
      }
      return block;
    });

    this.railwayDataService.setBlockSections(updatedBlocks);
  }

  private lockRouteSwitches(route: Route): void {
    const switches = this.railwayDataService.getSwitches();

    const updatedSwitches = switches.map(sw => {
      if (route.switchIds.includes(sw.id)) {
        return {
          ...sw,
          isLocked: true,
          lockedByRouteId: route.id,
        };
      }
      return sw;
    });

    this.railwayDataService.setSwitches(updatedSwitches);
  }

  private unlockRouteSwitches(route: Route): void {
    const switches = this.railwayDataService.getSwitches();

    const updatedSwitches = switches.map(sw => {
      if (sw.lockedByRouteId === route.id) {
        return {
          ...sw,
          isLocked: false,
          lockedByRouteId: undefined,
        };
      }
      return sw;
    });

    this.railwayDataService.setSwitches(updatedSwitches);
  }

  private openEntrySignal(route: Route): void {
    const signals = this.railwayDataService.getSignals();
    const startSignal = signals.find(s => s.id === route.startSignalId);

    if (startSignal) {
      this.railwayDataService.updateSignal({
        ...startSignal,
        state: 'clear',
      });
    }
  }

  private closeEntrySignal(route: Route): void {
    const signals = this.railwayDataService.getSignals();
    const startSignal = signals.find(s => s.id === route.startSignalId);

    if (startSignal) {
      this.railwayDataService.updateSignal({
        ...startSignal,
        state: 'stop',
        isManualMode: false,
      });
    }
  }

  setSignalManual(signalId: string, state: 'clear' | 'stop'): { success: boolean; message?: string } {
    const signals = this.railwayDataService.getSignals();
    const signal = signals.find(s => s.id === signalId);

    if (!signal) return { success: false, message: '信号机不存在' };

    if (state === 'clear') {
      const blocks = this.railwayDataService.getBlockSections();
      const switches = this.railwayDataService.getSwitches();

      if (signal.position === 'exit') {
        const block = blocks.find(b => b.id === signal.blockSectionId);
        if (block && block.isOccupied) {
          return { success: false, message: '前方区间占用，无法开放信号' };
        }
      }

      if (signal.position === 'entry') {
        const stationId = signal.stationId;
        const stationRoutes = this.routesSubject.value.filter(route => {
          const endSignal = signals.find(s => s.id === route.endSignalId);
          return endSignal && endSignal.id === signalId;
        });

        if (stationRoutes.length > 0) {
          const hasSetupRoute = stationRoutes.some(r => r.state === 'setup' || r.state === 'locked');
          if (!hasSetupRoute) {
            const block = blocks.find(b => b.id === signal.blockSectionId);
            if (block && block.isOccupied) {
              return { success: false, message: '接车区间占用，无法开放信号' };
            }
          }
        } else {
          const block = blocks.find(b => b.id === signal.blockSectionId);
          if (block && block.isOccupied) {
            return { success: false, message: '接车区间占用，无法开放信号' };
          }
        }
      }

      const relatedSwitches = switches.filter(
        sw => sw.commonBlockId === signal.blockSectionId ||
             sw.normalBlockId === signal.blockSectionId ||
             sw.reverseBlockId === signal.blockSectionId
      );
      for (const sw of relatedSwitches) {
        if (sw.isLocked) {
          const currentBlockId = sw.position === 'normal' ? sw.normalBlockId : sw.reverseBlockId;
          if (signal.blockSectionId !== sw.commonBlockId && signal.blockSectionId !== currentBlockId) {
            return { success: false, message: `道岔「${sw.name}」位置不符，无法开放信号` };
          }
        }
      }
    }

    this.railwayDataService.updateSignal({
      ...signal,
      state,
      isManualMode: true,
    });

    return { success: true };
  }

  findRoutesForTrain(
    fromStationId: string,
    toStationId: string,
    direction: 'forward' | 'backward'
  ): Route[] {
    const routes = this.routesSubject.value;
    const signals = this.railwayDataService.getSignals();

    return routes.filter(route => {
      const startSignal = signals.find(s => s.id === route.startSignalId);
      const endSignal = signals.find(s => s.id === route.endSignalId);

      if (!startSignal || !endSignal) return false;

      if (direction === 'forward') {
        return startSignal.stationId === fromStationId && endSignal.stationId === toStationId;
      } else {
        return startSignal.stationId === toStationId && endSignal.stationId === fromStationId;
      }
    });
  }

  getAvailableRoutesForStation(stationId: string): Route[] {
    const routes = this.routesSubject.value;
    const signals = this.railwayDataService.getSignals();

    return routes.filter(route => {
      const startSignal = signals.find(s => s.id === route.startSignalId);
      return startSignal && startSignal.stationId === stationId;
    });
  }

  setRoutes(routes: Route[]): void {
    this.routesSubject.next(routes);
  }

  resetAll(): void {
    const routes = this.routesSubject.value.map(route => ({
      ...route,
      state: 'idle' as RouteState,
      lockedByTrainId: undefined,
      unlockTimer: undefined,
    }));
    this.routesSubject.next(routes);
  }
}
