'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Lock, Smartphone, UserRound } from 'lucide-react';
import { ADMIN_LOGIN, ADMIN_EMAIL, DEFAULT_PASSWORD, buildUserLogin, normalizeCpf, useUsers } from '@/app/hooks/useUsers';

function hashPassword(value: string) {
  if (!value) {
    return '';
  }

  return btoa(value);
}

function hashPasswordUtf8(value: string) {
  if (!value) {
    return '';
  }

  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function matchesPassword(storedHash: string, inputPassword: string) {
  if (!storedHash || !inputPassword) {
    return false;
  }

  return (
    storedHash === inputPassword ||
    storedHash === hashPassword(inputPassword) ||
    storedHash === hashPasswordUtf8(inputPassword)
  );
}

type LoginStep = 'credentials' | 'mfa' | 'email';

export default function AdminLogin() {
  const router = useRouter();
  const { users, isLoaded } = useUsers();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [pendingUserId, setPendingUserId] = useState('');
  const [pendingUserData, setPendingUserData] = useState<Record<string, unknown> | null>(null);

  const markLoginActivity = (userId: string) => {
    void fetch('/api/admin/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-user-id': userId },
      body: JSON.stringify({ event: 'login' }),
    }).catch(() => undefined);
  };

  const establishSession = async (userId: string, secret: string) => {
    const response = await fetch('/api/auth/admin-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password: secret }),
    });
    return response.ok;
  };

  const loginHint = useMemo(() => {
    if (!isLoaded || !users.length) {
      return ADMIN_LOGIN;
    }

    return `Ex.: ${users[0].login}`;
  }, [isLoaded, users]);

  const resolveUserByIdentifier = (value: string) => {
    const cleanIdentifier = value.trim();
    if (!cleanIdentifier) {
      return null;
    }

    const loginCandidate = cleanIdentifier.toUpperCase();
    const credential = cleanIdentifier.startsWith('RBN') ? loginCandidate : buildUserLogin(normalizeCpf(cleanIdentifier));

    return users.find(
      (item) =>
        item.login.toUpperCase() === credential ||
        normalizeCpf(item.cpf) === normalizeCpf(cleanIdentifier) ||
        item.email.toLowerCase() === cleanIdentifier.toLowerCase()
    );
  };

  const shouldForcePasswordChange = (user: { passwordChangeRequired?: boolean; onboardingStatus?: string }) => {
    return Boolean(user.passwordChangeRequired) || user.onboardingStatus === 'invite-sent' || user.onboardingStatus === 'first-access-pending';
  };

  const handleSubmitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    let user = null as ReturnType<typeof resolveUserByIdentifier>;
    let authenticatedRemotely = false;
    let serverSessionEstablished = false;
    let remoteLoginUnavailable = false;
    try {
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.user) {
        user = data.user;
        authenticatedRemotely = true;
        serverSessionEstablished = data.sessionEstablished === true;
      } else if (!response.ok && response.status >= 500) {
        remoteLoginUnavailable = true;
      }
    } catch {
      remoteLoginUnavailable = true;
    }

    // Only use the cached directory when the backend is unavailable. A cached
    // user must never override a server-side credential rejection.
    if (!user && remoteLoginUnavailable) {
      user = resolveUserByIdentifier(identifier);
    }

    if (!user || (!authenticatedRemotely && !matchesPassword(user.passwordHash, password))) {
      setError('Identificacao ou senha invalidos. Use o login RBN + CPF e a senha cadastrada.');
      setLoading(false);
      return;
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      roleLevel: user.roleLevel,
      avatar: user.avatar,
      login: user.login,
      permissions: user.permissions,
      mustChangePassword: shouldForcePasswordChange(user),
      onboardingStatus: user.onboardingStatus,
    };

    try {
      const mfaStatusResponse = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', userId: user.id }),
      });

      const mfaStatus = await mfaStatusResponse.json();

      if (mfaStatus.mfaEnabled) {
        setPendingUserId(user.id);
        setPendingUserData(userData);
        setStep('mfa');
        setLoading(false);
        return;
      }
    } catch {
      // Se nao conseguir verificar MFA, continua sem ele
    }

    // O login remoto já cria a sessão de contas sem MFA; os demais fluxos
    // ainda precisam concluir a validação segura após a verificação de MFA.
    if (!serverSessionEstablished && !(await establishSession(user.id, password))) {
      setError('Não foi possível iniciar uma sessão segura. Tente novamente.');
      setLoading(false);
      return;
    }
    markLoginActivity(user.id);
    localStorage.setItem('adminUser', JSON.stringify(userData));
    if (shouldForcePasswordChange(user)) {
      router.push('/admin/alterar-senha');
    } else {
      router.push('/admin/dashboard');
    }
    setLoading(false);
  };

  const handleLoginByEmailCode = async () => {
    const user = resolveUserByIdentifier(identifier);

    if (!user) {
      setError('Usuario nao encontrado para o identificador informado.');
      return;
    }

    setError('');
    setLoading(true);
    setPendingUserId(user.id);
    setPendingUserData({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      roleLevel: user.roleLevel,
      avatar: user.avatar,
      login: user.login,
      permissions: user.permissions,
    });

    try {
      const response = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-email-code', userId: user.id, email: user.email }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || 'Nao foi possivel enviar o codigo por e-mail.');
        setLoading(false);
        return;
      }

      setStep('email');
      setEmailCode(data.debugCode || '');
      setError(data.fallback ? 'Codigo de emergencia gerado para acesso administrativo.' : '');
    } catch {
      setError('Erro ao enviar o codigo por e-mail. Tente novamente.');
    }

    setLoading(false);
  };

  const handleSubmitMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    if (mfaCode.length !== 6) {
      setError('Informe os 6 digitos do codigo do autenticador.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', userId: pendingUserId, token: mfaCode }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError('Codigo invalido ou expirado. Tente novamente.');
        setLoading(false);
        return;
      }

      if (!(await establishSession(pendingUserId, password))) {
        setError('Não foi possível iniciar uma sessão segura. Entre novamente com sua senha.');
        setLoading(false);
        return;
      }
      markLoginActivity(pendingUserId);
      localStorage.setItem('adminUser', JSON.stringify(pendingUserData));
      router.push(pendingUserData?.mustChangePassword ? '/admin/alterar-senha' : '/admin/dashboard');
    } catch {
      setError('Erro ao verificar codigo. Tente novamente.');
    }

    setLoading(false);
  };

  const handleSendEmailCode = async () => {
    if (!pendingUserId) {
      setError('Necessário validar o usuário antes de solicitar o código por e-mail.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-email-code',
          userId: pendingUserId,
          email: pendingUserData?.email || ADMIN_EMAIL,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || 'Não foi possível enviar o código por e-mail.');
        setLoading(false);
        return;
      }

      setStep('email');
      setEmailCode(data.debugCode || '');
      setError(data.fallback ? 'Código de emergência gerado. Use o código preenchido no campo abaixo.' : '');
    } catch {
      setError('Erro ao enviar o código por e-mail. Tente novamente.');
    }

    setLoading(false);
  };

  const handleSubmitEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    if (emailCode.length !== 6) {
      setError('Informe os 6 digitos do código enviado para o e-mail.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-email-code', userId: pendingUserId, token: emailCode }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || 'Código de e-mail inválido ou expirado.');
        setLoading(false);
        return;
      }

      markLoginActivity(pendingUserId);
      localStorage.setItem('adminUser', JSON.stringify(pendingUserData));
      router.push(pendingUserData?.mustChangePassword ? '/admin/alterar-senha' : '/admin/dashboard');
    } catch {
      setError('Erro ao validar o código enviado por e-mail.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#991B1B] to-[#7F1D1D] flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#991B1B] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RBN</h1>
          <p className="text-gray-600 text-sm mt-1">Rede Brasileira de Noticias - Painel Administrativo</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-[#991B1B]/5 border border-[#991B1B]/20 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#991B1B]" />
            <p className="text-sm text-[#991B1B]">{error}</p>
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleSubmitCredentials} className="space-y-5">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs text-gray-700">
              Acesso oficial: <span className="font-semibold text-gray-900">{ADMIN_LOGIN}</span> / <span className="font-semibold text-gray-900">{DEFAULT_PASSWORD}</span>
              <span className="mt-1 block text-[11px] text-gray-500">{ADMIN_EMAIL}</span>
            </div>

            <div>
              <label className="block text-gray-900 font-semibold mb-2">Identificacao</label>
              <div className="relative">
                <UserRound className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={ADMIN_LOGIN}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Use o formato {loginHint}</p>
            </div>

            <div>
              <label className="block text-gray-900 font-semibold mb-2">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="........"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Senha padrao: {DEFAULT_PASSWORD}</p>
            </div>

            <button
              type="submit"
              disabled={loading || !isLoaded}
              className="w-full bg-[#111111] text-white font-bold py-2 rounded-lg hover:bg-[#2a2a2a] transition disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Entrar no Painel'}
            </button>

            <button
              type="button"
              onClick={handleLoginByEmailCode}
              disabled={loading || !isLoaded || !identifier.trim()}
              className="w-full text-sm font-semibold text-[#991B1B] hover:text-[#7F1D1D] transition"
            >
              {loading ? 'Enviando...' : 'Entrar com código do e-mail'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleSubmitMfa} className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
              <Smartphone className="h-5 w-5 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-800">
                Abra o <strong>Microsoft Authenticator</strong> e informe o codigo de 6 digitos.
              </p>
            </div>

            <div>
              <label className="block text-gray-900 font-semibold mb-2 text-center">Codigo do autenticador</label>
              <input
                type="text"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full py-4 border border-gray-300 rounded-lg focus:outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10 text-center text-3xl font-bold tracking-[0.5em]"
                maxLength={6}
                autoFocus
                required
              />
              <p className="text-xs text-center text-gray-500 mt-1">O codigo se renova a cada 30 segundos</p>
            </div>

            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full bg-[#111111] text-white font-bold py-2 rounded-lg hover:bg-[#2a2a2a] transition disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Confirmar codigo'}
            </button>

            <button
              type="button"
              onClick={handleSendEmailCode}
              disabled={loading}
              className="w-full text-sm text-blue-700 hover:text-blue-900 transition"
            >
              {loading ? 'Enviando...' : 'Usar código enviado por e-mail'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setMfaCode(''); setError(''); }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Voltar ao login
            </button>
          </form>
        )}

        {step === 'email' && (
          <form onSubmit={handleSubmitEmailCode} className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <Lock className="h-5 w-5 text-amber-700 shrink-0" />
              <p className="text-sm text-amber-800">
                Enviamos um código de 6 dígitos para o e-mail do administrador.
              </p>
            </div>

            <div>
              <label className="block text-gray-900 font-semibold mb-2 text-center">Código por e-mail</label>
              <input
                type="text"
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full py-4 border border-gray-300 rounded-lg focus:outline-none focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10 text-center text-3xl font-bold tracking-[0.5em]"
                maxLength={6}
                autoFocus
                required
              />
              <p className="text-xs text-center text-gray-500 mt-1">Use o código do e-mail para entrar no painel</p>
            </div>

            <button
              type="submit"
              disabled={loading || emailCode.length !== 6}
              className="w-full bg-[#111111] text-white font-bold py-2 rounded-lg hover:bg-[#2a2a2a] transition disabled:opacity-50"
            >
              {loading ? 'Validando...' : 'Entrar com código do e-mail'}
            </button>

            <button
              type="button"
              onClick={handleSendEmailCode}
              disabled={loading}
              className="w-full text-sm text-blue-700 hover:text-blue-900 transition"
            >
              Reenviar código
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setEmailCode(''); setError(''); }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Voltar ao login
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600">
            Voltar para o{' '}
            <Link href="/" className="text-[#991B1B] font-semibold hover:text-[#7F1D1D]">
              portal principal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
