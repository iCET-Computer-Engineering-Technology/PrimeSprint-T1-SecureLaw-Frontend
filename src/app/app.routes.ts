import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { UserMgt } from './pages/admin/user-mgt/user-mgt';
import { authGuard } from './guards/auth-guard';
import { roleGuard } from './guards/role-guard';
import { Chat } from './pages/chat/chat';
import { AuditLog } from './pages/admin/audit-log/audit-log';
import { Forgotpassword } from './auth/login/forgotpassword/forgotpassword';
import { Resetpassword } from './auth/login/forgotpassword/resetpassword/resetpassword';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
    canActivate: [authGuard],
    
  },
  {
      path:'forgotpassword',
      component:Forgotpassword,
  },
  {
      path:'resetpassword',
      component:Resetpassword
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['SENIOR'] },
    children: [
      {
        path: 'user-management',
        component: UserMgt,
      },
      {
        path: 'audit-logs',
        component: AuditLog,
      },
    ],
  },
  {
    path: 'chat/:conversationId',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['SENIOR', 'JUNIOR'] },
    component: Chat,
  },
];
