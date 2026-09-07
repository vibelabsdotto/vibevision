import { Request } from 'express';

/**
 * Per-user identity: every authenticated identity (session OR token) is
 * bound to exactly one user id. Services scope all reads/writes with it.
 */
export interface AuthContext {
  userId: string;
  email: string;
  via: 'session' | 'token';
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}
