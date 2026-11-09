import RbnAuthPanel from '@/app/components/RbnAuthPanel';

export default async function ContaRbnPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const initialMode = mode === 'create' ? 'create' : 'login';

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#991B1B]">Conta RBN</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-gray-900">Acesse sua conta</h1>
      </div>

      <RbnAuthPanel initialMode={initialMode} />
    </main>
  );
}
