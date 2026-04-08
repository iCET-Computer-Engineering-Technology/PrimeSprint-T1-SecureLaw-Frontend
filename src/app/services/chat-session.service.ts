import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface ChatSession {
    chatId: string;
}

@Injectable({ providedIn: 'root' })
export class ChatSessionService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = environment.apiUrl;

    createChat(body?: unknown): Observable<ChatSession> {
        return this.http.post<ChatSession>(`${this.baseUrl}/api/chats`, body ?? {});
    }
}
