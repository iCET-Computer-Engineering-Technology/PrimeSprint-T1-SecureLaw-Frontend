import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("role");
  const allowedRoles = route.data['roles'];

  // If navigating to login and already logged in, redirect based on role
  if (state.url === '/login' || state.url === '/') {
    if (!token) {
      return true;
    }

    if (userRole === 'SENIOR') {
      router.navigate(['/admin/user-management']);
    } else {
      router.navigate(['/chat']);
    }
    return false;
  }

  // For all other guarded routes, require token
  if (token) {
    // Check if the user has an allowed role
    if (allowedRoles && !allowedRoles.includes(userRole)) {
      router.navigate(['/unauthorized']);
      return false;
    }
    return true;
  }

  router.navigate(['/login']);
  return false;
};
