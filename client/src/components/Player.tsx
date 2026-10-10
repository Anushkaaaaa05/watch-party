import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, fmt } from '../youtube';
import type { Snapshot } from '../types';

interface Props {
  snapshot: Snapshot;
  canControl: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
}

export default function Player({ snapshot, canControl, onPlay, onPause, onSeek }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const ready = useRef(false);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [inSync, setInSync] = useState(true);
  const receivedAt = useRef(Date.now());

  const apply = (s: Snapshot) => {
    const p = player.current;
    if (!ready.current || !p) return;
    const playing = s.playState === 'playing';
    const loaded = p.getVideoData?.()?.video_id;

    if (loaded !== s.videoId) {
      if (playing) p.loadVideoById(s.videoId, s.currentTime);
      else p.cueVideoById(s.videoId, s.currentTime);
    } else {
      const drift = Math.abs(p.getCurrentTime() - s.currentTime);
      if (drift > 1.2) p.seekTo(s.currentTime, true);
      const st = p.getPlayerState();
      if (playing && st !== 1 && st !== 3) p.playVideo();
      if (!playing && st === 1) p.pauseVideo();
      if (!playing && drift > 1.2) p.pauseVideo();
    }

    if (playing) {
      setTimeout(() => {
        const st = player.current?.getPlayerState?.();
        setBlocked(latest.current.playState === 'playing' && st !== 1 && st !== 3);
      }, 1800);
    } else setBlocked(false);
  };

  useEffect(() => {
    let dead = false;
    loadYouTubeApi().then(() => {
      if (dead || !mount.current) return;
      const el = document.createElement('div');
      mount.current.appendChild(el);
      player.current = new window.YT.Player(el, {
        width: '100%',
        height: '100%',
        videoId: latest.current.videoId,
        playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, start: Math.floor(latest.current.currentTime) },
        events: { onReady: () => { ready.current = true; apply(latest.current); } },
      });
    });
    const tick = setInterval(() => {
      const p = player.current;
      if (!ready.current || !p?.getCurrentTime) return;
      setPos(p.getCurrentTime());
      setDur(p.getDuration?.() || 0);
      const s = latest.current;
      const expected = s.currentTime + (s.playState === 'playing' ? (Date.now() - receivedAt.current) / 1000 : 0);
      setInSync(Math.abs(p.getCurrentTime() - expected) < 2.5);
    }, 400);
    return () => {
      dead = true;
      clearInterval(tick);
      ready.current = false;
      player.current?.destroy?.();
    };
  }, []);

  useEffect(() => {
    receivedAt.current = Date.now();
    apply(snapshot);
  }, [snapshot]);

  const playing = snapshot.playState === 'playing';
  const shown = drag ?? pos;

  return (
    <div className="player">
      <div className="screen" onClick={playing ? onPause : onPlay} title={playing ? 'Click to pause' : 'Click to play'}>
        <div ref={mount} className="yt" />
        {blocked && (
          <button className="tap-overlay" onClick={() => { player.current?.unMute?.(); player.current?.seekTo(latest.current.currentTime, true); player.current?.playVideo(); setBlocked(false); }}>
            Tap to join playback
          </button>
        )}
      </div>

      <div className="bar">
        <button className="icon" onClick={playing ? onPause : onPlay} aria-label={playing ? (canControl ? 'Pause' : 'Ask to pause') : (canControl ? 'Play' : 'Ask to play')}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="time">{fmt(shown)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(dur, 1)}
          step={0.5}
          value={Math.min(shown, Math.max(dur, 1))}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => { if (drag !== null) { onSeek(drag); setDrag(null); } }}
          onKeyUp={() => { if (drag !== null) { onSeek(drag); setDrag(null); } }}
          aria-label="Seek"
        />
        <span className="time">{fmt(dur)}</span>
        <span className={`sync${inSync ? ' ok' : ''}`}><i />{inSync ? 'In sync' : 'Syncing…'}</span>
      </div>
      {!canControl && <p className="hint">You're watching. Play, pause and seek send a request to the host or a moderator.</p>}
    </div>
  );
}
