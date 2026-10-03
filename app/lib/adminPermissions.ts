'use client';

import { useEffect, useState } from 'react';

export type AdminRole = 'admin' | 'editor-chefe' | 'editor' | 'jornalista' | 'colaborador' | 'estagiario';

export type AdminPermission =
  | 'dashboard:view'
  | 'articles:view:all'
  | 'articles:view:own'
  | 'articles:create'
  | 'articles:edit:any'
  | 'articles:edit:own'
  | 'articles:publish:any'
  | 'articles:publish:own'
  | 'articles:delete:any'
  | 'articles:trash:manage'
  | 'headlines:manage'
  | 'categories:manage'
  | 'podcasts:manage'
  | 'comments:manage'
  | 'publicities:manage'
  | 'analytics:view'
  | 'users:manage'
  | 'messages:view'
  | 'messages:send'
  | 'documentation:view'
  | 'documentation:upload'
  | 'documentation:review'
  | 'documentation:delete'
  | 'documentation:request'
  | 'documentation:manage'
  | 'settings:manage';

export interface AdminSessionUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  roleLevel: number;
  avatar?: string;
  login?: string;
  permissions?: string[];
  mustChangePassword?: boolean;
  onboardingStatus?: 'invite-sent' | 'first-access-pending' | 'password-changed' | 'active';
  lastLoginAt?: string;
  lastSeenAt?: string;
  isOnline?: boolean;
}

const ADMIN_USER_KEY = 'adminUser';

export const ROLE_LEVELS: Record<AdminRole, number> = {
  admin: 1,
  'editor-chefe': 2,
  editor: 3,
  jornalista: 4,
  colaborador: 5,
  estagiario: 6,
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Administrador',
  'editor-chefe': 'Editor-Chefe',
  editor: 'Editor',
  jornalista: 'Repórter/Redator',
  colaborador: 'Social Media',
  estagiario: 'Estagiário',
};

const ALL_PERMISSIONS: AdminPermission[] = [
  'dashboard:view',
  'articles:view:all',
  'articles:view:own',
  'articles:create',
  'articles:edit:any',
  'articles:edit:own',
  'articles:publish:any',
  'articles:publish:own',
  'articles:delete:any',
  'articles:trash:manage',
  'headlines:manage',
  'categories:manage',
  'podcasts:manage',
  'comments:manage',
  'publicities:manage',
  'analytics:view',
  'users:manage',
  'settings:manage',
  'messages:view',
  'messages:send',
  'documentation:view',
  'documentation:upload',
  'documentation:review',
  'documentation:delete',
  'documentation:request',
  'documentation:manage',
];

const ROLE_DEFAULT_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  admin: ALL_PERMISSIONS,
  'editor-chefe': [
    'dashboard:view',
    'articles:view:all',
    'articles:create',
    'articles:edit:any',
    'articles:publish:any',
    'articles:delete:any',
    'articles:trash:manage',
    'headlines:manage',
    'categories:manage',
    'comments:manage',
    'messages:view',
    'messages:send',
  ],
  editor: [
    'dashboard:view',
    'articles:view:all',
    'articles:create',
    'articles:edit:any',
    'articles:publish:any',
    'articles:delete:any',
    'articles:trash:manage',
    'headlines:manage',
    'categories:manage',
    'comments:manage',
    'messages:view',
    'messages:send',
  ],
  jornalista: ['dashboard:view', 'articles:view:own', 'articles:create', 'articles:edit:own', 'articles:publish:own', 'messages:view', 'messages:send', 'documentation:view', 'documentation:upload'],
  colaborador: ['dashboard:view', 'articles:view:own', 'articles:create', 'articles:edit:own', 'articles:publish:own', 'messages:view', 'messages:send', 'documentation:view', 'documentation:upload'],
  estagiario: ['dashboard:view', 'articles:view:own', 'articles:create', 'articles:edit:own', 'articles:publish:own', 'messages:view', 'messages:send', 'documentation:view', 'documentation:upload'],
};

export function getDefaultPermissionsForRole(role: AdminRole): AdminPermission[] {
  return [...(ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.jornalista)];
}

export function getRoleLevel(role: AdminRole) {
  return ROLE_LEVELS[role] ?? ROLE_LEVELS.jornalista;
}

export function getRoleLabel(role: AdminRole) {
  return ROLE_LABELS[role] ?? ROLE_LABELS.jornalista;
}

