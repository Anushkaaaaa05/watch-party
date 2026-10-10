import { io, Socket } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3001';
const mk = (id: string): Socket => io(URL, { auth: { clientId: id }, transports: ['websocket'] });
const emit = (s: Socket, ev: string, p?: any) => new Promise<any>((r) => s.emit(ev, p, r));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const once = (s: Socket, ev: string) => new Promise<any>((r) => s.once(ev, r));

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

(async () => {
  const host = mk('host-1'), guest = mk('guest-1'), third = mk('third-1');
  await wait(300);

  const created = await emit(host, 'create_room', { username: 'Hana' });
  check('host creates room with host role', created.role === 'host' && created.roomId.length === 6);

  const joined = await emit(guest, 'join_room', { roomId: created.roomId.toLowerCase(), username: 'Gus' });
  check('joiner is participant', joined.role === 'participant');
  check('bad room code rejected', !!(await emit(third, 'join_room', { roomId: 'NOPE00', username: 'X' })).error);

  let err: any; guest.once('error_msg', (e) => (err = e));
  guest.emit('change_video', { videoId: 'dQw4w9WgXcQ' });
  guest.emit('play');
  await wait(200);
  check('participant change_video/play rejected', !!err);
  guest.emit('request_sync');
  const s1 = await once(guest, 'sync_state');
  check('state untouched by rejected events', s1.videoId === '03IAR5O07h0' && s1.playState === 'paused');

  const p1 = once(guest, 'sync_state'); host.emit('play'); const s2 = await p1;
  check('host play broadcasts to participant', s2.playState === 'playing');

  guest.emit('assign_role', { userId: 'guest-1', role: 'moderator' });
  await wait(200);
  const r = await emit(guest, 'join_room', { roomId: created.roomId, username: 'Gus' });
  check('participant cannot self-promote', r.role === 'participant');

  const ra = once(host, 'role_assigned'); host.emit('assign_role', { userId: 'guest-1', role: 'moderator' });
  check('role_assigned broadcast', (await ra).role === 'moderator');
  const sv = once(host, 'sync_state'); guest.emit('change_video', { videoId: 'dQw4w9WgXcQ' });
  check('moderator can change video', (await sv).videoId === 'dQw4w9WgXcQ');

  await emit(third, 'join_room', { roomId: created.roomId, username: 'Thea' });
  const cr = once(host, 'change_requested'); third.emit('request_change', { type: 'pause' });
  const req = await cr;
  const st = once(guest, 'sync_state'); host.emit('resolve_request', { requestId: req.id, approve: true });
  check('approved request is applied', (await st).playState === 'paused');

  const cleared: string[] = [];
  const seen: any[] = [];
  let verdict: any;
  host.on('request_resolved', (d: any) => cleared.push(d.requestId));
  host.on('change_requested', (r: any) => seen.push(r));
  third.on('request_result', (d: any) => (verdict = d));
  third.emit('request_change', { type: 'play' });
  await wait(150);
  third.emit('request_change', { type: 'play' });
  await wait(150);
  check('replaced request card is cleared for the host', cleared.includes(seen[0].id));
  host.emit('resolve_request', { requestId: seen[1].id, approve: false });
  await wait(200);
  check('declined request tells the requester', !!verdict && verdict.approved === false);
  const before = cleared.length;
  host.emit('resolve_request', { requestId: 'NOPE-9', approve: false });
  await wait(200);
  check('unknown request card is cleared', cleared.length === before + 1);

  const rm = once(third, 'removed'); host.emit('remove_participant', { userId: 'third-1' }); await rm;
  check('removed user notified', true);
  check('removed user cannot rejoin', !!(await emit(third, 'join_room', { roomId: created.roomId, username: 'Thea' })).error);

  const rt = once(guest, 'role_assigned'); host.emit('transfer_host', { userId: 'guest-1' });
  check('host transfer works', (await rt).role === 'host');

  [host, guest, third].forEach((s) => s.close());
  console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
