import { NextRequest, NextResponse } from 'next/server';
import { createAdminSessionToken, isTestUser } from '@/app/api/_lib/adminServerAuth';
import { listStoredUsers } from '@/app/api/_lib/userStore';

function encodePassword(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, '');
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { identifier?: unknown; password?: unknown } | null;
  const identifier = String(body?.identifier ?? '').trim();
  const password = String(body?.password ?? '');
  const normalized = identifier.toLowerCase();
  const cpf = normalizeCpf(identifier);
  if (!identifier || !password) return NextResponse.json({ ok: false, error: 'Identificação e senha são obrigatórias.' }, { status: 400 });
  const row = (await listStoredUsers()).find((item) => {
    if (isTestUser(item.payload)) return false;
    return String(item.payload.login ?? '').toLowerCase() === normalized ||
      String(item.payload.email ?? '').toLowerCase() === normalized ||
      normalizeCpf(String(item.payload.cpf ?? '')) === cpf;
  });
  const stored = String(row?.payload.passwordHash ?? '');
  if (!row || (stored !== password && stored !== encodePassword(password))) {
    return NextResponse.json({ ok: false, error: 'Identificação ou senha inválidos.' }, { status: 401 });
  }
  const response = NextResponse.json({
    ok: true,
    sessionEstablished: !row.payload.mfaEnabled,
    user: {
      ...row.payload,
      id: row.id,
      passwordHash: undefined,
    },
  });

  // Establish the server session as part of the successful credential login.
  // MFA-enabled accounts receive their cookie only after the second factor.
  if (!row.payload.mfaEnabled) {
    const token = createAdminSessionToken(row.id);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Sessão segura não configurada.' }, { status: 503 });
    }
    response.cookies.set('rbn_admin_user', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  }

  return response;
}
