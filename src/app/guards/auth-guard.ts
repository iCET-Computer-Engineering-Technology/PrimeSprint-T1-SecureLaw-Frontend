import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ChatSessionService } from '../services/chat-session.service';


export const authGuard: CanActivateFn = (route, state) => {

  const router = inject(Router);
  const chatSession = inject(ChatSessionService);
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("role");


  // If navigating to login and already logged in, redirect based on role
  if (state.url === '/login' || state.url === '/') {
    if (!token) {
      return true;
    }

    if (userRole === 'SENIOR') {
      router.navigate(['/admin/user-management']);
    } else {
      chatSession.createChat().subscribe({
        next: (session) => {
          router.navigate(['/chat', session.chatId]);
        },
        error: (err) => {
          console.error('Failed to create chat session during auth guard login redirect:', err);
        },
      });
    }
    return false;
  }

  // For all other guarded routes, require token
  if (token) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
