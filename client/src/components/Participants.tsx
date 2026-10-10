import type { Person, Role } from '../types';

interface Props {
  people: Person[];
  meId: string;
  myRole: Role;
  onAssign: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
  onTransfer: (userId: string) => void;
}

const order: Record<Role, number> = { host: 0, moderator: 1, participant: 2 };

function avatarStyle(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = 255 + (h % 50);
  return { background: `hsl(${hue} 70% 60% / 0.22)`, color: `hsl(${hue} 90% 84%)` };
}

export default function Participants({ people, meId, myRole, onAssign, onRemove, onTransfer }: Props) {
  const sorted = [...people].sort((a, b) => order[a.role] - order[b.role] || a.username.localeCompare(b.username));
  return (
    <section className="panel">
      <h2>In the room <span className="count">{people.length}</span></h2>
      <ul className="people">
        {sorted.map((p) => (
          <li key={p.userId}>
            <span className="avatar" style={avatarStyle(p.username)} aria-hidden="true">
              {p.username.charAt(0).toUpperCase()}
              <i className="online" title="Online" />
            </span>
            <span className="name">{p.username}{p.userId === meId && <em> (you)</em>}</span>
            <span className={`badge ${p.role}`}>{p.role}</span>
            {myRole === 'host' && p.userId !== meId && (
              <span className="actions">
                <select
                  value={p.role === 'host' ? 'participant' : p.role}
                  onChange={(e) => onAssign(p.userId, e.target.value as Role)}
                  aria-label={`Role for ${p.username}`}
                >
                  <option value="participant">Participant</option>
                  <option value="moderator">Moderator</option>
                </select>
                <button className="small" title="Make host" onClick={() => confirm(`Make ${p.username} the host? You'll become a moderator.`) && onTransfer(p.userId)}>Make host</button>
                <button className="small danger" onClick={() => confirm(`Remove ${p.username} from the room?`) && onRemove(p.userId)}>Remove</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