function normalizeRole(value: unknown): AdminRole {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (normalized === 'administrador principal' || normalized === 'administrador' || normalized === 'administrator') {
    return 'admin';
  }
  if (normalized === 'editor chefe' || normalized === 'editor-chefe' || normalized === 'editor chief') {
    return 'editor-chefe';
  }

  return normalized === 'admin' ||
    normalized === 'editor' ||
    normalized === 'jornalista' ||
    normalized === 'colaborador' ||
    normalized === 'estagiario'
    ? normalized
    : 'jornalista';
}

function normalizePermissions(role: AdminRole, permissions: unknown): AdminPermission[] {
  const defaults = getDefaultPermissionsForRole(role);
  if (!Array.isArray(permissions)) {
    return defaults;
  }

  // Production and communication tools are available to every authenticated
  // employee; stored legacy permissions must not remove this baseline.
  const employeeBaseline: AdminPermission[] = [
    'articles:view:own',
    'articles:create',
    'articles:edit:own',
    'articles:publish:own',
    'messages:view',
    'messages:send',
    'documentation:view',
    'documentation:upload',
    'documentation:request',
  ];
  const merged = new Set<string>([...defaults, ...employeeBaseline]);
  permissions.forEach((permission) => {
    if (typeof permission === 'string' && permission.trim()) {
      merged.add(permission.trim());
    }
  });

  return [...merged] as AdminPermission[];
}

export function getCurrentAdminUser(): AdminSessionUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(ADMIN_USER_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AdminSessionUser>;
    const role = normalizeRole(parsed.role);

    return {
      id: typeof parsed.id === 'string' ? parsed.id : 'current-user',
      name: typeof parsed.name === 'string' ? parsed.name : 'Usuário',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      role,
      roleLevel: typeof parsed.roleLevel === 'number' ? parsed.roleLevel : getRoleLevel(role),
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : undefined,
      login: typeof parsed.login === 'string' ? parsed.login : undefined,
      permissions: normalizePermissions(role, parsed.permissions),
      mustChangePassword: Boolean(parsed.mustChangePassword),
      onboardingStatus:
        parsed.onboardingStatus === 'invite-sent' ||
        parsed.onboardingStatus === 'first-access-pending' ||
        parsed.onboardingStatus === 'password-changed' ||
        parsed.onboardingStatus === 'active'
          ? parsed.onboardingStatus
          : 'active',
      lastLoginAt: typeof parsed.lastLoginAt === 'string' ? parsed.lastLoginAt : undefined,
      lastSeenAt: typeof parsed.lastSeenAt === 'string' ? parsed.lastSeenAt : undefined,
      isOnline: Boolean(parsed.isOnline),
    };
  } catch {
    return null;
  }
}

