import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Train, BlockSection, Signal, Switch, Route, DispatcherAction } from '../models/railway.model';

export interface SimulationSnapshot {
  time: number;
  trains: Train[];
  blocks: BlockSection[];
  signals: Signal[];
  switches?: Switch[];
  routes?: Route[];
  dispatcherActions?: DispatcherAction[];
}

@Injectable({
  providedIn: 'root',
})
export class PlaybackService {
  private recordingSubject = new BehaviorSubject<SimulationSnapshot[]>([]);
  recording$: Observable<SimulationSnapshot[]> = this.recordingSubject.asObservable();

  private currentPlaybackIndex = 0;

  constructor() {}

  recordState(snapshot: SimulationSnapshot): void {
    const recording = [...this.recordingSubject.value];

    const lastSnapshot = recording[recording.length - 1];
    if (lastSnapshot && Math.abs(lastSnapshot.time - snapshot.time) < 0.05) {
      return;
    }

    recording.push({
      ...snapshot,
      trains: JSON.parse(JSON.stringify(snapshot.trains)),
      blocks: JSON.parse(JSON.stringify(snapshot.blocks)),
      signals: JSON.parse(JSON.stringify(snapshot.signals)),
      switches: snapshot.switches ? JSON.parse(JSON.stringify(snapshot.switches)) : undefined,
      routes: snapshot.routes ? JSON.parse(JSON.stringify(snapshot.routes)) : undefined,
      dispatcherActions: snapshot.dispatcherActions
        ? JSON.parse(JSON.stringify(snapshot.dispatcherActions))
        : undefined,
    });
    this.recordingSubject.next(recording);
  }

  getRecording(): SimulationSnapshot[] {
    return this.recordingSubject.value;
  }

  hasRecording(): boolean {
    return this.recordingSubject.value.length > 0;
  }

  getDuration(): number {
    const recording = this.recordingSubject.value;
    if (recording.length === 0) return 0;
    return recording[recording.length - 1].time;
  }

  getStateAtTime(time: number): SimulationSnapshot | undefined {
    const recording = this.recordingSubject.value;
    if (recording.length === 0) return undefined;

    if (time <= recording[0].time) {
      return recording[0];
    }

    if (time >= recording[recording.length - 1].time) {
      return recording[recording.length - 1];
    }

    let left = 0;
    let right = recording.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (recording[mid].time === time) {
        return recording[mid];
      } else if (recording[mid].time < time) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    const lowerIndex = right;
    const upperIndex = left;

    if (lowerIndex < 0) return recording[0];
    if (upperIndex >= recording.length) return recording[recording.length - 1];

    const lower = recording[lowerIndex];
    const upper = recording[upperIndex];

    if (upper.time - lower.time === 0) {
      return lower;
    }

    const ratio = (time - lower.time) / (upper.time - lower.time);

    return this.interpolateSnapshots(lower, upper, ratio);
  }

  private interpolateSnapshots(
    lower: SimulationSnapshot,
    upper: SimulationSnapshot,
    ratio: number
  ): SimulationSnapshot {
    const trains = lower.trains.map(lowerTrain => {
      const upperTrain = upper.trains.find(t => t.id === lowerTrain.id);
      if (!upperTrain) return lowerTrain;

      return {
        ...lowerTrain,
        progress: lowerTrain.progress + (upperTrain.progress - lowerTrain.progress) * ratio,
      };
    });

    const upperTrainIds = new Set(upper.trains.map(t => t.id));
    const newTrains = upper.trains.filter(t => !upperTrainIds.has(t.id) === false);
    const lowerTrainIds = new Set(lower.trains.map(t => t.id));
    const addedTrains = upper.trains.filter(t => !lowerTrainIds.has(t.id));

    return {
      time: lower.time + (upper.time - lower.time) * ratio,
      trains: [...trains, ...addedTrains],
      blocks: upper.blocks,
      signals: upper.signals,
      switches: upper.switches,
      routes: upper.routes,
      dispatcherActions: upper.dispatcherActions,
    };
  }

  seekTo(time: number): void {
    const recording = this.recordingSubject.value;
    if (recording.length === 0) return;

    let index = 0;
    for (let i = 0; i < recording.length; i++) {
      if (recording[i].time <= time) {
        index = i;
      } else {
        break;
      }
    }

    this.currentPlaybackIndex = index;
  }

  clearRecording(): void {
    this.recordingSubject.next([]);
    this.currentPlaybackIndex = 0;
  }

  getTimelineEvents(): { time: number; type: string; data: any }[] {
    const events: { time: number; type: string; data: any }[] = [];
    const recording = this.recordingSubject.value;

    if (recording.length < 2) return events;

    for (let i = 1; i < recording.length; i++) {
      const prev = recording[i - 1];
      const curr = recording[i];

      prev.blocks.forEach(prevBlock => {
        const currBlock = curr.blocks.find(b => b.id === prevBlock.id);
        if (currBlock && prevBlock.isOccupied !== currBlock.isOccupied) {
          events.push({
            time: curr.time,
            type: currBlock.isOccupied ? 'block_occupied' : 'block_cleared',
            data: { blockId: currBlock.id, trainId: currBlock.occupiedByTrainId },
          });
        }
      });

      prev.signals.forEach(prevSignal => {
        const currSignal = curr.signals.find(s => s.id === prevSignal.id);
        if (currSignal && prevSignal.state !== currSignal.state) {
          events.push({
            time: curr.time,
            type: 'signal_change',
            data: { signalId: currSignal.id, state: currSignal.state, isManual: currSignal.isManualMode },
          });
        }
      });

      prev.trains.forEach(prevTrain => {
        const currTrain = curr.trains.find(t => t.id === prevTrain.id);
        if (currTrain && prevTrain.state !== currTrain.state) {
          events.push({
            time: curr.time,
            type: 'train_state_change',
            data: { trainId: currTrain.id, state: currTrain.state, name: currTrain.name },
          });
        }
      });

      if (prev.switches && curr.switches) {
        prev.switches.forEach(prevSwitch => {
          const currSwitch = curr.switches!.find(s => s.id === prevSwitch.id);
          if (currSwitch && prevSwitch.position !== currSwitch.position) {
            events.push({
              time: curr.time,
              type: 'switch_change',
              data: { switchId: currSwitch.id, position: currSwitch.position, name: currSwitch.name },
            });
          }
        });
      }

      if (prev.routes && curr.routes) {
        prev.routes.forEach(prevRoute => {
          const currRoute = curr.routes!.find(r => r.id === prevRoute.id);
          if (currRoute && prevRoute.state !== currRoute.state) {
            events.push({
              time: curr.time,
              type: 'route_state_change',
              data: { routeId: currRoute.id, state: currRoute.state, name: currRoute.name },
            });
          }
        });
      }
    }

    return events;
  }

  exportRecording(): string {
    const recording = this.recordingSubject.value;
    return JSON.stringify(recording, null, 2);
  }

  importRecording(data: string): boolean {
    try {
      const recording = JSON.parse(data) as SimulationSnapshot[];
      if (Array.isArray(recording) && recording.length > 0) {
        this.recordingSubject.next(recording);
        this.currentPlaybackIndex = 0;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
