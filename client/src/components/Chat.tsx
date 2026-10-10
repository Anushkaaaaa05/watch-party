import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../types';

interface Props { messages: ChatMsg[]; meId: string; onSend: (text: string) => void; onReact: (emoji: string) => void }
const EMOJI = ['🔥', '😂', '😮', '❤️', '👏'];

export default function Chat({ messages, meId, onSend, onReact }: Props) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = () => { if (text.trim()) { onSend(text); setText(''); } };

  return (
    <section className="panel chat">
      <h2>Chat</h2>
      <div className="messages">
        {messages.length === 0 && <p className="empty">No messages yet. Say hi.</p>}
        {messages.map((m, i) => {
          const mine = m.userId === meId;
          return (
            <div key={i} className={`msg${mine ? ' mine' : ''}`}>
              <div className="msg-meta">
                <b className={m.role}>{mine ? 'You' : m.username}</b>
                <time>{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <div className="bubble">{m.text}</div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="reactions">
        {EMOJI.map((e) => <button key={e} className="emoji" onClick={() => onReact(e)} aria-label={`React ${e}`}>{e}</button>)}
      </div>
      <div className="compose">
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Message the room" />
        <button className="primary send" onClick={send} aria-label="Send message">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3 20.5v-6.2l9-2.3-9-2.3V3.5L22 12 3 20.5z" /></svg>
        </button>
      </div>
    </section>
  );
}
