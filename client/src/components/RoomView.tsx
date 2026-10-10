import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, myId } from '../socket';
import Player from './Player';
import Participants from './Participants';
import Chat from './Chat';
import { parseVideoId } from '../youtube';
import type { ChangeRequest, ChatMsg, JoinResult, Person, Role, Snapshot } from '../types';

interface Props { initial: JoinResult; onExit: (msg?: string) => void }
interface Float { id: number; emoji: string; name: string; left: number }

const describe = (r: ChangeRequest) =>
  r.type === 'play' ? 'wants to play'
  : r.type === 'pause' ? 'wants to pause'
  : r.type === 'seek' ? `wants to jump to ${Math.floor((r.time ?? 0) / 60)}:${String(Math.floor((r.time ?? 0) % 60)).padStart(2, '0')}`
  : 'suggests a new video';

export default function RoomView({ initial, onExit }: Props) {
  const roomId = initial.roomId;
  const [people, setPeople] = useState<Person[]>(initial.participants);
  const [snapshot, setSnapshot] = useState<Snapshot>(initial.state);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [toast, setToast] = useState('');
  const [url, setUrl] = useState('');
  const [floats, setFloats] = useState<Float[]>([]);
  const [copied, setCopied] = useState('');
  const floatId = useRef(0);

  const myRole: Role = people.find((p) => p.userId === myId)?.role ?? initial.role;
  const canControl = myRole !== 'participant';

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? '' : t)), 3500); }, []);

  useEffect(() => {
    const h: Record<string, (...a: any[]) => void> = {
      sync_state: (s: Snapshot) => setSnapshot(s),
      user_joined: (d) => { setPeople(d.participants); if (d.userId !== myId) say(`${d.username} joined`); },
      user_left: (d) => { setPeople(d.participants); say(`${d.username} left`); },
      role_assigned: (d) => {
        setPeople(d.participants);
        if (d.userId === myId) say(`You are now ${d.role === 'host' ? 'the host' : 'a ' + d.role}`);
      },
      participant_removed: (d) => setPeople(d.participants),
      removed: () => onExit('The host removed you from the room.'),
      error_msg: (d) => say(d.message),
      chat: (m: ChatMsg) => setMessages((x) => [...x.slice(-199), m]),
      change_requested: (r: ChangeRequest) => setRequests((x) => [...x.filter((y) => y.id !== r.id), r]),
      request_resolved: ({ requestId }) => setRequests((x) => x.filter((r) => r.id !== requestId)),
      request_sent: () => say('Request sent to the host and moderators'),
      request_result: ({ approved }) => say(approved ? 'Your request was approved' : 'Your request was declined'),
      reaction: ({ emoji, username }) => {
        const id = ++floatId.current;
        setFloats((f) => [...f, { id, emoji, name: username, left: 10 + Math.random() * 70 }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 2600);
      },
    };
    Object.entries(h).forEach(([e, fn]) => socket.on(e, fn));
    return () => { Object.keys(h).forEach((e) => socket.off(e)); };
  }, [onExit, say]);

  useEffect(() => {
    if (snapshot.playState !== 'playing') return;
    const t = setInterval(() => socket.emit('request_sync'), 8000);
    return () => clearInterval(t);
  }, [snapshot.playState]);

  const act = (type: 'play' | 'pause' | 'seek' | 'change_video', extra: object = {}) =>
    canControl ? socket.emit(type, extra) : socket.emit('request_change', { type, ...extra });

  const submitUrl = () => {
    const id = parseVideoId(url);
    if (!id) return say("That doesn't look like a YouTube link.");
    act('change_video', { videoId: id });
    setUrl('');
  };

  const leave = () => { socket.emit('leave_room', { roomId }); onExit(); };
  const link = `${location.origin}/?room=${roomId}`;
  const copy = async (text: string, label: string) => {
    let ok = false;
    try {
      const box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      box.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
      document.body.removeChild(box);
    } catch {  }
    if (!ok) {
      try { await navigator.clipboard.writeText(text); ok = true; } catch {  }
    }
    if (ok) {
      say(`${label} copied`);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? '' : c)), 1800);
    }
    else window.prompt(`Copy this ${label.toLowerCase()}:`, text);
  };

  return (
    <div className="room">
      <header className="topbar">
        <div className="ticket" title="Click to copy the room code" onClick={() => copy(roomId, 'Room code')}>
          <span className="ticket-label">Room</span>
          <span className="ticket-code">{roomId}</span>
          <svg className="ticket-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copied === 'Room code' ? <path d="M5 12l5 5 9-10" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>}
          </svg>
        </div>
        <button onClick={() => copy(link, 'Invite link')}>{copied === 'Invite link' ? '✓ Copied!' : 'Copy invite link'}</button>
        <span className={`badge ${myRole} me`}>You: {myRole}</span>
        <button className="ghost" onClick={leave}>Leave</button>
      </header>

      <div className="layout">
        <main className="stage">
          {canControl && requests.length > 0 && (
            <section className="requests" aria-live="polite">
              <h2>Waiting for approval</h2>
              {requests.map((r) => (
                <div key={r.id} className="request">
                  <span><b>{r.username}</b> {describe(r)}{r.videoId && <> <code>{r.videoId}</code></>}</span>
                  <span>
                    <button className="small primary" onClick={() => socket.emit('resolve_request', { requestId: r.id, approve: true })}>Approve</button>
                    <button className="small" onClick={() => socket.emit('resolve_request', { requestId: r.id, approve: false })}>Decline</button>
                  </span>
                </div>
              ))}
            </section>
          )}

          <div className="url-row">
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitUrl()} placeholder="Paste a YouTube link" aria-label="YouTube link" />
            <button className="primary" onClick={submitUrl}>{canControl ? 'Change video' : 'Suggest video'}</button>
          </div>

          <Player
            snapshot={snapshot}
            canControl={canControl}
            onPlay={() => act('play')}
            onPause={() => act('pause')}
            onSeek={(t) => act('seek', { time: t })}
          />

          <div className="floats" aria-hidden>
            {floats.map((f) => <span key={f.id} className="float" style={{ left: `${f.left}%` }}>{f.emoji}<small>{f.name}</small></span>)}
          </div>
        </main>

        <aside className="side">
          <Participants
            people={people}
            meId={myId}
            myRole={myRole}
            onAssign={(userId, role) => socket.emit('assign_role', { userId, role })}
            onRemove={(userId) => socket.emit('remove_participant', { userId })}
            onTransfer={(userId) => socket.emit('transfer_host', { userId })}
          />
          <Chat meId={myId} messages={messages} onSend={(text) => socket.emit('chat', { text })} onReact={(emoji) => socket.emit('reaction', { emoji })} />
        </aside>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
