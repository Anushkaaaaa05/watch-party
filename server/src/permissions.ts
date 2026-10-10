export type Role = 'host' | 'moderator' | 'participant';

export type Action =
  | 'play'
  | 'pause'
  | 'seek'
  | 'change_video'
  | 'assign_role'
  | 'remove_participant'
  | 'transfer_host'
  | 'resolve_request';

const PERMISSIONS: Record<Role, readonly Action[]> = {
  host: ['play', 'pause', 'seek', 'change_video', 'assign_role', 'remove_participant', 'transfer_host', 'resolve_request'],
  moderator: ['play', 'pause', 'seek', 'change_video', 'resolve_request'],
  participant: [],
};

export const can = (role: Role, action: Action): boolean => PERMISSIONS[role].includes(action);
