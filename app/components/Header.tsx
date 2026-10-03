'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X, Search, Bell, UserRound, Radio } from 'lucide-react';
import { getCategoryDisplayName, normalizeCategorySlug } from '@/app/lib/categoryLabels';
import { useSettings } from '@/app/lib/settings';
import { readManagedCategories } from '@/app/lib/managedCategories';
import { readCurrentRbnUser } from '@/app/lib/rbnAuth';

function getFirstName(value: string) {
  const first = value.trim().split(/\s+/)[0];
  return first || 'Conta';
}

type ElectionNavigation = {
  active: boolean;
  visible: boolean;
  highlighted: boolean;
  publicPageEnabled: boolean;
  buttonText: string;
};

export default function Header() {
  const router = useRouter();
  const { getSettings } = useSettings();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState(getSettings());
  const [managedCategories, setManagedCategories] = useState(() => readManagedCategories());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [accountFirstName, setAccountFirstName] = useState('');
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [electionNavigation, setElectionNavigation] = useState<ElectionNavigation | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCurrentDate(new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/election/settings')
      .then(async (response) => {
        const data = await response.json() as { ok?: boolean } & Partial<ElectionNavigation>;
        if (!response.ok || !data.ok) throw new Error(`Falha ao carregar botão da apuração (${response.status}).`);
        if (active) {
          setElectionNavigation({
            active: data.active === true,
            visible: data.visible === true,
            highlighted: data.highlighted === true,
            publicPageEnabled: data.publicPageEnabled === true,
            buttonText: typeof data.buttonText === 'string' ? data.buttonText : 'Apuração Eleitoral',
          });
        }
      })
      .catch((error: unknown) => {
        console.error('[ELECTION_NAV]', 'settings-load-failed', error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncSettings = () => setSettings(getSettings());
    syncSettings();
    window.addEventListener('settingsChanged', syncSettings);
    return () => window.removeEventListener('settingsChanged', syncSettings);
  }, [getSettings]);

  useEffect(() => {
    const syncCategories = () => {
      setManagedCategories(readManagedCategories());
    };

    syncCategories();
    window.addEventListener('categoriesChanged', syncCategories);
    window.addEventListener('storage', syncCategories);
    return () => {
      window.removeEventListener('categoriesChanged', syncCategories);
      window.removeEventListener('storage', syncCategories);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncNotificationState = () => {
      const supported = 'Notification' in window;
      const isEnabled = localStorage.getItem('pz_news_notifications_enabled') === 'true';
      const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      setNotificationsEnabled(Boolean(supported && permission === 'granted' && isEnabled));
    };

    syncNotificationState();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silencioso: o app continua funcionando mesmo quando o service worker não pode ser registrado.
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncAccountName = () => {
      const user = readCurrentRbnUser();
      setAccountFirstName(user ? getFirstName(user.name) : '');
    };

    syncAccountName();
    window.addEventListener('rbnAuthChanged', syncAccountName);
    window.addEventListener('storage', syncAccountName);

    return () => {
      window.removeEventListener('rbnAuthChanged', syncAccountName);
      window.removeEventListener('storage', syncAccountName);
    };
  }, []);

  const toggleNotifications = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!('Notification' in window)) {
      alert('Seu navegador não suporta notificações na web. Em celulares, tente usar Chrome, Edge ou Samsung Internet.');
      return;
    }

    const isCurrentlyEnabled = localStorage.getItem('pz_news_notifications_enabled') === 'true';

    if (isCurrentlyEnabled) {
      localStorage.setItem('pz_news_notifications_enabled', 'false');
      setNotificationsEnabled(false);
      alert('Notificações desativadas. Você pode ativá-las novamente a qualquer momento.');
      return;
    }

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Ignora falha de registro em navegadores restritivos; a permissão contínua sendo abordada pelo navegador.
      }
    }

    const permission = await Notification.requestPermission();
    const nextEnabled = permission === 'granted';
    localStorage.setItem('pz_news_notifications_enabled', String(nextEnabled));
    setNotificationsEnabled(nextEnabled);

    if (nextEnabled) {
      const notification = new Notification('Notificações ativadas', {
        body: 'Você receberá avisos quando houver uma nova matéria publicada.',
        icon: '/logo-oficial.png',
        tag: 'rbn-notifications-enabled',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  };

  const primaryColor = settings.visual.primaryColor || '#991B1B';
  const secondaryColor = settings.visual.secondaryColor || '#111111';
  const logoSrc = settings.basic.logo || '/logo-oficial.png';
  const siteName = settings.basic.siteName || 'RBN';
  const siteTagline = settings.basic.siteTagline?.trim();
  const topBarLinks = (settings.basic.topBarLinks ?? []).filter((link) => link.enabled && link.label?.trim());

  const handleSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();

    if (!query) {
      router.push('/pesquisa');
      return;
    }

    router.push(`/pesquisa?q=${encodeURIComponent(query)}`);
  };

  const menuCategories = useMemo(
    () =>
      managedCategories
        .filter((category) => Boolean(category.slug || category.name))
        .sort((left, right) => (left.name || '').localeCompare(right.name || '')),
    [managedCategories]
  );
  const showElectionNavigation = Boolean(
    electionNavigation?.active && electionNavigation.visible && electionNavigation.publicPageEnabled
  );
  const electionNavigationClass = electionNavigation?.highlighted
    ? 'border border-[#991B1B] bg-[#991B1B] text-white shadow-[0_8px_20px_rgba(153,27,27,0.25)] hover:bg-[#7f1d1d]'
    : 'border border-gray-300 bg-white text-gray-800 hover:border-[#991B1B] hover:text-[#991B1B]';

  return (
    <>
      {topBarLinks.length > 0 && (
        <div className="border-b border-gray-800 bg-[#111111]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-1 text-[11px] text-gray-200 sm:px-4">
            <div className="flex flex-wrap items-center gap-3">
              <span>{currentDate ?? ' '}</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {topBarLinks.map((link, index) => (
                <a
                  key={`${link.label}-${index}`}
                  href={link.href || '#'}
                  target={link.href.startsWith('http') ? '_blank' : undefined}
                  rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
                  className="transition hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-[0_1px_0_rgba(17,17,17,0.04)]">
        <div className="mx-auto max-w-7xl px-3 py-1 sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className="flex shrink-0 items-center justify-center" aria-label={`${siteName} - Página inicial`}>
              <Image
                src={logoSrc}
                alt={siteName}
                width={180}
                height={72}
                priority
                sizes="(max-width: 768px) 96px, (max-width: 1280px) 110px, 140px"
                className="h-7 w-auto max-w-[96px] object-contain sm:h-8 sm:max-w-[110px] lg:h-9 lg:max-w-[140px]"
              />
            </Link>

            <form onSubmit={handleSearch} className="mx-2 hidden flex-1 md:flex">
              <div className="relative w-full">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Pesquisar..."
                  aria-label="Pesquisar notícias"
                  className="w-full rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-[#991B1B] focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Buscar notícias"
                  className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black text-white shadow-sm transition hover:scale-[1.02]"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="flex items-center gap-1.5">
              {showElectionNavigation && (
                <Link
                  href="/apuracao"
                  aria-label={`${electionNavigation?.buttonText} - Eleições 2026`}
                  className={`hidden items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition md:inline-flex ${electionNavigationClass}`}
                >
                  <Radio className="h-4 w-4" aria-hidden="true" />
                  <span>{electionNavigation?.buttonText}</span>
                </Link>
              )}
              <Link
                href="/pesquisa"
                aria-label="Ir para a página de pesquisa"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-100 md:hidden"
              >
                <Search className="h-5 w-5" />
              </Link>
              <button
                type="button"
                aria-label={notificationsEnabled ? 'Desativar notificações' : 'Ativar notificações'}
                onClick={toggleNotifications}
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition md:inline-flex ${
                  notificationsEnabled
                    ? 'border-[#991B1B] bg-[#991B1B] text-white'
                    : 'border-[#111111] bg-[#111111] text-white hover:bg-black'
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>{notificationsEnabled ? 'Notificações ativas' : 'Notificações'}</span>
              </button>
              <Link
                href="/conta-rbn?mode=login"
                className="hidden items-center gap-2 rounded-full bg-[#991B1B] px-3 py-2 text-[11px] font-semibold text-white shadow-[0_8px_20px_rgba(153,27,27,0.28)] transition hover:bg-[#7f1d1d] md:inline-flex"
                aria-label={accountFirstName ? `Conta RBN de ${accountFirstName}` : 'Entrar na Conta RBN'}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#991B1B] shadow-sm">
                  <UserRound className="h-3.5 w-3.5" />
                </span>
                <span>{accountFirstName ? `Olá, ${accountFirstName}` : 'Entrar'}</span>
              </Link>
              <Link
                href="/conta-rbn?mode=login"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#991B1B]/30 bg-[#991B1B]/5 px-3 text-[#991B1B] shadow-sm md:hidden"
                aria-label={accountFirstName ? `Conta RBN de ${accountFirstName}` : 'Entrar na Conta RBN'}
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                  <UserRound className="h-4 w-4" />
                  {accountFirstName || 'Entrar'}
                </span>
              </Link>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="rounded-full p-1.5 hover:bg-gray-100 md:hidden"
              >
                {isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {siteTagline && (
            <div className="pb-1 pt-1 md:pb-0">
              <div className="flex items-center justify-center md:ml-[148px] md:justify-start">
                <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-gray-600 sm:text-[10px] md:-mt-2 md:text-[11px]">
                  {siteTagline}
                </p>
              </div>
            </div>
          )}


        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="border-b border-gray-200 bg-white p-4 md:hidden">
          {showElectionNavigation && (
            <Link
              href="/apuracao"
              onClick={() => setIsMenuOpen(false)}
              aria-label={`${electionNavigation?.buttonText} - Eleições 2026`}
              className={`mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wide transition ${electionNavigationClass}`}
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              {electionNavigation?.buttonText}
            </Link>
          )}
          <Link
            href="/conta-rbn?mode=login"
            onClick={() => setIsMenuOpen(false)}
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#991B1B] px-4 py-3 text-sm font-semibold text-white"
          >
            <UserRound className="h-4 w-4" />
            {accountFirstName ? `Entrar como ${accountFirstName}` : 'Entrar ou criar conta RBN'}
          </Link>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Categorias</p>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              aria-label="Fechar menu de categorias"
              className="rounded-full p-1.5 text-gray-600 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {menuCategories.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {menuCategories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categoria/${normalizeCategorySlug(category.slug || category.name)}`}
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-[#991B1B]/30 hover:bg-[#991B1B]/5 hover:text-[#991B1B]"
                >
                  {getCategoryDisplayName(category.name)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500">
              Nenhuma categoria com matéria publicada.
            </p>
          )}
        </div>
      )}
    </>
  );
}
