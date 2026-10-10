import type { Server, Socket } from 'socket.io';
import { Action, Role } from './permissions';
import { Room, RequestType } from './Room';
import { RoomManager } from './RoomManager';

type Ack = (res: any) => void;

const GRACE_MS = 8000;
const VIDEO_ID = /^[\w-]{11}$/;

const cleanName = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);

export class MessageHandler {
  private room?: Room;
  private readonly userId: string;

  constructor(private io: Server, private socket: Socket, private rooms: RoomManager) {
    this.userId = String(socket.handshake.auth?.clientId || socket.id).slice(0, 64);
    this.bind();
  }

  private on(event: string, fn: (payload: any, ack?: Ack) => void) {
    this.socket.on(event, (payload: any, ack?: Ack) => {
      try { fn(payload ?? {}, typeof ack === 'function' ? ack : undefined); }
      catch (e) { console.error(`[${event}]`, e); this.socket.emit('error_msg', { message: 'Server error' }); }
    });
  }

  private guarded(event: string, action: Action, fn: (payload: any) => void) {
    this.on(event, (payload) => {
      if (!this.room || !this.room.can(this.userId, action)) {
        return this.socket.emit('error_msg', { message: `You don't have permission to ${action.replace('_', ' ')}.` });
      }
      fn(payload);
    });
  }

  private bind() {
    this.on('create_room', (p, ack) => this.createRoom(p, ack));
    this.on('join_room', (p, ack) => this.joinRoom(p, ack));
    this.on('leave_room', () => this.leaveNow());
    this.on('request_sync', () => this.room && this.socket.emit('sync_state', this.room.snapshot()));

    this.guarded('play', 'play', () => { this.room!.play(); this.broadcastState(); });
    this.guarded('pause', 'pause', () => { this.room!.pause(); this.broadcastState(); });
    this.guarded('seek', 'seek', ({ time }) => {
      const t = Number(time);
      if (!Number.isFinite(t) || t < 0) return;
      this.room!.seek(t);
      this.broadcastState();
    });
    this.guarded('change_video', 'change_video', ({ videoId }) => {
      if (!VIDEO_ID.test(String(videoId))) return this.socket.emit('error_msg', { message: 'Invalid YouTube video.' });
      this.room!.changeVideo(String(videoId));
      this.broadcastState();
    });

    this.guarded('assign_role', 'assign_role', (p) => this.assignRole(p.userId, p.role));
    this.guarded('remove_participant', 'remove_participant', (p) => this.removeParticipant(p.userId));
    this.guarded('transfer_host', 'transfer_host', (p) => this.transferHost(p.userId));

    this.on('request_change', (p) => this.requestChange(p));
    this.guarded('resolve_request', 'resolve_request', (p) => this.resolveRequest(p.requestId, !!p.approve));

    this.on('chat', ({ text }) => {
      const me = this.room?.get(this.userId);
      const msg = String(text ?? '').trim().slice(0, 500);
      if (this.room && me && msg) this.io.to(this.room.id).emit('chat', { userId: me.userId, username: me.username, role: me.role, text: msg, at: Date.now() });
    });
    this.on('reaction', ({ emoji }) => {
      const me = this.room?.get(this.userId);
      if (this.room && me && ['🔥', '😂', '😮', '❤️', '👏'].includes(emoji)) this.io.to(this.room.id).emit('reaction', { username: me.username, emoji });
    });

    this.socket.on('disconnect', () => this.onDisconnect());
  }

  private createRoom({ username }: any, ack?: Ack) {
    const name = cleanName(username);
    if (!name) return ack?.({ error: 'Enter a display name.' });
    this.leaveNow();
    const room = this.rooms.create();
    room.add({ userId: this.userId, username: name, role: 'host', socketId: this.socket.id });
    this.enter(room, true, ack);
  }

  private joinRoom({ roomId, username }: any, ack?: Ack) {
    const room = this.rooms.get(roomId);
    if (!room) return ack?.({ error: 'Room not found. Check the code.' });
    if (room.banned.has(this.userId)) return ack?.({ error: 'You were removed from this room.' });

    const existing = room.get(this.userId);
    if (existing) {
      clearTimeout(existing.leaveTimer);
      existing.leaveTimer = undefined;
      existing.socketId = this.socket.id;
      return this.enter(room, false, ack);
    }

    const name = cleanName(username);
    if (!name) return ack?.({ error: 'Enter a display name.' });
    if (room.size >= 100) return ack?.({ error: 'Room is full.' });
    if (this.room && this.room !== room) this.leaveNow();
    room.add({ userId: this.userId, username: name, role: 'participant', socketId: this.socket.id });
    this.enter(room, true, ack);
  }

