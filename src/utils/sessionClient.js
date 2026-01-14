import PartySocket from 'partysocket';

export class SessionClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.role = null; // 'host' | 'viewer'
    this.sessionId = null;
    this.listeners = new Map();
  }

  connect(sessionId, serverHost) {
    // Use environment variable or fallback to parameter
    // PartyKit expects just the host (e.g., "my-party.username.partykit.dev")
    const host = serverHost || import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999';

    if (this.socket?.readyState === WebSocket.OPEN) return;

    // PartyKit connection with room (session) ID
    this.socket = new PartySocket({
      host,
      room: sessionId
    });

    this.socket.addEventListener('open', () => {
      console.log('PartyKit connected');
      this.isConnected = true;
      this.emit('connected');
    });

    this.socket.addEventListener('close', () => {
      console.log('PartyKit disconnected');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;
        this.emit(type, payload);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    this.socket.addEventListener('error', (error) => {
      console.error('PartyKit connection error:', error);
      this.emit('error', error);
    });
  }

  createSession(sessionId) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to server');
    }

    this.sessionId = sessionId;
    this.role = 'host';

    this.socket.send(JSON.stringify({
      type: 'HOST_CREATE_SESSION',
      payload: { sessionId }
    }));
  }

  joinSession(sessionId) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to server');
    }

    this.sessionId = sessionId;
    this.role = 'viewer';

    this.socket.send(JSON.stringify({
      type: 'VIEWER_JOIN_SESSION',
      payload: { sessionId }
    }));
  }

  sendMessage(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: not connected');
      return;
    }

    this.socket.send(JSON.stringify({ type, payload }));
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.role = null;
    this.sessionId = null;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, payload) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`Error in listener for ${event}:`, error);
      }
    });
  }
}
