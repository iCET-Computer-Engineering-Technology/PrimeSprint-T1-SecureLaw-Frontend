import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { AuditLog } from '../models/audit-log';

export enum ActionType {
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  AI_REQUEST = 'AI_REQUEST',
  ROLE_CHANGED = 'ROLE_CHANGED',
  LOGIN = 'LOGIN',
  TEMPLATE_UPDATED = 'TEMPLATE_UPDATED',
  TEST_ACTION = 'TEST_ACTION'
}

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  
  constructor(private http: HttpClient) {}

  getAuditLogs(): Observable<AuditLog[]> {
    const token = localStorage.getItem('token');

    return this.http.get<AuditLog[]>(
      'http://localhost:8080/audit/get-all',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
  }

  exportLogs() {
    return this.http.get('http://localhost:8080/audit/export-all-audit-logs-csv', {
      responseType: 'blob' 
    });
  }

  getByUserId(userId: string) {
    return this.http.get<any[]>(`http://localhost:8080/audit/search-by-userId/${userId}`);
  }

  getByDate(fromDate: string, toDate: string) {
    return this.http.get<any[]>(
      `http://localhost:8080/audit/get-audit-by-date`,
      {
        params: {
          from: fromDate,   // ✅ FIXED
          to: toDate        // ✅ FIXED
        }
      }
    );
  }

  getByDateAndUser(userId: string, fromDate: string, toDate: string) {
    const token = localStorage.getItem('token');

    return this.http.get<AuditLog[]>(
      'http://localhost:8080/audit/get-audit-by-date-and-userId',
      {
        params: {
          id: userId,       // ✅ FIXED
          from: fromDate,   // ✅ FIXED
          to: toDate        // ✅ FIXED
        }
      ,
        headers: {
          Authorization: `Bearer ${token}` 
        }
      }
    );
  }
}



