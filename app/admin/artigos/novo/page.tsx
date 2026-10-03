'use client';

import Link from 'next/link';
import { uploadMedia } from '@/app/lib/uploadMedia';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Save, Send, CalendarClock, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/app/components/AdminSidebar';
import ArticleMediaManager, { type ArticleImage, type ArticleVideo } from '@/app/components/ArticleMediaManager';
import ArticlePreviewPanel from '@/app/components/ArticlePreviewPanel';
import HtmlEditor from '@/app/components/HtmlEditor';
import { useArticles } from '@/app/hooks/useArticles';
import { getPublicUserName, useUsers } from '@/app/hooks/useUsers';
import type { PestalozziChatMessage, PestalozziVersion } from '@/app/lib/pestalozzi';
import { RADAR_EDITOR_DRAFT_STORAGE_KEY, type RadarEditorDraft } from '@/app/lib/radarEditorDraft';
import {
  canCreateArticle,
  canPublishArticle,
  canViewAllArticles,
  useCurrentAdminUser,
} from '@/app/lib/adminPermissions';
import { defaultManagedCategories, readManagedCategories, type ManagedCategory } from '@/app/lib/managedCategories';
import { slugifyTitle, getArticleHref } from '@/app/lib/articleSlug';

function stripHtml(content: string) {
  return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(content: string) {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Envia ao Supabase Storage e devolve a URL pública (evita HTTP 413).
function fileToDataUrl(file: File) {
  return uploadMedia(file, file.name);
}

function normalizeCategorySlug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapRadarCategoryToManagedCategory(category: string, categories: ManagedCategory[]) {
  const target = normalizeCategorySlug(category);
  const match = categories.find((item) => normalizeCategorySlug(item.slug || item.name) === target);
  return match?.slug ?? categories[0]?.slug ?? 'geral';
}

type AudienceRecipient = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type EditorialChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

type PestalozziSuggestion = {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  generatedAt: string;
  mode: 'reescrita-editorial' | 'pesquisa-complementacao';
};

type PestalozziChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function NewArticlePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addArticle, persistArticle, isLoaded } = useArticles();
  const { users } = useUsers();
  const currentUser = useCurrentAdminUser();
  const brazilianLocations = [
    'Acre',
    'Alagoas',
    'Amapá',
    'Amazonas',
    'Bahia',
    'Ceará',
    'Distrito Federal',
    'Espírito Santo',
    'Goiás',
    'Maranhão',
    'Mato Grosso',
    'Mato Grosso do Sul',
    'Minas Gerais',
    'Pará',
    'Paraíba',
    'Paraná',
    'Pernambuco',
    'Piauí',
    'Rio de Janeiro',
    'Rio Grande do Norte',
    'Rio Grande do Sul',
    'Rondônia',
    'Roraima',
    'Santa Catarina',
    'São Paulo',
    'Sergipe',
    'Tocantins',
  ];
  const defaultAuthor = currentUser?.name ?? users.find((user) => user.status === 'ativo')?.name ?? 'César Pestalozzi';
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    category: defaultManagedCategories[0]?.slug ?? 'economia',
    excerpt: '',
    content: '',
    author: defaultAuthor,
    authorUserIds: currentUser?.id ? [currentUser.id] : [],
    columnistUserId: '',
    showColumnist: false,
    location: 'São Paulo',
    featured: false,
  });
  const [availableCategories, setAvailableCategories] = useState<ManagedCategory[]>(defaultManagedCategories);

  useEffect(() => {
    const syncCategories = () => {
      const managed = readManagedCategories();
      setAvailableCategories(managed);
      setFormData((current) => {
        if (managed.some((category) => category.slug === current.category)) {
          return current;
        }
        return {
          ...current,
          category: managed[0]?.slug ?? current.category,
        };
      });
    };

    syncCategories();
    window.addEventListener('categoriesChanged', syncCategories);
    window.addEventListener('storage', syncCategories);

    return () => {
      window.removeEventListener('categoriesChanged', syncCategories);
      window.removeEventListener('storage', syncCategories);
    };
  }, []);

  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [showScheduleFields, setShowScheduleFields] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{
    message: string;
    status: 'rascunho' | 'agendado' | 'publicado';
    articleId: string;
    articleHref: string;
  } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [audienceRecipients, setAudienceRecipients] = useState<AudienceRecipient[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isLoadingAudience, setIsLoadingAudience] = useState(true);
  const [audienceError, setAudienceError] = useState('');
  const [mediaState, setMediaState] = useState<{ images: ArticleImage[]; videos: ArticleVideo[]; primaryImage: string }>({
    images: [],
    videos: [],
    primaryImage: '',
  });
  const [radarDraft, setRadarDraft] = useState<RadarEditorDraft | null>(null);
  const [selectedTitleOption, setSelectedTitleOption] = useState('');
  const [journalistReviewDone, setJournalistReviewDone] = useState(false);
  const [editorialWarning, setEditorialWarning] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoDescriptionManuallyEdited, setSeoDescriptionManuallyEdited] = useState(false);
  const [slugSuggestion, setSlugSuggestion] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [isPestalozziOpen, setIsPestalozziOpen] = useState(false);
  const [pestalozziFeedback, setPestalozziFeedback] = useState('');
  const [isPestalozziProcessing, setIsPestalozziProcessing] = useState(false);
  const [pestalozziSuggestion, setPestalozziSuggestion] = useState<PestalozziSuggestion | null>(null);
  const [pestalozziOriginalSnapshot, setPestalozziOriginalSnapshot] = useState<PestalozziSuggestion | null>(null);
  const [pestalozziInput, setPestalozziInput] = useState('');
  const [pestalozziChat, setPestalozziChat] = useState<PestalozziChatEntry[]>([]);
  const [pestalozziVersions, setPestalozziVersions] = useState<PestalozziVersion[]>([]);

  const plainContent = useMemo(() => stripHtml(formData.content), [formData.content]);
  const wordCount = plainContent.length > 0 ? plainContent.split(' ').length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const selectedRecipients = useMemo(
    () => audienceRecipients.filter((recipient) => selectedRecipientIds.includes(recipient.id)),
    [audienceRecipients, selectedRecipientIds]
  );
  const editorialChecklist = useMemo<EditorialChecklistItem[]>(() => {
    const hasCredit = mediaState.images.some((image) => image.caption.includes('Crédito:') || image.caption.includes('crédito'));
    const hasSeo = seoDescription.trim().length >= 70 || formData.excerpt.trim().length >= 70;
    const hasSources = (radarDraft?.sources.length ?? 0) > 0;
    const hasPendingFacts = (radarDraft?.facts.filter((fact) => fact.status !== 'confirmada').length ?? 0) > 0;

    return [
      { id: 'titulo', label: 'Título', ok: formData.title.trim().length >= 15, detail: 'Use um título claro e informativo.' },
      { id: 'linha-fina', label: 'Linha fina', ok: formData.subtitle.trim().length >= 20, detail: 'A linha fina deve contextualizar o lead.' },
      { id: 'texto', label: 'Texto', ok: wordCount >= 120, detail: 'Corpo da matéria com contexto e apuração mínima.' },
      { id: 'fontes', label: 'Fontes', ok: hasSources, detail: 'Liste fontes verificáveis com links originais.' },
      { id: 'imagem', label: 'Imagem', ok: mediaState.images.length > 0, detail: 'Selecione imagem principal ou faça upload próprio.' },
      { id: 'credito', label: 'Crédito', ok: hasCredit, detail: 'Inclua crédito e origem da imagem.' },
      { id: 'seo', label: 'SEO', ok: hasSeo, detail: 'Resumo/descrição com pelo menos 70 caracteres.' },
      { id: 'confirmacao', label: 'Confirmação', ok: !hasPendingFacts, detail: 'Pendências precisam ser verificadas pela redação.' },
    ];
  }, [formData.excerpt, formData.subtitle, formData.title, mediaState.images, radarDraft, seoDescription, wordCount]);
  const pendingChecklistItems = editorialChecklist.filter((item) => !item.ok);
  const effectiveAuthor = formData.author || defaultAuthor;
  const selectedAuthorIds = formData.authorUserIds ?? [];
  const selectedAuthors = users.filter((user) => selectedAuthorIds.includes(user.id));
  const effectiveAuthorNames = selectedAuthors.length > 0
    ? selectedAuthors.map((user) => user.name).join(' e ')
    : effectiveAuthor;

  useEffect(() => {
    const source = searchParams.get('source');
    if (source !== 'radar') {
      return;
    }

    const stored = window.localStorage.getItem(RADAR_EDITOR_DRAFT_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as RadarEditorDraft;
      const mappedCategory = mapRadarCategoryToManagedCategory(parsed.category, availableCategories);
      const suggestedImages: ArticleImage[] = parsed.imageSuggestions.map((image, index) => ({
        id: image.id,
        url: image.url,
        alt: parsed.suggestedTitle,
        caption: `${image.caption} (${image.credit})`,
        isPrimary: index === 0,
        name: image.origin,
        placement: 'gallery',
      }));

      const timeoutId = window.setTimeout(() => {
        setRadarDraft(parsed);
        setSelectedTitleOption(parsed.suggestedTitle);
        setJournalistReviewDone(false);
        setEditorialWarning('');
        setSeoDescription(parsed.seoDescription);
        setSeoDescriptionManuallyEdited(true);
        setSlugSuggestion(parsed.slugSuggestion);
        setKeywordTags(parsed.keywords);
        setFormData((current) => ({
          ...current,
          title: parsed.suggestedTitle,
          subtitle: parsed.subtitle,
          excerpt: parsed.excerpt,
          content: parsed.contentHtml,
          category: mappedCategory,
          location: parsed.location || current.location,
          author: current.author || defaultAuthor,
        }));
        setMediaState((current) => ({
          images: suggestedImages.length > 0 ? suggestedImages : current.images,
          videos: current.videos,
          primaryImage: suggestedImages[0]?.url ?? current.primaryImage,
        }));
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    } catch (error) {
      console.error('Falha ao carregar rascunho do Radar no editor:', error);
    }
  }, [availableCategories, defaultAuthor, searchParams]);

  useEffect(() => {
    let isActive = true;

    const loadAudience = async () => {
      setIsLoadingAudience(true);
      setAudienceError('');

      try {
        const response = await fetch('/api/admin/audience', { method: 'GET', headers: { Accept: 'application/json' } });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; users?: AudienceRecipient[]; error?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Não foi possível carregar os usuários cadastrados.');
        }

        if (!isActive) {
          return;
        }

        const users = Array.isArray(payload.users) ? payload.users : [];
        setAudienceRecipients(users);
        setSelectedRecipientIds(users.map((user) => user.id));
      } catch (error) {
        if (!isActive) {
          return;
        }
        setAudienceError(error instanceof Error ? error.message : 'Erro ao carregar público.');
      } finally {
        if (isActive) {
          setIsLoadingAudience(false);
        }
      }
    };

    loadAudience();

    return () => {
      isActive = false;
    };
  }, []);

  const handleFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    const checked = type === 'checkbox' ? (event.target as HTMLInputElement).checked : undefined;

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const applyTitleOption = (title: string) => {
    setSelectedTitleOption(title);
    setFormData((current) => ({ ...current, title }));
  };

  // Gera automaticamente a sugestão de URL (slug) a partir do título,
  // enquanto o usuário não editar o campo manualmente.
  useEffect(() => {
    if (slugManuallyEdited) {
      return;
    }
    setSlugSuggestion(slugifyTitle(formData.title));
  }, [formData.title, slugManuallyEdited]);

  // Gera automaticamente a descrição para SEO a partir do resumo (ou da
  // linha fina, se o resumo ainda não tiver sido escrito), enquanto o
  // usuário não editar o campo manualmente.
  useEffect(() => {
    if (seoDescriptionManuallyEdited) {
      return;
    }
    const source = formData.excerpt.trim() || formData.subtitle.trim();
    setSeoDescription(source.slice(0, 160));
  }, [formData.excerpt, formData.subtitle, seoDescriptionManuallyEdited]);

  const runAiAssistAction = (action: 'melhorar-titulo' | 'criar-linha-fina' | 'criar-resumo' | 'expandir-contexto' | 'gerar-nova-versao') => {
    if (!radarDraft) {
      return;
    }

    if (action === 'melhorar-titulo') {
      const currentIndex = radarDraft.titleOptions.findIndex((option) => option === (selectedTitleOption || formData.title));
      const nextTitle = radarDraft.titleOptions[(currentIndex + 1) % radarDraft.titleOptions.length] ?? radarDraft.suggestedTitle;
      applyTitleOption(nextTitle);
      return;
    }

    if (action === 'criar-linha-fina') {
      setFormData((current) => ({ ...current, subtitle: radarDraft.subtitle }));
      return;
    }

    if (action === 'criar-resumo') {
      setFormData((current) => ({ ...current, excerpt: radarDraft.excerpt }));
      return;
    }

    if (action === 'gerar-nova-versao') {
      const versionTimestamp = new Date().toLocaleString('pt-BR');
      const sourceLines = radarDraft.sources
        .slice(0, 5)
        .map((source) => `<li><a href="${source.url}" target="_blank" rel="noreferrer">${source.name}</a> — ${source.articleTitle}</li>`)
        .join('');
      setFormData((current) => ({
        ...current,
        content: [
          `<p><strong>Nova versão editorial (${versionTimestamp}):</strong> ${radarDraft.excerpt}</p>`,
          '<p>Esta versão reorganiza o texto mantendo os fatos e as fontes previamente identificadas no Radar de Notícias.</p>',
          '<h2>Fatos principais</h2>',
          `<p>${radarDraft.subtitle}</p>`,
          '<h2>Fontes utilizadas</h2>',
          `<ul>${sourceLines}</ul>`,
          '<h2>Pontos para checagem antes de publicar</h2>',
          '<ul><li>Conferir números e datas.</li><li>Confirmar contrapontos.</li><li>Validar direitos de imagem e créditos.</li></ul>',
        ].join(''),
      }));
      return;
    }

    setFormData((current) => ({
      ...current,
      content: `${current.content}<h2>Contexto adicional</h2><p>Este trecho foi adicionado pelo assistente para ampliar contexto, mantendo os fatos já identificados no Radar e exigindo validação final da redação.</p>`,
    }));
  };

  const buildPestalozziSuggestion = (mode: PestalozziSuggestion['mode']) => {
    const nowLabel = new Date().toLocaleString('pt-BR');
    const currentTitle = formData.title.trim();
    const currentSubtitle = formData.subtitle.trim();
    const currentExcerpt = formData.excerpt.trim();
    const safePlainContent = escapeHtml(plainContent);
    const titleBase = currentTitle || radarDraft?.suggestedTitle || 'Matéria em apuração';
    const nextTitle = titleBase.includes(':') ? titleBase : `${titleBase}: o que está confirmado até agora`;
    const nextSubtitle =
      radarDraft?.subtitle ||
      currentSubtitle ||
      'Análise consolidada com foco em fatos confirmados, contrapontos e próximos desdobramentos.';
    const nextExcerpt =
      radarDraft?.excerpt ||
      currentExcerpt ||
      (plainContent.trim().length > 0
        ? `${plainContent.trim().slice(0, 180)}${plainContent.trim().length > 180 ? '...' : ''}`
        : 'Texto revisado pelo Pestalozzi com estrutura de apuração, contexto e pontos de checagem.');

    const sourceLines =
      radarDraft && radarDraft.sources.length > 0
        ? radarDraft.sources
            .slice(0, 5)
            .map(
              (source) =>
                `<li><a href="${source.url}" target="_blank" rel="noreferrer">${source.name}</a> — ${source.articleTitle}</li>`
            )
            .join('')
        : '<li>Adicionar no mínimo duas fontes primárias antes da publicação final.</li>';

    const generatedContent = [
      `<p><strong>Revisão Pestalozzi (${nowLabel}):</strong> versão analisada, revisada e reescrita em padrão editorial jornalístico.</p>`,
      `<p>${nextExcerpt}</p>`,
      '<h2>Resumo da apuração</h2>',
      `<p>${nextSubtitle}</p>`,
      '<h2>Texto-base revisado</h2>',
      safePlainContent
        ? `<p>${safePlainContent}</p>`
        : '<p>Insira informações adicionais no corpo da matéria para aprofundar a cobertura.</p>',
      mode === 'pesquisa-complementacao' ? '<h2>Fontes para validação</h2>' : '',
      mode === 'pesquisa-complementacao' ? `<ul>${sourceLines}</ul>` : '',
      '<h2>Checklist de revisão final</h2>',
      '<ul><li>Confirmar dados, números e datas em fonte oficial.</li><li>Registrar contraponto das partes citadas.</li><li>Validar direitos de imagem e crédito.</li></ul>',
    ].join('');

    return {
      title: nextTitle,
      subtitle: nextSubtitle,
      excerpt: nextExcerpt,
      content: generatedContent,
      generatedAt: new Date().toISOString(),
      mode,
    } satisfies PestalozziSuggestion;
  };

  const applySuggestionDraft = (draft: { title: string; subtitle: string; excerpt: string; content: string }, mode: PestalozziSuggestion['mode']) => {
    const originalSnapshot: PestalozziSuggestion = {
      title: formData.title,
      subtitle: formData.subtitle,
      excerpt: formData.excerpt,
      content: formData.content,
      generatedAt: new Date().toISOString(),
      mode,
    };
    setPestalozziOriginalSnapshot(originalSnapshot);
    setPestalozziSuggestion({
      ...draft,
      generatedAt: new Date().toISOString(),
      mode,
    });
  };

  const sendPestalozziMessage = async (messageContent: string, mode: PestalozziSuggestion['mode']) => {
    const trimmedMessage = messageContent.trim();
    if (!trimmedMessage) {
      return;
    }
    if (!plainContent.trim()) {
      setPestalozziFeedback('Adicione conteúdo no corpo da matéria para o Pestalozzi processar.');
      return;
    }

    setIsPestalozziProcessing(true);
    setPestalozziChat((current) => [...current, { id: `${Date.now()}-u`, role: 'user', content: trimmedMessage }]);

    try {
      const apiMessages: PestalozziChatMessage[] = [
        ...pestalozziChat.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: 'user', content: trimmedMessage },
      ];
      const response = await fetch('/api/admin/pestalozzi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          context: {
            title: formData.title,
            subtitle: formData.subtitle,
            excerpt: formData.excerpt,
            content: formData.content,
            category: formData.category,
            location: formData.location,
            radarSummary: radarDraft?.excerpt || '',
            radarSources:
              radarDraft?.sources.slice(0, 8).map((source) => ({
                name: source.name,
                url: source.url,
                reliability: source.reliability,
              })) || [],
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        suggestion?: {
          assistantMessage?: string;
          versions?: PestalozziVersion[];
          titleOptions?: string[];
          subtitleOptions?: string[];
        };
      };
      if (!response.ok || !payload.ok || !payload.suggestion) {
        throw new Error(payload.error || 'Não foi possível processar a solicitação no Pestalozzi.');
      }

      const suggestion = payload.suggestion;
      const assistantMessage = suggestion.assistantMessage || 'Preparei sugestões editoriais.';
      const versions = Array.isArray(suggestion.versions) ? suggestion.versions : [];
      const firstVersion = versions[0];

      if (firstVersion) {
        applySuggestionDraft(
          {
            title: firstVersion.title || formData.title,
            subtitle: firstVersion.subtitle || formData.subtitle,
            excerpt: firstVersion.excerpt || formData.excerpt,
            content: firstVersion.content || formData.content,
          },
          mode
        );
      } else {
        const localSuggestion = buildPestalozziSuggestion(mode);
        applySuggestionDraft(localSuggestion, mode);
      }

      setPestalozziVersions(versions);
      if (Array.isArray(suggestion.titleOptions) && suggestion.titleOptions.length > 0) {
        setSelectedTitleOption(suggestion.titleOptions[0]);
      }
      setPestalozziChat((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', content: assistantMessage }]);
      setPestalozziFeedback(
        mode === 'reescrita-editorial'
          ? 'Sugestão pronta: compare o original com a reescrita e aplique somente se aprovar.'
          : 'Sugestão com complementação pronta: revise as fontes e aplique se aprovar.'
      );
    } catch (error) {
      const localSuggestion = buildPestalozziSuggestion(mode);
      applySuggestionDraft(localSuggestion, mode);
      const message = error instanceof Error ? error.message : 'Erro ao acionar o Pestalozzi.';
      setPestalozziChat((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', content: message }]);
      setPestalozziFeedback('Falha na IA avançada. Sugestão local gerada para não interromper o fluxo.');
    } finally {
      setIsPestalozziProcessing(false);
    }
  };

  const runPestalozziFullAssist = () => {
    const prompt =
      'Analise, revise e reescreva esta matéria inteira com padrão jornalístico profissional, preservando 100% dos fatos, e entregue versões completas com título, linha fina, resumo e corpo.';
    void sendPestalozziMessage(prompt, 'reescrita-editorial');
  };

  const applyPestalozziSuggestion = () => {
    if (!pestalozziSuggestion) {
      return;
    }
    setFormData((current) => ({
      ...current,
      title: pestalozziSuggestion.title,
      subtitle: pestalozziSuggestion.subtitle,
      excerpt: pestalozziSuggestion.excerpt,
      content: pestalozziSuggestion.content,
    }));
    setSelectedTitleOption(pestalozziSuggestion.title);
    if (!seoDescription.trim()) {
      setSeoDescription(pestalozziSuggestion.excerpt);
    }
    setJournalistReviewDone(false);
    setEditorialWarning('');
    setPestalozziFeedback('Alterações aplicadas ao editor. Revise e publique somente quando aprovar.');
    setPestalozziSuggestion(null);
    setPestalozziOriginalSnapshot(null);
  };

  const discardPestalozziSuggestion = () => {
    setPestalozziSuggestion(null);
    setPestalozziOriginalSnapshot(null);
    setPestalozziVersions([]);
    setPestalozziFeedback('Sugestão descartada. O texto original foi preservado.');
  };

  const applyPestalozziVersion = (version: PestalozziVersion) => {
    applySuggestionDraft(
      {
        title: version.title || formData.title,
        subtitle: version.subtitle || formData.subtitle,
        excerpt: version.excerpt || formData.excerpt,
        content: version.content || formData.content,
      },
      'reescrita-editorial'
    );
    setPestalozziFeedback('Versão selecionada. Compare com o original e aplique se aprovar.');
  };

  const handleMediaChange = (images: ArticleImage[], videos: ArticleVideo[], primaryImage: string) => {
    setMediaState({ images, videos, primaryImage });
  };

  const handleEditorMediaRegister = async (kind: 'image' | 'video', file: File, caption: string) => {
    const dataUrl = await fileToDataUrl(file);
    const mediaId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (kind === 'image') {
      const nextImage: ArticleImage = {
        id: mediaId,
        url: dataUrl,
        alt: caption.trim() || formData.title || file.name,
        caption: caption.trim(),
        isPrimary: false,
        name: file.name,
        placement: 'inline',
      };

      setMediaState((current) => ({
        images: [...current.images, nextImage],
        videos: current.videos,
        primaryImage: current.primaryImage,
      }));

      return { id: nextImage.id, url: nextImage.url };
    }

    const nextVideo: ArticleVideo = {
      id: mediaId,
      url: dataUrl,
      title: file.name,
      caption: caption.trim(),
      name: file.name,
      type: 'upload',
      placement: 'inline',
    };

    setMediaState((current) => ({
      ...current,
      videos: [...current.videos, nextVideo],
    }));

    return { id: nextVideo.id, url: nextVideo.url };
  };

  const handlePublish = async (
    publishStatus: 'rascunho' | 'agendado' | 'publicado',
    options?: { reviewRequested?: boolean }
  ) => {
    if (isPublishing) {
      return;
    }
    if (!currentUser || !canCreateArticle(currentUser)) {
      window.alert('Sem permissão para criar matérias.');
      return;
    }

    if ((publishStatus === 'publicado' || publishStatus === 'agendado') && !journalistReviewDone) {
      setEditorialWarning('Atenção: conclua a revisão jornalística antes de publicar ou agendar.');
      window.alert('Antes de publicar/agendar, marque a revisão jornalística no checklist editorial.');
      return;
    }
    setEditorialWarning('');

    if (!formData.title.trim()) {
      window.alert('Preencha o título da notícia.');
      return;
    }

    if (!plainContent.trim()) {
      window.alert('Preencha o conteúdo da notícia.');
      return;
    }

    if (publishStatus === 'agendado' && (!scheduledDate || !scheduledTime)) {
      window.alert('Defina a data e o horário do agendamento.');
      return;
    }

    if ((publishStatus === 'publicado' || publishStatus === 'agendado') && !canPublishArticle(currentUser, effectiveAuthor)) {
      window.alert('Seu perfil não pode publicar esta matéria.');
      return;
    }

    setIsPublishing(true);
    let createdArticleId = '';
    let createdArticleHref = '';
    try {
      const createdArticle = addArticle({
        title: formData.title,
        slug: slugifyTitle(slugSuggestion || formData.title) || undefined,
        metaDescription: seoDescription.trim() || undefined,
        subtitle: formData.subtitle,
        category: formData.category,
        excerpt: formData.excerpt || plainContent.slice(0, 180),
        content: formData.content,
        author: effectiveAuthorNames,
        authorUserIds: selectedAuthorIds,
        columnistUserId: formData.columnistUserId || undefined,
        showColumnist: formData.showColumnist,
        image: mediaState.primaryImage,
        images: mediaState.images,
        videos: mediaState.videos,
        featured: formData.featured,
        location: formData.location,
        notificationEnabled: notifyByEmail,
        notificationRecipients: notifyByEmail ? selectedRecipients : [],
        status: publishStatus,
        scheduledDate: publishStatus === 'agendado' ? scheduledDate : undefined,
        scheduledTime: publishStatus === 'agendado' ? scheduledTime : undefined,
      });
      createdArticleId = createdArticle.id;
      createdArticleHref = getArticleHref(createdArticle);
      await persistArticle(createdArticle);
    } catch (error) {
      setIsPublishing(false);
      window.alert(error instanceof Error ? error.message : 'Sem permissão para publicar esta matéria.');
      return;
    }

    if (publishStatus === 'publicado' && notifyByEmail && selectedRecipients.length > 0) {
      try {
        const response = await fetch('/api/admin/article-notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            articleId: createdArticleId,
            articleUrl: `${window.location.origin}${createdArticleHref}`,
            title: formData.title,
            excerpt: formData.excerpt || plainContent.slice(0, 180),
            recipients: selectedRecipients,
            siteUrl: window.location.origin,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          sentCount?: number;
          failureCount?: number;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Falha ao enviar notificações por e-mail.');
        }

        const sentCount = Number(payload.sentCount ?? 0);
        const failureCount = Number(payload.failureCount ?? 0);
        if (failureCount > 0) {
          window.alert(`Notificações enviadas para ${sentCount} pessoa(s). ${failureCount} envio(s) falharam.`);
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Não foi possível disparar os e-mails da notícia.');
      }
    }

    const messages = {
      rascunho: 'Rascunho salvo com sucesso.',
      agendado: `Matéria agendada com sucesso para ${scheduledDate} às ${scheduledTime}.`,
      publicado: 'Matéria publicada com sucesso.',
    };
    if (options?.reviewRequested) {
      messages.rascunho = 'Matéria enviada para revisão editorial com sucesso.';
    }

    setPublishFeedback({
      message: messages[publishStatus],
      status: publishStatus,
      articleId: createdArticleId,
      articleHref: createdArticleHref,
    });
    setIsPublishing(false);
  };

  if (!isLoaded || !currentUser) {
    return <div className="p-6 text-sm text-gray-600">Carregando editor...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 md:flex-row">
      <AdminSidebar />

      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/artigos" className="rounded-lg p-2 transition hover:bg-gray-100">
                <ArrowLeft className="h-6 w-6 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Novo artigo</h1>
               <p className="text-sm text-gray-600">Crie uma notícia completa para o RBN.</p>
              </div>
            </div>
          </div>
          {publishFeedback && (
            <div className="flex flex-col gap-3 bg-green-100 px-8 py-3 text-sm font-semibold text-green-700 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                {publishFeedback.message}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {publishFeedback.status === 'publicado' && (
                  <>
                    <Link
                      href={publishFeedback.articleHref}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#236A88] transition hover:bg-gray-50"
                    >
                      Ver matéria publicada
                    </Link>
                    <Link
                      href="/"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#236A88] transition hover:bg-gray-50"
                    >
                      Ir para página inicial
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => router.push('/admin/artigos')}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#236A88] transition hover:bg-gray-50"
                >
                  Voltar para artigos
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr),360px]">
            <div className="space-y-6">
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Informações principais</h2>
                    <p className="text-sm text-gray-500">Defina título, autoria, categoria e resumo.</p>
                  </div>
                  <div className="rounded-full bg-[#FF796C]/10 px-4 py-2 text-sm font-semibold text-[#FF796C]">{wordCount} palavras</div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Título</label>
                    <input type="text" name="title" value={formData.title} onChange={handleFieldChange} placeholder="Digite o título da notícia" className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Linha fina</label>
                    <input type="text" name="subtitle" value={formData.subtitle} onChange={handleFieldChange} placeholder="Resumo complementar da manchete" className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">Categoria</label>
                      <select name="category" value={formData.category} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none">
                        {availableCategories.map((category) => (
                          <option key={category.id} value={category.slug}>{category.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">Autores</label>
                      <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-gray-300 p-3">
                        {(canViewAllArticles(currentUser) ? users : users.filter((user) => user.id === currentUser.id))
                          .filter((user) => user.status === 'ativo')
                          .map((user) => (
                            <label key={user.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={selectedAuthorIds.includes(user.id)} onChange={(event) => {
                                const ids = event.target.checked ? [...selectedAuthorIds, user.id] : selectedAuthorIds.filter((id) => id !== user.id);
                                const names = users.filter((candidate) => ids.includes(candidate.id)).map(getPublicUserName);
                                setFormData((current) => ({ ...current, authorUserIds: ids, author: names.join(' e ') || current.author }));
                              }} disabled={!canViewAllArticles(currentUser) && user.id !== currentUser.id} />
                              <span>{getPublicUserName(user)} <span className="text-xs text-gray-500">({user.name})</span></span>
                            </label>
                          ))}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">A autoria é vinculada aos IDs dos usuários; o nome é apenas apresentação.</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-red-100 bg-red-50/40 p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={formData.showColumnist} onChange={(event) => setFormData((current) => ({ ...current, showColumnist: event.target.checked, columnistUserId: event.target.checked ? current.columnistUserId : '' }))} /> Exibir bloco do colunista ao final da matéria</label>
                    <select className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={formData.columnistUserId} onChange={(event) => setFormData((current) => ({ ...current, columnistUserId: event.target.value, showColumnist: Boolean(event.target.value) }))}>
                      <option value="">Selecione um colunista</option>
                      {users.filter((user) => user.status === 'ativo' && user.isColumnist).map((user) => <option key={user.id} value={user.id}>{getPublicUserName(user)}</option>)}
                    </select>
                    <p className="mt-2 text-xs text-gray-500">{users.some((user) => user.status === 'ativo' && user.isColumnist) ? 'Ao selecionar um colunista, o bloco será exibido automaticamente no final da matéria. A escolha será salva com o ID real do usuário.' : 'Nenhum colunista ativo cadastrado. Cadastre ou vincule um colunista em Administração → Colunistas.'}</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Resumo</label>
                    <textarea name="excerpt" value={formData.excerpt} onChange={handleFieldChange} rows={4} placeholder="Escreva um resumo para listagens e cards" className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Sugestão de URL (slug)</label>
                    <input
                      type="text"
                      value={slugSuggestion}
                      onChange={(event) => {
                        setSlugManuallyEdited(true);
                        setSlugSuggestion(event.target.value);
                      }}
                      placeholder="exemplo-de-slug-jornalistico"
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">Gerado automaticamente a partir do título. Edite se quiser personalizar a URL da matéria.</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Descrição para SEO</label>
                    <textarea
                      value={seoDescription}
                      onChange={(event) => {
                        setSeoDescriptionManuallyEdited(true);
                        setSeoDescription(event.target.value);
                      }}
                      rows={3}
                      maxLength={160}
                      placeholder="Descrição curta para mecanismos de busca"
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">Gerada automaticamente a partir do resumo. Edite se quiser personalizar (até 160 caracteres).</p>
                  </div>
                  {keywordTags.length > 0 && (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">Palavras-chave sugeridas</label>
                      <div className="flex flex-wrap gap-2">
                        {keywordTags.map((keyword) => (
                          <span key={keyword} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Local de publicação</label>
                    <select name="location" value={formData.location} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none">
                      {brazilianLocations.map((location) => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Conteúdo da notícia</h2>
                    <p className="text-sm text-gray-500">Use a barra para títulos, negrito, listas, citações e links.</p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>{wordCount} palavras</p>
                    <p>{readingTime} min de leitura</p>
                  </div>
                </div>

                <HtmlEditor
                  value={formData.content}
                  onChange={(content) => setFormData((current) => ({ ...current, content }))}
                  minHeight={360}
                  libraryImages={mediaState.images}
                  libraryVideos={mediaState.videos}
                  onRegisterMedia={handleEditorMediaRegister}
                />
              </section>

              <ArticlePreviewPanel
                title={formData.title}
                subtitle={formData.subtitle}
                category={availableCategories.find((category) => category.slug === formData.category)?.name ?? formData.category}
                author={effectiveAuthor}
                content={formData.content}
                images={mediaState.images}
                videos={mediaState.videos}
                location={formData.location}
                publishedAt={new Date().toISOString()}
                lastUpdatedAt={new Date().toISOString()}
              />
            </div>

            <aside className="space-y-6">
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Mídia da matéria</h2>
                  <p className="mt-1 text-sm text-gray-500">Adicione várias imagens e vídeos, escolha a imagem principal, adicione legenda e edite antes de publicar.</p>
                </div>
                <ArticleMediaManager
                  initialImages={mediaState.images}
                  initialVideos={mediaState.videos}
                  initialPrimaryImage={mediaState.primaryImage}
                  title={formData.title || 'A notícia'}
                  onChange={handleMediaChange}
                />
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <Image
                    src="/pestalozzi-mascote.png"
                    alt="Mascote Pestalozzi"
                    width={72}
                    height={72}
                    className="h-16 w-16 rounded-xl border border-gray-200 object-cover"
                  />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">PESTALOZZI</h2>
                    <p className="text-sm font-semibold text-[#991B1B]">Seu parceiro na escrita</p>
                    <p className="mt-1 text-xs text-gray-600">
                      Olá! Sou o Pestalozzi. Posso ajudar você a pesquisar, apurar, revisar e estruturar sua matéria.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setIsPestalozziOpen((current) => {
                      const next = !current;
                      if (next && pestalozziChat.length === 0) {
                        setPestalozziChat([
                          {
                            id: `${Date.now()}-hello`,
                            role: 'assistant',
                            content:
                              'Olá, eu sou o Pestalozzi. Sou seu parceiro na escrita e posso reescrever, revisar, sugerir títulos e refinar sua matéria preservando os fatos.',
                          },
                        ]);
                      }
                      return next;
                    })
                  }
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
                >
                  {isPestalozziOpen ? 'Fechar assistente Pestalozzi' : 'Abrir assistente Pestalozzi'}
                </button>

                {isPestalozziOpen && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-gray-600">Um comando único para analisar, revisar e reescrever a matéria completa.</p>
                    <div className="grid gap-2">
                      <button
                        type="button"
                        onClick={runPestalozziFullAssist}
                        disabled={isPestalozziProcessing}
                        className="w-full rounded-lg border border-[#991B1B]/25 bg-[#fff7f7] px-3 py-2 text-sm font-semibold text-[#991B1B] transition hover:bg-[#ffeaea] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPestalozziProcessing ? 'Pestalozzi está processando...' : 'Analisar, revisar e reescrever'}
                      </button>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="max-h-52 space-y-2 overflow-auto pr-1">
                        {pestalozziChat.length === 0 ? (
                          <p className="text-xs text-gray-500">Converse com o Pestalozzi para refinar a matéria nesta sessão.</p>
                        ) : (
                          pestalozziChat.map((entry) => (
                            <div
                              key={entry.id}
                              className={`rounded-lg px-3 py-2 text-xs ${
                                entry.role === 'user' ? 'bg-gray-100 text-gray-800' : 'bg-[#fff7f7] text-[#7f1d1d]'
                              }`}
                            >
                              <p className="mb-1 font-semibold">{entry.role === 'user' ? 'Você' : 'Pestalozzi'}</p>
                              <p className="whitespace-pre-wrap">{entry.content}</p>
                            </div>
                          ))
                        )}
                      </div>
                      <textarea
                        rows={3}
                        value={pestalozziInput}
                        onChange={(event) => setPestalozziInput(event.target.value)}
                        placeholder="Ex.: Reescreva com mais impacto, sem alterar os fatos."
                        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-[#FF796C] focus:outline-none"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={isPestalozziProcessing || !pestalozziInput.trim()}
                          onClick={() => {
                            const prompt = pestalozziInput;
                            setPestalozziInput('');
                            void sendPestalozziMessage(prompt, 'reescrita-editorial');
                          }}
                          className="rounded-lg bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                    {pestalozziFeedback && <p className="text-xs font-medium text-emerald-700">{pestalozziFeedback}</p>}
                  </div>
                )}
              </section>

              {pestalozziVersions.length > 0 && (
                <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900">Versões sugeridas</h2>
                  <div className="mt-3 grid gap-2">
                    {pestalozziVersions.map((version, index) => (
                      <button
                        key={`${version.label}-${index}`}
                        type="button"
                        onClick={() => applyPestalozziVersion(version)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                      >
                        {version.label || `Versão ${index + 1}`}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {pestalozziSuggestion && (
                <section className="rounded-xl border border-[#991B1B]/20 bg-[#fff7f7] p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900">Sugestão do Pestalozzi</h2>
                  <p className="mt-1 text-xs text-gray-600">
                    Compare com o original. O conteúdo só será aplicado após sua confirmação.
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Texto original</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">{pestalozziOriginalSnapshot?.title || 'Sem título'}</p>
                      <p className="mt-2 text-xs text-gray-700">{pestalozziOriginalSnapshot?.subtitle || 'Sem linha fina'}</p>
                      <p className="mt-2 text-xs text-gray-700">{pestalozziOriginalSnapshot?.excerpt || 'Sem resumo'}</p>
                      <div className="mt-3 max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                        {stripHtml(pestalozziOriginalSnapshot?.content || '') || 'Sem conteúdo'}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#991B1B]/20 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#991B1B]">Sugestão Pestalozzi</p>
                      <label className="mt-2 block text-xs font-semibold text-gray-700">Título sugerido</label>
                      <input
                        type="text"
                        value={pestalozziSuggestion.title}
                        onChange={(event) =>
                          setPestalozziSuggestion((current) => (current ? { ...current, title: event.target.value } : current))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
                      />
                      <label className="mt-3 block text-xs font-semibold text-gray-700">Linha fina sugerida</label>
                      <input
                        type="text"
                        value={pestalozziSuggestion.subtitle}
                        onChange={(event) =>
                          setPestalozziSuggestion((current) => (current ? { ...current, subtitle: event.target.value } : current))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
                      />
                      <label className="mt-3 block text-xs font-semibold text-gray-700">Resumo sugerido</label>
                      <textarea
                        rows={3}
                        value={pestalozziSuggestion.excerpt}
                        onChange={(event) =>
                          setPestalozziSuggestion((current) => (current ? { ...current, excerpt: event.target.value } : current))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
                      />
                      <label className="mt-3 block text-xs font-semibold text-gray-700">Corpo sugerido</label>
                      <textarea
                        rows={8}
                        value={stripHtml(pestalozziSuggestion.content)}
                        onChange={(event) =>
                          setPestalozziSuggestion((current) =>
                            current
                              ? {
                                  ...current,
                                  content: `<p>${escapeHtml(event.target.value).replace(/\n/g, '</p><p>')}</p>`,
                                }
                              : current
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyPestalozziSuggestion}
                      className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]"
                    >
                      Aplicar alterações
                    </button>
                    <button
                      type="button"
                      onClick={discardPestalozziSuggestion}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Descartar
                    </button>
                  </div>
                </section>
              )}

              {radarDraft && (
                <section className="rounded-xl bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-900">Editor inteligente do Radar</h2>
                  <p className="mt-1 text-sm text-gray-500">Primeira versão gerada a partir das fontes do Radar. Revise tudo antes da publicação.</p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Opções de título (3-5)</p>
                      <div className="mt-2 space-y-2">
                        {radarDraft.titleOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => applyTitleOption(option)}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                              (selectedTitleOption || formData.title) === option
                                ? 'border-[#FF796C] bg-[#fff6f4] text-[#9A3412]'
                                : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => runAiAssistAction('melhorar-titulo')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        Melhorar título
                      </button>
                      <button type="button" onClick={() => runAiAssistAction('criar-linha-fina')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        Criar linha fina
                      </button>
                      <button type="button" onClick={() => runAiAssistAction('criar-resumo')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        Criar resumo
                      </button>
                      <button type="button" onClick={() => runAiAssistAction('expandir-contexto')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        Expandir contexto
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => runAiAssistAction('gerar-nova-versao')}
                      className="w-full rounded-lg bg-[#111111] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#2a2a2a]"
                    >
                      Gerar nova versão
                    </button>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Fontes utilizadas</p>
                      <ul className="mt-2 space-y-2">
                        {radarDraft.sources.map((source) => (
                          <li key={`${source.url}-${source.name}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                            <p className="font-semibold text-gray-900">{source.name}</p>
                            <a href={source.url} target="_blank" rel="noreferrer" className="text-[#236A88] underline">
                              {source.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Confiabilidade das informações</p>
                      <ul className="mt-2 space-y-2">
                        {radarDraft.facts.map((fact) => (
                          <li key={fact.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                            <span className="mr-2">
                              {fact.status === 'confirmada' ? '🟢' : fact.status === 'requer-confirmacao' ? '🟡' : '🔴'}
                            </span>
                            {fact.text}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Imagens sugeridas</p>
                      {radarDraft.imageSuggestions.length === 0 ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Imagem não encontrada com licença adequada. Faça upload manual na seção de mídia.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-3">
                          {radarDraft.imageSuggestions.map((image) => (
                            <div key={image.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                              <p className="text-xs font-semibold text-gray-900">{image.origin}</p>
                              <p className="mt-1 text-xs text-gray-600">{image.license} • {image.rights}</p>
                              <p className="mt-1 text-xs text-gray-600">{image.credit}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Checklist editorial</h2>
                <p className="mt-1 text-sm text-gray-500">Validação automática antes da publicação final.</p>
                <div className="mt-4 space-y-2">
                  {editorialChecklist.map((item) => (
                    <div key={item.id} className={`rounded-lg border px-3 py-2 text-sm ${item.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                      <p className="font-semibold">{item.ok ? '🟢' : '🟡'} {item.label}</p>
                      {!item.ok && <p className="mt-1 text-xs">{item.detail}</p>}
                    </div>
                  ))}
                </div>
                {pendingChecklistItems.length > 0 && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    🔴 Atenção: esta matéria possui informações que precisam ser verificadas antes da publicação.
                  </p>
                )}
                <label className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={journalistReviewDone}
                    onChange={(event) => {
                      setJournalistReviewDone(event.target.checked);
                      if (event.target.checked) {
                        setEditorialWarning('');
                      }
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF796C]"
                  />
                  <span className="text-sm text-gray-800">
                    <span className="block font-semibold">Revisado pelo jornalista responsável</span>
                    <span className="text-xs text-gray-600">Obrigatório para publicar/agendar no RBN.</span>
                  </span>
                </label>
                {editorialWarning && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{editorialWarning}</p>
                )}
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Configurações de destaque</h2>
                <label className="mt-4 flex items-start gap-3">
                  <input type="checkbox" name="featured" checked={formData.featured} onChange={handleFieldChange} className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF796C]" />
                  <span>
                    <span className="block font-semibold text-gray-900">Exibir no hero da home</span>
                    <span className="text-sm text-gray-500">Artigos marcados como destaque aparecem no topo da página inicial.</span>
                  </span>
                </label>
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Disparo rápido por e-mail</h2>
                    <p className="text-sm text-gray-500">Escolha para quem enviar a notícia quando publicar.</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    <Users className="h-3.5 w-3.5" />
                    {audienceRecipients.length} cadastrados
                  </div>
                </div>

                <label className="mb-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={notifyByEmail}
                    onChange={(event) => setNotifyByEmail(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF796C]"
                  />
                  <span>
                    <span className="block font-semibold text-gray-900">Enviar notícia por e-mail ao publicar</span>
                    <span className="text-sm text-gray-500">Você pode ativar/desativar esse disparo em cada matéria.</span>
                  </span>
                </label>

                {notifyByEmail && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">Destinatários selecionados: {selectedRecipientIds.length}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRecipientIds(audienceRecipients.map((recipient) => recipient.id))}
                          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Selecionar todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedRecipientIds([])}
                          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {isLoadingAudience ? (
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">Carregando usuários cadastrados...</p>
                    ) : audienceError ? (
                      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{audienceError}</p>
                    ) : audienceRecipients.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-600">Nenhum usuário cadastrado encontrado.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-auto pr-1">
                        {audienceRecipients.map((recipient) => {
                          const checked = selectedRecipientIds.includes(recipient.id);
                          return (
                            <label key={recipient.id} className="flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setSelectedRecipientIds((current) => (current.includes(recipient.id) ? current : [...current, recipient.id]));
                                    return;
                                  }
                                  setSelectedRecipientIds((current) => current.filter((id) => id !== recipient.id));
                                }}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF796C]"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-gray-900">{recipient.name}</span>
                                <span className="block truncate text-xs text-gray-600">{recipient.email}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Publicação</h2>
                <p className="mt-1 text-sm text-gray-500">Confira a prévia da matéria ao lado antes de publicar.</p>
                <div className="mt-4 space-y-3">
                {canPublishArticle(currentUser, effectiveAuthor) ? (
                  <button type="button" disabled={isPublishing} onClick={() => handlePublish('publicado')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-60">
                    <Send className="h-4 w-4" />
                    {isPublishing ? 'Publicando...' : 'Publicar no RBN'}
                  </button>
                ) : null}
                <button type="button" onClick={() => handlePublish('rascunho')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
                  <Save className="h-4 w-4" />
                  Salvar rascunho
                </button>
                <button type="button" onClick={() => handlePublish('rascunho', { reviewRequested: true })} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50">
                  Enviar para revisão
                </button>
                {canPublishArticle(currentUser, effectiveAuthor) ? (
                  <button type="button" onClick={() => setShowScheduleFields((current) => !current)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">
                    <CalendarClock className="h-4 w-4" />
                    Agendar publicação
                  </button>
                ) : null}
              </div>
                {showScheduleFields && (
                  <div className="mt-4 grid gap-3">
                    <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                    <input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                    <button type="button" onClick={() => handlePublish('agendado')} className="rounded-lg bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">
                      Confirmar agendamento
                    </button>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
