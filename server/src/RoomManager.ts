import { Room } from './Room';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(): Room {
    let id: string;
    do {
      id = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    } while (this.rooms.has(id));
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string | undefined): Room | undefined {
    return id ? this.rooms.get(String(id).trim().toUpperCase()) : undefined;
  }

  delete(id: string) { this.rooms.delete(id); }
  get count() { return this.rooms.size; }
}
