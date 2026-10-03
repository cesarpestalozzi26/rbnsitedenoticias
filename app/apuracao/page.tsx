import type { Metadata } from 'next';
import ElectionResults from '@/app/components/ElectionResults';

export const metadata: Metadata = {
  title: 'Apuração Eleitoral 2026 | RBN',
  description: 'Acompanhe os resultados oficiais das Eleições 2026 divulgados pelo Tribunal Superior Eleitoral.',
  alternates: {
    canonical: '/apuracao',
  },
  openGraph: {
    title: 'Apuração Eleitoral 2026 | RBN',
    description: 'Resultados oficiais do TSE acompanhados e apresentados pelo RBN.',
    type: 'website',
    url: '/apuracao',
  },
};

export default function ElectionPage() {
  return <ElectionResults />;
}