  private enter(room: Room, announce: boolean, ack?: Ack) {
    this.room = room;
    this.socket.join(room.id);
    const me = room.get(this.userId)!;
    ack?.({ roomId: room.id, userId: this.userId, role: me.role, participants: room.list(), state: room.snapshot() });
    if (announce) {
      this.io.to(room.id).emit('user_joined', { username: me.username, userId: me.userId, role: me.role, participants: room.list() });
    }
    if (me.role !== 'participant') {
      for (const r of room.requests.values()) this.socket.emit('change_requested', r);
    }
  }

  private leaveNow() {
    const room = this.room;
    if (!room) return;
    this.socket.leave(room.id);
    this.room = undefined;
    this.removeFromRoom(room, this.userId);
  }

  private onDisconnect() {
    const room = this.room;
    const me = room?.get(this.userId);
    if (!room || !me || me.socketId !== this.socket.id) return;
    me.leaveTimer = setTimeout(() => this.removeFromRoom(room, this.userId), GRACE_MS);
  }

  private removeFromRoom(room: Room, userId: string) {
    const leaver = room.get(userId);
    if (!leaver) return;
    clearTimeout(leaver.leaveTimer);
    room.remove(userId);
    for (const [id, r] of room.requests) {
      if (r.userId !== userId) continue;
      room.requests.delete(id);
      this.clearRequestCard(room, id);
    }

    if (room.size === 0) return void this.rooms.delete(room.id);

    if (leaver.role === 'host') {
      const next = room.promoteNextHost()!;
      this.io.to(room.id).emit('role_assigned', { userId: next.userId, username: next.username, role: next.role, participants: room.list() });
    }
    this.io.to(room.id).emit('user_left', { userId, username: leaver.username, participants: room.list() });
  }

  private assignRole(targetId: string, role: Role) {
    const room = this.room!;
    if (role !== 'moderator' && role !== 'participant') return;
    const target = room.get(targetId);
    if (!target || targetId === this.userId) return;
    room.setRole(targetId, role);
    this.io.to(room.id).emit('role_assigned', { userId: targetId, username: target.username, role, participants: room.list() });
  }

  private removeParticipant(targetId: string) {
    const room = this.room!;
    const target = room.get(targetId);
    if (!target || targetId === this.userId) return;
    room.banned.add(targetId);
    this.io.to(target.socketId).emit('removed');
    this.io.sockets.sockets.get(target.socketId)?.leave(room.id);
    this.removeFromRoom(room, targetId);
    this.io.to(room.id).emit('participant_removed', { userId: targetId, username: target.username, participants: room.list() });
  }

  private transferHost(targetId: string) {
    const room = this.room!;
    const target = room.get(targetId);
    if (!target || targetId === this.userId) return;
    room.setRole(this.userId, 'moderator');
    room.setRole(targetId, 'host');
    this.io.to(room.id).emit('role_assigned', { userId: targetId, username: target.username, role: 'host', participants: room.list() });
    this.io.to(room.id).emit('role_assigned', { userId: this.userId, username: room.get(this.userId)!.username, role: 'moderator', participants: room.list() });
  }

  private requestChange(p: any) {
    const room = this.room;
    const me = room?.get(this.userId);
    if (!room || !me) return;
    if (me.role !== 'participant') return;

    const type = p.type as RequestType;
    if (!['play', 'pause', 'seek', 'change_video'].includes(type)) return;
    if (type === 'change_video' && !VIDEO_ID.test(String(p.videoId))) return this.socket.emit('error_msg', { message: 'Invalid YouTube video.' });
    if (type === 'seek' && !Number.isFinite(Number(p.time))) return;

    for (const [id, r] of room.requests) {
      if (r.userId !== this.userId || r.type !== type) continue;
      room.requests.delete(id);
      this.clearRequestCard(room, id);
    }

    const req = room.addRequest({ userId: this.userId, username: me.username, type, time: p.time !== undefined ? Number(p.time) : undefined, videoId: p.videoId });
    for (const c of room.controllers()) this.io.to(c.socketId).emit('change_requested', req);
    this.socket.emit('request_sent', { requestId: req.id, type });
  }

  private resolveRequest(requestId: string, approve: boolean) {
    const room = this.room!;
    const req = room.requests.get(requestId);
    if (!req) return void this.socket.emit('request_resolved', { requestId });
    room.requests.delete(requestId);
    if (approve) { room.apply(req); this.broadcastState(); }
    for (const c of room.controllers()) this.io.to(c.socketId).emit('request_resolved', { requestId });
    const requester = room.get(req.userId);
    if (requester) this.io.to(requester.socketId).emit('request_result', { type: req.type, approved: approve });
  }

  private clearRequestCard(room: Room, requestId: string) {
    for (const c of room.controllers()) this.io.to(c.socketId).emit('request_resolved', { requestId });
  }

  private broadcastState() {
    this.io.to(this.room!.id).emit('sync_state', this.room!.snapshot());
  }
}
