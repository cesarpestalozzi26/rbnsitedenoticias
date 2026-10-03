import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminUser } from '../../_lib/adminServerAuth';

export const dynamic = 'force-dynamic';

const BUCKET = 'rbn-media';
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = /^(image|video)\/[a-z0-9.+-]+$/i;

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function extensionFor(fileName: string, contentType: string) {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
}

// Upload direto para o Supabase Storage: o arquivo não passa pela função da
// Vercel (limite de ~4,5 MB no corpo), evitando o HTTP 413.
export async function POST(request: NextRequest) {
  const user = await resolveAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: 'É necessário estar autenticado para enviar arquivos.' }, { status: 403 });
  }

  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Armazenamento de mídia não configurado.' }, { status: 503 });
  }

  let body: { fileName?: string; contentType?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const contentType = String(body.contentType ?? '');
  if (!ALLOWED_TYPES.test(contentType)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido. Envie imagem ou vídeo.' }, { status: 400 });
  }
  if (typeof body.size === 'number' && body.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo maior que 50 MB. Use um link de vídeo ou comprima o arquivo.' }, { status: 413 });
  }

  const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
  // Chaves no formato novo (sb_secret_...) não são JWT e vão apenas em apikey.
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`;

  // Cria o bucket público na primeira vez; erro "já existe" é ignorado.
  await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    cache: 'no-store',
  }).catch(() => null);

  const path = `${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(String(body.fileName ?? ''), contentType)}`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers,
    body: '{}',
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    return NextResponse.json({ error: `Falha ao preparar upload (${response.status}): ${detail}` }, { status: 502 });
  }

  const data = (await response.json()) as { url?: string; token?: string };
  const token = data.token ?? (data.url ? new URL(data.url, supabaseUrl).searchParams.get('token') : null);
  if (!token) {
    return NextResponse.json({ error: 'Supabase não retornou o token de upload.' }, { status: 502 });
  }

  return NextResponse.json({
    uploadUrl: `${supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}?token=${encodeURIComponent(token)}`,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`,
  });
}
