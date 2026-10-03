'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  ImageUp,
  Plus,
  Settings,
  Shield,
  Trash2,
  Users,
  Volume2,
  X,
  Newspaper,
  Radio,
  Activity,
  PencilLine,
  ClipboardCheck,
  Vote,
} from 'lucide-react';
import { canAccessAdminRoute, useCurrentAdminUser } from '@/app/lib/adminPermissions';

const menuItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Artigos', href: '/admin/artigos', icon: FileText },
  { label: 'Novo artigo', href: '/admin/artigos/novo', icon: Plus },
  { label: 'Manchetes', href: '/admin/manchetes', icon: Newspaper },
  { label: 'Categorias', href: '/admin/categorias', icon: FolderOpen },
  { label: 'Podcasts', href: '/admin/podcasts', icon: Volume2 },
  { label: 'Comentários', href: '/admin/comentarios', icon: MessageCircle },
  { label: 'Mensagens', href: '/admin/mensagens', icon: MessageCircle },
  { label: 'Gerador de Card', href: '/admin/gerador-card', icon: ImageUp },
  { label: 'Usuários', href: '/admin/usuarios', icon: Users },
  { label: 'Monitoramento de Usuários', href: '/admin/monitoramento-usuarios', icon: Activity },
  { label: 'Recursos Humanos', href: '/admin/recursos-humanos', icon: ClipboardCheck },
  { label: 'Colunistas', href: '/admin/colunistas', icon: PencilLine },
  { label: 'Segurança', href: '/admin/seguranca', icon: Shield },
  { label: 'Publicidades', href: '/admin/publicidades', icon: Megaphone },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Radar de Notícias', href: '/admin/radar-noticias', icon: Radio },
  { label: 'Apuração Eleitoral', href: '/admin/apuracao', icon: Vote },
  { label: 'Lixo', href: '/admin/lixo', icon: Trash2 },
  { label: 'Configurações', href: '/admin/configuracoes', icon: Settings },
  { label: 'Diagnóstico', href: '/admin/diagnostico', icon: Activity },
  { label: 'Solicitações de acesso', href: '/admin/solicitacoes-acesso', icon: ClipboardCheck },
];

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const currentUser = useCurrentAdminUser();
  const visibleMenuItems = menuItems.filter((item) => canAccessAdminRoute(currentUser, item.href));

  const handleLogout = () => {
    localStorage.removeItem('adminUser');
    router.push('/admin/login');
  };

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-between bg-gray-900 p-4 text-white md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#991B1B] text-sm font-bold">R</div>
          <div>
            <p className="font-bold">RBN</p>
            <p className="text-xs text-gray-400">Rede Brasileira de Notícias</p>
          </div>
        </div>
        <button type="button" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col overflow-hidden bg-gray-900 text-white transition-transform duration-300 md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-gray-800 p-6">
          <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#991B1B] font-bold">R</div>
            <div>
                <h1 className="text-sm font-bold">RBN</h1>
                <p className="text-xs text-gray-400">Rede Brasileira de Notícias</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
            <p className="truncate text-sm font-semibold text-white">{currentUser?.name ?? 'Usuário logado'}</p>
          </div>
        </div>

        <nav className="admin-panel-scroll flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isArticlesSection = item.href === '/admin/artigos';
            const isActive =
              item.href === '/admin/dashboard'
                ? pathname === item.href
                : isArticlesSection
                  ? pathname === item.href || (pathname.startsWith('/admin/artigos/') && pathname !== '/admin/artigos/novo')
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
                  isActive ? 'bg-[#991B1B] text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-gray-800 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7F1D1D]"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <style jsx>{`
        .admin-panel-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.38) rgba(255, 255, 255, 0.08);
        }

        .admin-panel-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .admin-panel-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
        }

        .admin-panel-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.38);
          border-radius: 999px;
        }

        .admin-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.56);
        }
      `}</style>

      {isOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setIsOpen(false)} />}
    </>
  );
}
