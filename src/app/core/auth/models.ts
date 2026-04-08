export interface LoginRequest {
  usernameOrEmail: string;
  password: string;
}

export interface LoginResponse {
  accessToken?: string;
  accessTokenExpiresAt?: string;
  role?: string;
}

export interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
}