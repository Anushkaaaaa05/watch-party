import { io } from 'socket.io-client';

function clientId() {
  let id = localStorage.getItem('wp_client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('wp_client_id', id);
  }
  return id;
}

export const myId = clientId();

export const socket = io(import.meta.env.VITE_SERVER_URL || '/', { auth: { clientId: myId } });