export function useCurrentAdminUser() {
  const [user, setUser] = useState<AdminSessionUser | null>(null);

  useEffect(() => {
    setUser(getCurrentAdminUser());

    const handleStorage = () => {
      setUser(getCurrentAdminUser());
    };

    const handleAdminUserChanged = () => {
      setUser(getCurrentAdminUser());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('adminUserChanged', handleAdminUserChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('adminUserChanged', handleAdminUserChanged);
    };
  }, []);

  return user;
}

export function hasPermission(user: AdminSessionUser | null, permission: AdminPermission) {
  if (!user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  return (user.permissions ?? []).includes(permission);
}

export function hasAnyPermission(user: AdminSessionUser | null, permissions: AdminPermission[]) {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function isAdmin(user: AdminSessionUser | null) {
  return user?.role === 'admin';
}

export function canAccessAdminRoute(user: AdminSessionUser | null, pathname: string) {
  if (!user) {
    return false;
  }

  if (pathname === '/admin/login') {
    return true;
  }

  if (user.mustChangePassword) {
    return pathname === '/admin/alterar-senha' || pathname === '/admin/login';
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    return hasPermission(user, 'dashboard:view');
  }

  if (pathname.startsWith('/admin/artigos/novo')) {
    return hasPermission(user, 'articles:create');
  }

  if (pathname.startsWith('/admin/artigos')) {
    return hasAnyPermission(user, ['articles:view:all', 'articles:view:own']);
  }

  if (pathname.startsWith('/admin/manchetes')) {
    return hasPermission(user, 'headlines:manage');
  }

  if (pathname.startsWith('/admin/categorias')) {
    return hasPermission(user, 'categories:manage');
  }

  if (pathname.startsWith('/admin/podcasts')) {
    return hasPermission(user, 'podcasts:manage');
  }

  if (pathname.startsWith('/admin/comentarios')) {
    return hasPermission(user, 'comments:manage');
  }

  if (pathname.startsWith('/admin/gerador-card')) {
    return hasAnyPermission(user, ['articles:view:all', 'articles:view:own', 'articles:create']);
  }

  if (pathname.startsWith('/admin/publicidades')) {
    return hasPermission(user, 'publicities:manage');
  }

  if (pathname.startsWith('/admin/analytics')) {
    return hasPermission(user, 'analytics:view');
  }

  if (pathname.startsWith('/admin/radar-noticias')) {
    return hasPermission(user, 'analytics:view');
  }

  if (pathname.startsWith('/admin/apuracao')) {
    return user.role === 'admin';
  }

  if (pathname.startsWith('/admin/lixo')) {
    return hasPermission(user, 'articles:trash:manage');
  }

  if (pathname.startsWith('/admin/usuarios') || pathname.startsWith('/admin/monitoramento-usuarios')) {
    return hasPermission(user, 'users:manage');
  }

  if (pathname.startsWith('/admin/mensagens')) {
    return hasPermission(user, 'messages:view');
  }

  if (pathname.startsWith('/admin/documentacao-equipe') || pathname.startsWith('/admin/recursos-humanos')) {
    return hasPermission(user, 'documentation:view');
  }

  if (pathname.startsWith('/admin/colunistas')) {
    return hasPermission(user, 'settings:manage');
  }

  if (pathname.startsWith('/admin/seguranca')) {
    return true; // Todo usuário logado pode gerenciar sua própria segurança
  }

  if (pathname.startsWith('/admin/configuracoes')) {
    return hasPermission(user, 'settings:manage');
  }

  if (pathname.startsWith('/admin/diagnostico')) {
    return hasPermission(user, 'settings:manage');
  }

  if (pathname.startsWith('/admin/solicitacoes-acesso')) {
    return true;
  }

  if (pathname.startsWith('/admin/alterar-senha')) {
    return true;
  }

  return hasPermission(user, 'dashboard:view');
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function isOwnArticle(user: AdminSessionUser | null, author: string) {
  if (!user) {
    return false;
  }

  return normalizeText(user.name) === normalizeText(author);
}

export function canViewAllArticles(user: AdminSessionUser | null) {
  return Boolean(user && (user.role === 'admin' || user.role === 'editor-chefe' || user.roleLevel <= 2)) ||
    hasPermission(user, 'articles:view:all');
}

export function canViewOwnArticles(user: AdminSessionUser | null) {
  return hasPermission(user, 'articles:view:own');
}

export function canCreateArticle(user: AdminSessionUser | null) {
  // Creation is available to every authenticated employee. Other actions
  // such as publishing, approving, deleting, or managing users stay scoped.
  return Boolean(user);
}

export function canEditArticle(user: AdminSessionUser | null, author: string) {
  if (!user) {
    return false;
  }

  if (hasPermission(user, 'articles:edit:any')) {
    return true;
  }

  return hasPermission(user, 'articles:edit:own') && isOwnArticle(user, author);
}

export function canPublishArticle(user: AdminSessionUser | null, author: string) {
  if (!user) {
    return false;
  }

  if (hasPermission(user, 'articles:publish:any')) {
    return true;
  }

  return hasPermission(user, 'articles:publish:own') && isOwnArticle(user, author);
}

export function canDeleteArticle(user: AdminSessionUser | null, author: string) {
  if (!user) {
    return false;
  }

  if (hasPermission(user, 'articles:delete:any')) {
    return true;
  }

  return hasPermission(user, 'articles:edit:own') && isOwnArticle(user, author);
}

export function canManageUsers(user: AdminSessionUser | null) {
  return hasPermission(user, 'users:manage');
}

export function canManageSettings(user: AdminSessionUser | null) {
  return hasPermission(user, 'settings:manage');
}

export function canManageCategories(user: AdminSessionUser | null) {
  return hasPermission(user, 'categories:manage');
}

export function canManagePodcasts(user: AdminSessionUser | null) {
  return hasPermission(user, 'podcasts:manage');
}

export function canManagePublicities(user: AdminSessionUser | null) {
  return hasPermission(user, 'publicities:manage');
}

export function canViewAnalytics(user: AdminSessionUser | null) {
  return hasPermission(user, 'analytics:view');
}

export function canViewDashboard(user: AdminSessionUser | null) {
  return hasPermission(user, 'dashboard:view');
}

export function canManageTrash(user: AdminSessionUser | null) {
  return hasPermission(user, 'articles:trash:manage');
}
