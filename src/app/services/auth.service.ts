import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Dispatcher,
  DispatcherRole,
  DispatcherSession,
  ROLE_PERMISSIONS,
  RolePermission,
  AuthPermissionKey,
  PermissionViolation,
  SimulationState,
} from '../models/railway.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private dispatchersSubject = new BehaviorSubject<Dispatcher[]>([]);
  dispatchers$: Observable<Dispatcher[]> = this.dispatchersSubject.asObservable();

  private activeSessionsSubject = new BehaviorSubject<DispatcherSession[]>([]);
  activeSessions$: Observable<DispatcherSession[]> = this.activeSessionsSubject.asObservable();

  private currentSessionSubject = new BehaviorSubject<DispatcherSession | null>(null);
  currentSession$: Observable<DispatcherSession | null> = this.currentSessionSubject.asObservable();

  private permissionViolationsSubject = new BehaviorSubject<PermissionViolation[]>([]);
  permissionViolations$: Observable<PermissionViolation[]> = this.permissionViolationsSubject.asObservable();

  private simTime = 0;

  constructor() {
    this.initializeDefaultDispatchers();
  }

  private initializeDefaultDispatchers(): void {
    const dispatchers: Dispatcher[] = [
      {
        id: 'U001',
        username: 'station1',
        password: '123456',
        realName: '张三',
        role: 'station_dispatcher',
        stationScope: ['S1'],
        isActive: true,
        avatarColor: '#2196f3',
      },
      {
        id: 'U002',
        username: 'station2',
        password: '123456',
        realName: '李四',
        role: 'station_dispatcher',
        stationScope: ['S3', 'S4'],
        isActive: true,
        avatarColor: '#03a9f4',
      },
      {
        id: 'U003',
        username: 'section1',
        password: '123456',
        realName: '王五',
        role: 'section_dispatcher',
        sectionScope: ['B1', 'B2', 'B3', 'B4'],
        isActive: true,
        avatarColor: '#ff9800',
      },
      {
        id: 'U004',
        username: 'chief1',
        password: '123456',
        realName: '赵六',
        role: 'chief_dispatcher',
        isActive: true,
        avatarColor: '#f44336',
      },
      {
        id: 'U005',
        username: 'station3',
        password: '123456',
        realName: '孙七',
        role: 'station_dispatcher',
        stationScope: ['S5'],
        isActive: true,
        avatarColor: '#00bcd4',
      },
    ];
    this.dispatchersSubject.next(dispatchers);
  }

  setSimTime(time: number): void {
    this.simTime = time;
  }

  getDispatchers(): Dispatcher[] {
    return this.dispatchersSubject.value;
  }

  getDispatcherById(id: string): Dispatcher | undefined {
    return this.dispatchersSubject.value.find(d => d.id === id);
  }

  getActiveSessions(): DispatcherSession[] {
    return this.activeSessionsSubject.value;
  }

  getCurrentSession(): DispatcherSession | null {
    return this.currentSessionSubject.value;
  }

  getCurrentDispatcher(): Dispatcher | null {
    return this.currentSessionSubject.value?.dispatcher || null;
  }

  getCurrentRole(): DispatcherRole | null {
    return this.currentSessionSubject.value?.dispatcher?.role || null;
  }

  login(username: string, password: string): { success: boolean; message?: string; session?: DispatcherSession } {
    const dispatcher = this.dispatchersSubject.value.find(
      d => d.username === username && d.password === password
    );

    if (!dispatcher) {
      return { success: false, message: '用户名或密码错误' };
    }

    if (!dispatcher.isActive) {
      return { success: false, message: '该账户已被禁用' };
    }

    const existingSession = this.activeSessionsSubject.value.find(
      s => s.dispatcher.id === dispatcher.id
    );
    if (existingSession) {
      this.logout(dispatcher.id);
    }

    const sessionId = 'SESS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const session: DispatcherSession = {
      dispatcher: {
        ...dispatcher,
        loginTime: Date.now(),
        lastActiveTime: Date.now(),
      },
      loginTime: Date.now(),
      sessionId,
    };

    const sessions = [...this.activeSessionsSubject.value, session];
    this.activeSessionsSubject.next(sessions);
    this.currentSessionSubject.next(session);

    this.updateDispatcher(dispatcher.id, {
      loginTime: Date.now(),
      lastActiveTime: Date.now(),
    });

    return { success: true, session };
  }

  logout(dispatcherId?: string): boolean {
    const id = dispatcherId || this.currentSessionSubject.value?.dispatcher.id;
    if (!id) return false;

    const sessions = this.activeSessionsSubject.value.filter(s => s.dispatcher.id !== id);
    this.activeSessionsSubject.next(sessions);

    if (this.currentSessionSubject.value?.dispatcher.id === id) {
      this.currentSessionSubject.next(null);
    }

    this.updateDispatcher(id, { lastActiveTime: Date.now() });
    return true;
  }

  switchSession(dispatcherId: string): boolean {
    const session = this.activeSessionsSubject.value.find(s => s.dispatcher.id === dispatcherId);
    if (session) {
      this.currentSessionSubject.next(session);
      this.updateDispatcher(dispatcherId, { lastActiveTime: Date.now() });
      return true;
    }
    return false;
  }

  getPermissions(role: DispatcherRole): RolePermission {
    return { ...ROLE_PERMISSIONS[role] };
  }

  getCurrentPermissions(): RolePermission | null {
    const role = this.getCurrentRole();
    return role ? this.getPermissions(role) : null;
  }

  hasPermission(permission: AuthPermissionKey, dispatcher?: Dispatcher): boolean {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return false;
    const permissions = this.getPermissions(d.role);
    return permissions[permission] === true;
  }

  canOperateSignal(signalId: string, stationId: string, dispatcher?: Dispatcher): { allowed: boolean; reason?: string } {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return { allowed: false, reason: '未登录' };

    if (!this.hasPermission('canManualSignal', d)) {
      return { allowed: false, reason: `${this.getRoleLabel(d.role)}无信号机操作权限` };
    }

    if (d.role === 'station_dispatcher' && d.stationScope) {
      if (!d.stationScope.includes(stationId)) {
        return { allowed: false, reason: '超出管辖车站范围' };
      }
    }

    return { allowed: true };
  }

  canOperateSwitch(switchId: string, stationId: string, dispatcher?: Dispatcher): { allowed: boolean; reason?: string } {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return { allowed: false, reason: '未登录' };

    if (!this.hasPermission('canSwitchPosition', d)) {
      return { allowed: false, reason: `${this.getRoleLabel(d.role)}无道岔操作权限` };
    }

    if (d.role === 'station_dispatcher' && d.stationScope) {
      if (!d.stationScope.includes(stationId)) {
        return { allowed: false, reason: '超出管辖车站范围' };
      }
    }

    return { allowed: true };
  }

  canOperateRoute(routeId: string, startStationId: string, endStationId: string, dispatcher?: Dispatcher): { allowed: boolean; reason?: string } {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return { allowed: false, reason: '未登录' };

    if (!this.hasPermission('canSetRoute', d)) {
      return { allowed: false, reason: `${this.getRoleLabel(d.role)}无进路操作权限` };
    }

    if (d.role === 'station_dispatcher' && d.stationScope) {
      if (!d.stationScope.includes(startStationId) && !d.stationScope.includes(endStationId)) {
        return { allowed: false, reason: '进路不在管辖车站范围内' };
      }
    }

    return { allowed: true };
  }

  canOperateBlockSection(blockSectionId: string, fromStationId: string, toStationId: string, dispatcher?: Dispatcher): { allowed: boolean; reason?: string } {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return { allowed: false, reason: '未登录' };

    if (d.role === 'station_dispatcher' && d.stationScope) {
      if (!d.stationScope.includes(fromStationId) && !d.stationScope.includes(toStationId)) {
        return { allowed: false, reason: '区间不在管辖车站范围内' };
      }
    }

    if (d.role === 'section_dispatcher' && d.sectionScope) {
      if (!d.sectionScope.includes(blockSectionId)) {
        return { allowed: false, reason: '超出管辖区间范围' };
      }
    }

    return { allowed: true };
  }

  canConfirmBlockRequest(dispatcher?: Dispatcher): { allowed: boolean; reason?: string } {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return { allowed: false, reason: '未登录' };

    if (!this.hasPermission('canBlockConfirm', d)) {
      return { allowed: false, reason: `${this.getRoleLabel(d.role)}无闭塞确认权限` };
    }

    return { allowed: true };
  }

  canApprove(dispatcher?: Dispatcher): { allowed: boolean; reason?: string } {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return { allowed: false, reason: '未登录' };

    if (!this.hasPermission('canApprove', d)) {
      return { allowed: false, reason: `${this.getRoleLabel(d.role)}无审批权限` };
    }

    return { allowed: true };
  }

  requiresApproval(actionType: string, dispatcher?: Dispatcher): boolean {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return true;

    if (d.role === 'chief_dispatcher') return false;

    const approvalRequiredMap: Record<string, DispatcherRole[]> = {
      set_route: ['station_dispatcher'],
      cancel_route: ['station_dispatcher'],
      manual_signal: ['station_dispatcher'],
      switch_position: ['station_dispatcher'],
      block_confirm: ['station_dispatcher'],
      emergency_stop: [],
      trigger_fault: ['station_dispatcher', 'section_dispatcher'],
      resolve_fault: ['station_dispatcher'],
      block_section: ['station_dispatcher', 'section_dispatcher'],
      unblock_section: ['station_dispatcher', 'section_dispatcher'],
      speed_restriction: ['station_dispatcher'],
      lift_speed_restriction: ['station_dispatcher'],
      manual_route_setup: ['station_dispatcher'],
    };

    const roles = approvalRequiredMap[actionType] || [];
    return roles.includes(d.role);
  }

  recordViolation(
    actionType: string,
    requiredPermission: string,
    targetId: string,
    targetName: string,
    reason: string,
    dispatcher?: Dispatcher
  ): void {
    const d = dispatcher || this.getCurrentDispatcher();
    if (!d) return;

    const violation: PermissionViolation = {
      operatorId: d.id,
      operatorName: d.realName,
      operatorRole: d.role,
      actionType,
      requiredPermission,
      targetId,
      targetName,
      reason,
      timestamp: Date.now(),
      simTime: this.simTime,
    };

    const violations = [...this.permissionViolationsSubject.value, violation];
    this.permissionViolationsSubject.next(violations);
  }

  getPermissionViolations(): PermissionViolation[] {
    return this.permissionViolationsSubject.value;
  }

  getRoleLabel(role: DispatcherRole): string {
    const labels: Record<DispatcherRole, string> = {
      station_dispatcher: '车站值班员',
      section_dispatcher: '区间调度员',
      chief_dispatcher: '总调度员',
    };
    return labels[role];
  }

  private updateDispatcher(id: string, updates: Partial<Dispatcher>): void {
    const dispatchers = this.dispatchersSubject.value.map(d =>
      d.id === id ? { ...d, ...updates } : d
    );
    this.dispatchersSubject.next(dispatchers);
  }

  touchCurrentSession(): void {
    const session = this.currentSessionSubject.value;
    if (session) {
      const updatedSession = {
        ...session,
        dispatcher: {
          ...session.dispatcher,
          lastActiveTime: Date.now(),
        },
      };
      this.currentSessionSubject.next(updatedSession);

      const sessions = this.activeSessionsSubject.value.map(s =>
        s.sessionId === session.sessionId ? updatedSession : s
      );
      this.activeSessionsSubject.next(sessions);

      this.updateDispatcher(session.dispatcher.id, { lastActiveTime: Date.now() });
    }
  }

  reset(): void {
    this.activeSessionsSubject.next([]);
    this.currentSessionSubject.next(null);
    this.permissionViolationsSubject.next([]);
    this.initializeDefaultDispatchers();
  }
}