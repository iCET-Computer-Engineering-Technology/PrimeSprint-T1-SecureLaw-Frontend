import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { UserMgt } from './pages/admin/user-mgt/user-mgt';
import { authGuard } from './guards/auth-guard';
import { roleGuard } from './guards/role-guard';
import { Chat } from './pages/chat/chat';
import { AuditLog } from './pages/admin/audit-log/audit-log';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { ResetPassword } from './pages/reset-password/reset-password';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },{
    path: 'reset-password',
    component: ResetPassword,
  },
  {
    path: 'login',
    component: Login,
    canActivate: [authGuard],
  },
  {
    path: 'forgot-password',
    component: ForgotPassword,
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
    path: 'chat/:chatId',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['SENIOR', 'JUNIOR'] },
    component: Chat,
  },
];
