import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { LoginRequest } from '../../models/auth';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  API = `${environment.apiUrl}/api/auth`;

  constructor(private readonly http: HttpClient) {}

  login(data: LoginRequest) {
    return this.http.post(`${this.API}/login`, data);
  }

  logout(data: any) {
    return this.http.post(`${this.API}/logout`, data);
  }

  me() {
    return this.http.get(`${this.API}/me`);
  }
}
