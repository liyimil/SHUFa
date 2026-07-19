export const adminRoles = ["EDITOR", "REVIEWER", "RIGHTS", "ADMIN"] as const;
export type AdminRole = (typeof adminRoles)[number];

export interface AdminPrincipal {
  email: string;
  roles: AdminRole[];
}

export interface AdminAccessTokenPayload {
  kind: "staff";
  roles: AdminRole[];
  sub: string;
}
