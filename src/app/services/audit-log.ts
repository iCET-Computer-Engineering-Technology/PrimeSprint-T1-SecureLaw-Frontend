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

export interface PIIDailyCount {
  day: string;       
  totalBlocked: number;
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

  getPiiStats(filters?: any): Observable<PIIDailyCount[]> {

    const params: any = {};

    if (filters?.userId) params.userId = filters.userId;
    if (filters?.fromDate) params.fromDate = filters.fromDate;
    if (filters?.toDate) params.toDate = filters.toDate;

    return this.http.get<PIIDailyCount[]>(
      'http://localhost:8080/audit/pii-daily-count',
      {
        headers: {
          Authorization: 'Bearer ' + localStorage.getItem('token')
        },
        params 
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
          from: fromDate,   
          to: toDate        
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
          id: userId,       
          from: fromDate,   
          to: toDate        
        }
      ,
        headers: {
          Authorization: `Bearer ${token}` 
        }
      }
    );
  }
}



