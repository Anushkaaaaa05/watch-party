import { useState } from 'react';
import { socket } from '../socket';
import type { JoinResult } from '../types';

interface Props { onEnter: (res: JoinResult, username: string) => void; notice: string }

function toRoomCode(input: string): string {
  const fromLink = input.match(/[?&]room=([A-Za-z0-9]{6})/);
  if (fromLink) return fromLink[1].toUpperCase();
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export default function Lobby({ onEnter, notice }: Props) {
  const linkCode = new URLSearchParams(location.search).get('room') ?? '';
  const [username, setUsername] = useState(localStorage.getItem('wp_name') ?? '');
  const [code, setCode] = useState(linkCode.toUpperCase());
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  const go = (event: 'create_room' | 'join_room') => {
    if (!username.trim()) return setError('Enter a display name first.');
    if (event === 'join_room' && !code.trim()) return setError('Enter a room code.');
    setBusy(true); setError('');
    localStorage.setItem('wp_name', username.trim());
    socket.emit(event, { username, roomId: code }, (res: JoinResult) => {
      setBusy(false);
      if (res.error) return setError(res.error);
      history.replaceState(null, '', `/?room=${res.roomId}`);
      onEnter(res, username.trim());
    });
  };

  return (
    <main className="lobby">
      <div className="hero">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
          </span>
          <h1>Watch Party</h1>
        </div>
        <p className="tagline">Press play together. Everyone in the room sees the same moment.</p>
      </div>

      <div className="lobby-card">
        <label>
          Your name
          <input value={username} maxLength={24} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Priya" autoFocus />
        </label>

        <div className="lobby-split">
          <section>
            <h2>Start a room</h2>
            <p>You become the host and control the video.</p>
            <button className="primary" disabled={busy} onClick={() => go('create_room')}>Create room</button>
          </section>
          <section>
            <h2>Join a room</h2>
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(toRoomCode(e.target.value))}
              placeholder="ABC234"
              aria-label="Room code"
              onKeyDown={(e) => e.key === 'Enter' && go('join_room')}
            />
            <button className="outline" disabled={busy} onClick={() => go('join_room')}>Join room</button>
          </section>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <ol className="steps">
        <li><span>1</span><div><b>Create a room</b><small>You become the host</small></div></li>
        <li><span>2</span><div><b>Invite friends</b><small>Share the code or link</small></div></li>
        <li><span>3</span><div><b>Watch together</b><small>Everyone stays in sync</small></div></li>
      </ol>
    </main>
  );
}
