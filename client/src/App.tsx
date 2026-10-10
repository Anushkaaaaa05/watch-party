import { useEffect, useState } from 'react';
import { socket } from './socket';
import Lobby from './components/Lobby';
import RoomView from './components/RoomView';
import type { JoinResult } from './types';

const KEY = 'wp_session';

export default function App() {
  const [session, setSession] = useState<JoinResult | null>(null);
  const [booting, setBooting] = useState(!!sessionStorage.getItem(KEY));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    if (!saved) return;
    const { roomId, username } = JSON.parse(saved);
    const rejoin = () =>
      socket.emit('join_room', { roomId, username }, (res: JoinResult) => {
        if (res.error) { sessionStorage.removeItem(KEY); setNotice(res.error); setSession(null); }
        else setSession(res);
        setBooting(false);
      });
    if (socket.connected) rejoin(); else socket.once('connect', rejoin);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      const saved = sessionStorage.getItem(KEY);
      if (!saved || !session) return;
      const { roomId, username } = JSON.parse(saved);
      socket.emit('join_room', { roomId, username }, (res: JoinResult) => { if (!res.error) setSession(res); });
    };
    socket.io.on('reconnect', onConnect);
    return () => { socket.io.off('reconnect', onConnect); };
  }, [session]);

  const enter = (res: JoinResult, username: string) => {
    sessionStorage.setItem(KEY, JSON.stringify({ roomId: res.roomId, username }));
    setNotice('');
    setSession(res);
  };

  const exit = (msg = '') => {
    sessionStorage.removeItem(KEY);
    setSession(null);
    setNotice(msg);
    history.replaceState(null, '', '/');
  };

  if (booting) return <div className="boot">Rejoining your room…</div>;
  return session
    ? <RoomView initial={session} onExit={exit} />
    : <Lobby onEnter={enter} notice={notice} />;
}
