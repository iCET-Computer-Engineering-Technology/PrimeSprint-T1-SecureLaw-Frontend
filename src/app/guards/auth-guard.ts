import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {

  const router = inject(Router);
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
      router.navigate(['/chat/' + Math.random().toString(36).substring(2, 10)]);
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
