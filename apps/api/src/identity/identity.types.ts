export interface AnonymousSession {
  accessToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  refreshToken: string;
  tokenType: "Bearer";
  user: {
    id: string;
    kind: "anonymous" | "registered";
  };
}

export type IdentitySession = AnonymousSession;

export interface AccessTokenPayload {
  kind: "anonymous" | "registered";
  sub: string;
}

export interface AuthenticatedUser {
  id: string;
  kind: "anonymous" | "registered";
}
