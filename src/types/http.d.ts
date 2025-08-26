import { IncomingMessage } from 'http';
import { JwtPayload } from 'jsonwebtoken';

// Define the shape of your decoded JWT payload,
// which will be attached to the request object.
interface DecodedUserPayload extends JwtPayload {
  id: string;
  name: string;
}

// Extend the Express Request type globally.
// This is the standard and correct way to add properties
// to the `req` object within an Express application.
declare global {
  namespace Express {
    interface Request {
      user?: DecodedUserPayload;
    }
  }
}

// The native Node.js IncomingMessage type is also relevant for WebSocket handshakes.
// This ensures the 'user' property is available on the request object
// that the WebSocket server's `handleProtocols` function receives.
declare module 'http' {
  interface IncomingMessage {
    user?: DecodedUserPayload;
  }
}
