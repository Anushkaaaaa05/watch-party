export type Role = 'host' | 'moderator' | 'participant';
export interface Person { userId: string; username: string; role: Role }
export interface Snapshot { videoId: string; playState: 'playing' | 'paused'; currentTime: number; serverTime: number }
export interface ChatMsg { userId: string; username: string; role: Role; text: string; at: number }
export interface ChangeRequest { id: string; userId: string; username: string; type: 'play' | 'pause' | 'seek' | 'change_video'; time?: number; videoId?: string }
export interface JoinResult { roomId: string; userId: string; role: Role; participants: Person[]; state: Snapshot; error?: string }
