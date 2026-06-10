import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  ShiftHandover,
  ShiftItem,
  Dispatcher,
  DispatcherRole,
  Fault,
  Route,
  BlockRequest,
} from '../models/railway.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ShiftHandoverService {
  private handoversSubject = new BehaviorSubject<ShiftHandover[]>([]);
  handovers$: Observable<ShiftHandover[]> = this.handoversSubject.asObservable();

  private nextHandoverId = 1;
  private nextItemId = 1;
  private simTime = 0;

  constructor(private authService: AuthService) {}

  setSimTime(time: number): void {
    this.simTime = time;
  }

  getHandovers(): ShiftHandover[] {
    return this.handoversSubject.value;
  }

  getPendingHandovers(): ShiftHandover[] {
    return this.handoversSubject.value.filter(h => h.status === 'pending');
  }

  getCompletedHandovers(): ShiftHandover[] {
    return this.handoversSubject.value.filter(h => h.status === 'completed');
  }

  getMyPendingHandovers(dispatcherId?: string): ShiftHandover[] {
    const id = dispatcherId || this.authService.getCurrentDispatcher()?.id;
    if (!id) return [];
    return this.handoversSubject.value.filter(
      h => h.status === 'pending' && h.toDispatcherId === id
    );
  }

  getMyInitiatedHandovers(dispatcherId?: string): ShiftHandover[] {
    const id = dispatcherId || this.authService.getCurrentDispatcher()?.id;
    if (!id) return [];
    return this.handoversSubject.value.filter(h => h.fromDispatcherId === id);
  }

  collectPendingItems(
    activeFaults: Fault[],
    routes: Route[],
    blockRequests: BlockRequest[]
  ): ShiftItem[] {
    const items: ShiftItem[] = [];

    activeFaults
      .filter(f => f.status !== 'resolved')
      .forEach(fault => {
        items.push({
          id: 'ITEM_' + this.nextItemId++,
          type: 'fault',
          targetId: fault.id,
          targetName: fault.targetName,
          description: `故障处置中：${fault.description} (${this.getSeverityLabel(fault.severity)})`,
          priority: fault.severity === 'critical' ? 'high' : fault.severity === 'major' ? 'high' : 'medium',
        });
      });

    routes
      .filter(r => r.state === 'locked' || r.state === 'used')
      .forEach(route => {
        items.push({
          id: 'ITEM_' + this.nextItemId++,
          type: 'route',
          targetId: route.id,
          targetName: route.name,
          description: `进路状态：${this.getRouteStateLabel(route.state)}`,
          priority: route.state === 'used' ? 'high' : 'medium',
        });
      });

    blockRequests
      .filter(r => r.status === 'pending')
      .forEach(req => {
        items.push({
          id: 'ITEM_' + this.nextItemId++,
          type: 'block_request',
          targetId: req.id,
          targetName: `${req.fromStationId}→${req.toStationId}`,
          description: '待确认闭塞请求',
          priority: 'high',
        });
      });

    return items;
  }

  initiateHandover(
    toDispatcher: Dispatcher,
    notes: string,
    additionalItems?: ShiftItem[]
  ): { success: boolean; handover?: ShiftHandover; message?: string } {
    const fromDispatcher = this.authService.getCurrentDispatcher();
    if (!fromDispatcher) {
      return { success: false, message: '当前未登录' };
    }

    if (!this.authService.hasPermission('canShiftHandover')) {
      return { success: false, message: `${this.authService.getRoleLabel(fromDispatcher.role)}无交接班权限` };
    }

    if (fromDispatcher.role !== toDispatcher.role) {
      return { success: false, message: '交接班双方角色必须相同' };
    }

    if (fromDispatcher.id === toDispatcher.id) {
      return { success: false, message: '不能交接给自己' };
    }

    const pendingItems = [...(additionalItems || [])];
    if (pendingItems.length === 0) {
      pendingItems.push({
        id: 'ITEM_' + this.nextItemId++,
        type: 'other',
        targetId: 'general',
        targetName: '常规交接',
        description: notes || '无特殊事项',
        priority: 'low',
      });
    }

    const handover: ShiftHandover = {
      id: 'HO_' + this.nextHandoverId++,
      fromDispatcherId: fromDispatcher.id,
      fromDispatcherName: fromDispatcher.realName,
      toDispatcherId: toDispatcher.id,
      toDispatcherName: toDispatcher.realName,
      fromRole: fromDispatcher.role,
      toRole: toDispatcher.role,
      handoverTime: this.simTime,
      notes,
      pendingItems,
      status: 'pending',
    };

    const handovers = [...this.handoversSubject.value, handover];
    this.handoversSubject.next(handovers);

    return { success: true, handover };
  }

  confirmHandover(handoverId: string): { success: boolean; message?: string } {
    const handover = this.handoversSubject.value.find(h => h.id === handoverId);
    if (!handover) {
      return { success: false, message: '交接班记录不存在' };
    }

    const currentDispatcher = this.authService.getCurrentDispatcher();
    if (!currentDispatcher || currentDispatcher.id !== handover.toDispatcherId) {
      return { success: false, message: '只有接班人员可以确认交接' };
    }

    if (handover.status !== 'pending') {
      return { success: false, message: '该交接班状态不允许确认' };
    }

    const updatedHandovers = this.handoversSubject.value.map(h =>
      h.id === handoverId
        ? {
            ...h,
            status: 'completed' as const,
            confirmTime: this.simTime,
          }
        : h
    );
    this.handoversSubject.next(updatedHandovers);

    return { success: true };
  }

  cancelHandover(handoverId: string): { success: boolean; message?: string } {
    const handover = this.handoversSubject.value.find(h => h.id === handoverId);
    if (!handover) {
      return { success: false, message: '交接班记录不存在' };
    }

    const currentDispatcher = this.authService.getCurrentDispatcher();
    if (
      !currentDispatcher ||
      (currentDispatcher.id !== handover.fromDispatcherId &&
        currentDispatcher.id !== handover.toDispatcherId)
    ) {
      return { success: false, message: '只有交接双方可以取消交接' };
    }

    if (handover.status !== 'pending') {
      return { success: false, message: '该交接班状态不允许取消' };
    }

    const updatedHandovers = this.handoversSubject.value.map(h =>
      h.id === handoverId ? { ...h, status: 'cancelled' as const } : h
    );
    this.handoversSubject.next(updatedHandovers);

    return { success: true };
  }

  private getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'minor':
        return '轻微';
      case 'major':
        return '严重';
      case 'critical':
        return '危急';
      default:
        return severity;
    }
  }

  private getRouteStateLabel(state: string): string {
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

  getRoleLabel(role: DispatcherRole): string {
    return this.authService.getRoleLabel(role);
  }

  reset(): void {
    this.handoversSubject.next([]);
    this.nextHandoverId = 1;
    this.nextItemId = 1;
  }
}