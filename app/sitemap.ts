import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.rbnbrasil.com.br';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    '',
    '/quem-somos',
    '/como-funciona',
    '/contato',
    '/politica-editorial',
    '/privacidade',
    '/termos',
    '/servicos',
    '/pesquisa',
    '/apuracao',
    '/conta-rbn',
    '/categoria/politica',
    '/categoria/brasil',
    '/categoria/mundo',
    '/categoria/economia',
    '/categoria/esporte',
    '/categoria/cultura',
    '/categoria/famosos',
    '/categoria/tecnologia',
  ];

  return staticPages.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: path === '' ? 1 : 0.8,
  }));
}
