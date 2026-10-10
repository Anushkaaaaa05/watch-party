import { Action, Role, can } from './permissions';

export interface Participant {
  userId: string;
  username: string;
  role: Role;
  socketId: string;
  leaveTimer?: NodeJS.Timeout;
}

export interface PublicParticipant {
  userId: string;
  username: string;
  role: Role;
}

export type RequestType = 'play' | 'pause' | 'seek' | 'change_video';

export interface PendingRequest {
  id: string;
  userId: string;
  username: string;
  type: RequestType;
  time?: number;
  videoId?: string;
}

export interface Snapshot {
  videoId: string;
  playState: 'playing' | 'paused';
  currentTime: number;
  serverTime: number;
}

const DEFAULT_VIDEO = '03IAR5O07h0';

export class Room {
  readonly participants = new Map<string, Participant>();
  readonly banned = new Set<string>();
  readonly requests = new Map<string, PendingRequest>();

  videoId = DEFAULT_VIDEO;
  private playing = false;
  private time = 0;
  private updatedAt = Date.now();
  private reqCounter = 0;

  constructor(readonly id: string) {}

  get(userId: string) { return this.participants.get(userId); }
  add(p: Participant) { this.participants.set(p.userId, p); }
  remove(userId: string) { this.participants.delete(userId); }
  get size() { return this.participants.size; }

  list(): PublicParticipant[] {
    return [...this.participants.values()].map(({ userId, username, role }) => ({ userId, username, role }));
  }

  can(userId: string, action: Action): boolean {
    const p = this.participants.get(userId);
    return !!p && can(p.role, action);
  }

  setRole(userId: string, role: Role) {
    const p = this.participants.get(userId);
    if (p) p.role = role;
    return p;
  }

  promoteNextHost(): Participant | undefined {
    const all = [...this.participants.values()];
    const next = all.find((p) => p.role === 'moderator') ?? all[0];
    if (next) next.role = 'host';
    return next;
  }

  controllers(): Participant[] {
    return [...this.participants.values()].filter((p) => p.role !== 'participant');
  }

  currentTime(): number {
    return this.playing ? this.time + (Date.now() - this.updatedAt) / 1000 : this.time;
  }

  snapshot(): Snapshot {
    return {
      videoId: this.videoId,
      playState: this.playing ? 'playing' : 'paused',
      currentTime: this.currentTime(),
      serverTime: Date.now(),
    };
  }

  play() { this.time = this.currentTime(); this.playing = true; this.updatedAt = Date.now(); }
  pause() { this.time = this.currentTime(); this.playing = false; this.updatedAt = Date.now(); }
  seek(t: number) { this.time = Math.max(0, t); this.updatedAt = Date.now(); }
  changeVideo(id: string) {
    this.videoId = id;
    this.time = 0;
    this.playing = true;
    this.updatedAt = Date.now();
  }

  addRequest(r: Omit<PendingRequest, 'id'>): PendingRequest {
    const req = { ...r, id: `${this.id}-${++this.reqCounter}` };
    this.requests.set(req.id, req);
    return req;
  }

  apply(req: PendingRequest) {
    if (req.type === 'play') this.play();
    else if (req.type === 'pause') this.pause();
    else if (req.type === 'seek') this.seek(req.time ?? 0);
    else if (req.type === 'change_video' && req.videoId) this.changeVideo(req.videoId);
  }
}
