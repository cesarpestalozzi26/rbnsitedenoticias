'use client';

import Link from 'next/link';
import { uploadMedia } from '@/app/lib/uploadMedia';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Save, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/app/components/AdminSidebar';
import ArticleMediaManager, { type ArticleImage, type ArticleVideo } from '@/app/components/ArticleMediaManager';
import ArticlePreviewPanel from '@/app/components/ArticlePreviewPanel';
import HtmlEditor from '@/app/components/HtmlEditor';
import { useArticles, fetchFullArticleById, type Article } from '@/app/hooks/useArticles';
import { getArticleHref, slugifyTitle } from '@/app/lib/articleSlug';
import { useToast, ToastContainer } from '@/app/components/Toast';
import { getPublicUserName, useUsers } from '@/app/hooks/useUsers';
import type { PestalozziChatMessage, PestalozziVersion } from '@/app/lib/pestalozzi';
import { defaultManagedCategories, readManagedCategories, type ManagedCategory } from '@/app/lib/managedCategories';
import {
  canDeleteArticle,
  canEditArticle,
  canPublishArticle,
  canViewAllArticles,
  useCurrentAdminUser,
} from '@/app/lib/adminPermissions';

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

type AudienceRecipient = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type PestalozziChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { articles, updateArticle, deleteArticle, isLoaded } = useArticles();
  const { users } = useUsers();
  const { toasts, addToast, removeToast } = useToast();
  const currentUser = useCurrentAdminUser();
  const [drafts, setDrafts] = useState<Record<string, Article>>({});
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
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [audienceRecipients, setAudienceRecipients] = useState<AudienceRecipient[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isLoadingAudience, setIsLoadingAudience] = useState(true);
  const [audienceError, setAudienceError] = useState('');
  const [availableCategories, setAvailableCategories] = useState<ManagedCategory[]>(defaultManagedCategories);
  const [mediaState, setMediaState] = useState<{ images: ArticleImage[]; videos: ArticleVideo[]; primaryImage: string }>({
    images: [],
    videos: [],
    primaryImage: '',
  });
  const [isPestalozziOpen, setIsPestalozziOpen] = useState(false);
  const [isPestalozziProcessing, setIsPestalozziProcessing] = useState(false);
  const [pestalozziInput, setPestalozziInput] = useState('');
  const [pestalozziFeedback, setPestalozziFeedback] = useState('');
  const [pestalozziChat, setPestalozziChat] = useState<PestalozziChatEntry[]>([]);
  const [pestalozziVersions, setPestalozziVersions] = useState<PestalozziVersion[]>([]);
  const [selectedEditorText, setSelectedEditorText] = useState('');
  const [replaceSelectionRequest, setReplaceSelectionRequest] = useState<{ id: number; text: string } | null>(null);

  const article = useMemo(() => articles.find((currentArticle) => currentArticle.id === params?.id), [articles, params?.id]);
  const [fullArticle, setFullArticle] = useState<Article | null>(null);
  const articleWithFullImage = useMemo(
    () => (fullArticle && fullArticle.id === article?.id ? { ...article, ...fullArticle } : article),
    [article, fullArticle]
  );
  const formData = articleWithFullImage ? drafts[articleWithFullImage.id] ?? articleWithFullImage : null;
  const selectedAuthorIds = formData?.authorUserIds ?? [];
  const categoryOptions = useMemo(() => {
    const options = [...availableCategories];
    if (formData?.category && !options.some((category) => category.slug === formData.category)) {
      options.push({
        id: Number.MAX_SAFE_INTEGER,
        name: formData.category,
        slug: formData.category,
        color: '#991B1B',
        articles: 0,
      });
    }
    return options;
  }, [availableCategories, formData]);
  const canAccessArticle = Boolean(article && currentUser && canEditArticle(currentUser, article.author));

  const plainContent = useMemo(() => stripHtml(formData?.content ?? ''), [formData?.content]);
  const wordCount = plainContent.length > 0 ? plainContent.split(' ').length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  useEffect(() => {
    const syncCategories = () => {
      setAvailableCategories(readManagedCategories());
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
    if (!article) {
      return;
    }

    const nextNotifyByEmail = Boolean(article.notificationEnabled ?? article.notificationRecipients?.length);
    const nextSelectedRecipientIds = article.notificationRecipients && article.notificationRecipients.length > 0
      ? article.notificationRecipients.map((recipient) => recipient.id)
      : audienceRecipients.map((recipient) => recipient.id);

    queueMicrotask(() => {
      setNotifyByEmail(nextNotifyByEmail);
      setSelectedRecipientIds(nextSelectedRecipientIds);
    });
  }, [article, audienceRecipients]);

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

  useEffect(() => {
    let isActive = true;
    setFullArticle(null);

    if (!params?.id) {
      return;
    }

    fetchFullArticleById(params.id).then((fetchedArticle) => {
      if (isActive && fetchedArticle) {
        setFullArticle(fetchedArticle);
      }
    });

    return () => {
      isActive = false;
    };
  }, [params?.id]);

  useEffect(() => {
    if (!articleWithFullImage) {
      return;
    }

    queueMicrotask(() => {
      setMediaState({
        images: articleWithFullImage.images ?? [],
        videos: articleWithFullImage.videos ?? [],
        primaryImage: articleWithFullImage.image ?? '',
      });
    });
  }, [articleWithFullImage]);

  const handleFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!formData) {
      return;
    }

    const { name, value, type } = event.target;
    const checked = type === 'checkbox' ? (event.target as HTMLInputElement).checked : undefined;

    setDrafts((current) => ({
      ...current,
      [formData.id]: {
        ...formData,
        [name]: type === 'checkbox' ? checked : value,
      },
    }));
  };

  const handleMediaChange = (images: ArticleImage[], videos: ArticleVideo[], primaryImage: string) => {
    setMediaState({ images, videos, primaryImage });
  };

  const handleEditorMediaRegister = async (kind: 'image' | 'video', file: File, caption: string) => {
    if (!formData) {
      throw new Error('Artigo não disponível para registrar mídia.');
    }

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

  const handleSave = () => {
    if (!formData) {
      return;
    }
    if (formData.status === 'agendado' && (!formData.scheduledDate || !formData.scheduledTime)) {
      addToast('Defina data e horário para agendar a matéria.', 'error', 3000);
      return;
    }

    try {
      updateArticle(formData.id, {
        title: formData.title,
        slug: formData.slug ? slugifyTitle(formData.slug) || undefined : undefined,
        metaDescription: formData.metaDescription?.trim() || undefined,
        subtitle: formData.subtitle,
        category: formData.category,
        excerpt: formData.excerpt || plainContent.slice(0, 180),
        content: formData.content,
        author: users.filter((user) => selectedAuthorIds.includes(user.id)).map((user) => user.name).join(' e ') || formData.author,
        authorUserIds: selectedAuthorIds,
        columnistUserId: formData.columnistUserId || undefined,
        showColumnist: Boolean(formData.showColumnist),
        image: mediaState.primaryImage,
        images: mediaState.images,
        videos: mediaState.videos,
        featured: formData.featured,
        location: formData.location,
        notificationEnabled: notifyByEmail,
        notificationRecipients: notifyByEmail ? audienceRecipients.filter((recipient) => selectedRecipientIds.includes(recipient.id)) : [],
        status: formData.status,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
      });

      if (formData.status === 'publicado' && notifyByEmail && selectedRecipientIds.length > 0) {
        void (async () => {
          const selectedRecipients = audienceRecipients.filter((recipient) => selectedRecipientIds.includes(recipient.id));
          const response = await fetch('/api/admin/article-notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              articleId: formData.id,
              articleUrl: `${window.location.origin}${getArticleHref({ id: formData.id, slug: formData.slug ? slugifyTitle(formData.slug) : undefined })}`,
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
            addToast(`Notificações enviadas para ${sentCount} pessoa(s). ${failureCount} envio(s) falharam.`, 'warning', 4000);
          }
        })().catch((error) => {
          addToast(error instanceof Error ? error.message : 'Não foi possível disparar os e-mails da notícia.', 'error', 3000);
        });
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Sem permissão para salvar este artigo.', 'error', 3000);
      return;
    }

    setDrafts((current) => {
      const next = { ...current };
      delete next[formData.id];
      return next;
    });

    setFeedbackMessage('Alterações salvas com sucesso.');
    addToast('Alterações salvas com sucesso!', 'success', 3000);
    window.setTimeout(() => setFeedbackMessage(''), 2500);
  };

  const handleDelete = () => {
    if (!formData) {
      return;
    }

    const confirmed = window.confirm('Deseja mover este artigo para o lixo?');

    if (!confirmed) {
      return;
    }

    try {
      deleteArticle(formData.id);
      router.push('/admin/artigos');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Sem permissão para excluir este artigo.', 'error', 3000);
    }
  };

  const applyVersionToDraft = (version: { title: string; subtitle: string; excerpt: string; content: string }) => {
    if (!formData) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [formData.id]: {
        ...formData,
        title: version.title || formData.title,
        subtitle: version.subtitle || formData.subtitle,
        excerpt: version.excerpt || formData.excerpt,
        content: version.content || formData.content,
      },
    }));
  };

  const sendPestalozziMessage = async (messageContent: string, mode: 'reescrita-editorial' | 'pesquisa-complementacao') => {
    if (!formData) {
      return;
    }
    const trimmed = messageContent.trim();
    if (!trimmed) {
      return;
    }

    setIsPestalozziProcessing(true);
    setPestalozziChat((current) => [...current, { id: `${Date.now()}-u`, role: 'user', content: trimmed }]);
    try {
      const messages: PestalozziChatMessage[] = [
        ...pestalozziChat.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: 'user', content: trimmed },
      ];
      const response = await fetch('/api/admin/pestalozzi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          context: {
            title: formData.title,
            subtitle: formData.subtitle,
            excerpt: formData.excerpt,
            content: formData.content,
            category: formData.category,
            location: formData.location || 'Brasil',
            radarSummary: '',
            radarSources: [],
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        suggestion?: {
          assistantMessage?: string;
          versions?: PestalozziVersion[];
        };
      };
      if (!response.ok || !payload.ok || !payload.suggestion) {
        throw new Error(payload.error || 'Não foi possível processar no Pestalozzi.');
      }

      const assistantMessage = payload.suggestion.assistantMessage || 'Sugestões prontas para revisão.';
      const versions = Array.isArray(payload.suggestion.versions) ? payload.suggestion.versions : [];
      setPestalozziVersions(versions);
      if (versions[0]) {
        applyVersionToDraft(versions[0]);
      }
      setPestalozziChat((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', content: assistantMessage }]);
      setPestalozziFeedback(
        mode === 'reescrita-editorial'
          ? 'Versões editoriais geradas. Escolha uma versão ou refine por chat.'
          : 'Complementação gerada. Revise as sugestões antes de salvar.'
      );
    } catch (error) {
      const plain = stripHtml(formData.content);
      const fallbackContent = `<p>${escapeHtml(formData.excerpt || 'Revisão editorial aplicada.')}</p><p>${escapeHtml(plain)}</p>`;
      applyVersionToDraft({
        title: formData.title,
        subtitle: formData.subtitle,
        excerpt: formData.excerpt,
        content: fallbackContent,
      });
      const message = error instanceof Error ? error.message : 'Falha ao consultar IA.';
      setPestalozziChat((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', content: message }]);
      setPestalozziFeedback('Falha na IA avançada. Mantive fallback local sem perder seu texto.');
    } finally {
      setIsPestalozziProcessing(false);
    }
  };

  const runPestalozziFullAssist = () => {
    void sendPestalozziMessage(
      'Analise, revise e reescreva esta matéria inteira com padrão jornalístico profissional, preservando 100% dos fatos, e entregue versões completas com título, linha fina, resumo e corpo.',
      'reescrita-editorial'
    );
  };

  const rewriteSelectedText = async () => {
    const selected = selectedEditorText.trim();
    if (!selected) {
      setPestalozziFeedback('Selecione um trecho no editor para reescrever apenas o parágrafo desejado.');
      return;
    }

    if (!formData) {
      return;
    }

    setIsPestalozziProcessing(true);
    const requestPrompt =
      'Reescreva apenas o trecho selecionado com linguagem jornalística profissional, preservando rigorosamente os fatos, sem adicionar explicações extras.';
    setPestalozziChat((current) => [...current, { id: `${Date.now()}-u`, role: 'user', content: requestPrompt }]);

    try {
      const response = await fetch('/api/admin/pestalozzi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: requestPrompt }],
          context: {
            title: formData.title,
            subtitle: formData.subtitle,
            excerpt: formData.excerpt,
            content: selected,
            category: formData.category,
            location: formData.location || 'Brasil',
            radarSummary: '',
            radarSources: [],
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        suggestion?: {
          assistantMessage?: string;
          versions?: PestalozziVersion[];
        };
      };

      if (!response.ok || !payload.ok || !payload.suggestion) {
        throw new Error(payload.error || 'Não foi possível reescrever o trecho selecionado.');
      }

      const firstVersion = Array.isArray(payload.suggestion.versions) ? payload.suggestion.versions[0] : null;
      const rewrittenText = stripHtml(firstVersion?.content || firstVersion?.excerpt || '').trim();
      if (!rewrittenText) {
        throw new Error('A IA não retornou trecho reescrito.');
      }

      setReplaceSelectionRequest({ id: Date.now(), text: rewrittenText });
      setPestalozziChat((current) => [
        ...current,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: payload.suggestion?.assistantMessage || 'Trecho reescrito e pronto para aplicar.',
        },
      ]);
      setPestalozziFeedback('Trecho selecionado reescrito e aplicado no editor.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reescrever trecho selecionado.';
      setPestalozziChat((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', content: message }]);
      setPestalozziFeedback('Não consegui reescrever o trecho agora. Tente novamente.');
    } finally {
      setIsPestalozziProcessing(false);
    }
  };

  if (!isLoaded || !currentUser) {
    return <div className="p-6 text-sm text-gray-600">Carregando artigo...</div>;
  }

  if (!formData) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-100 md:flex-row">
        <AdminSidebar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Artigo não encontrado</h1>
            <p className="mt-2 text-gray-600">O artigo solicitado não existe ou já foi removido.</p>
            <Link href="/admin/artigos" className="mt-6 inline-flex rounded-lg bg-[#111111] px-4 py-2 font-semibold text-white transition hover:bg-[#2a2a2a]">Voltar para artigos</Link>
          </div>
        </main>
      </div>
    );
  }

  if (!canAccessArticle) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-100 md:flex-row">
        <AdminSidebar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Acesso negado</h1>
            <p className="mt-2 text-gray-600">Você só pode editar matérias próprias neste perfil.</p>
            <Link href="/admin/artigos" className="mt-6 inline-flex rounded-lg bg-[#111111] px-4 py-2 font-semibold text-white transition hover:bg-[#2a2a2a]">Voltar para artigos</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 md:flex-row">
      <AdminSidebar />

      <main className="flex-1 overflow-auto">
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white">
          <div className="flex flex-col gap-4 px-8 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/artigos" className="rounded-lg p-2 transition hover:bg-gray-100">
                <ArrowLeft className="h-6 w-6 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Editar artigo</h1>
                <p className="text-sm text-gray-600">Atualize e salve a notícia selecionada.</p>
              </div>
            </div>
            {canDeleteArticle(currentUser, formData.author) && (
              <button type="button" onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">
                <Trash2 className="h-4 w-4" />
                Mover para o lixo
              </button>
            )}
          </div>
          {feedbackMessage && (
            <div className="flex items-center gap-2 bg-green-100 px-8 py-3 text-sm font-semibold text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              {feedbackMessage}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr),360px]">
            <div className="space-y-6">
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Informações principais</h2>
                <div className="mt-5 space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Título</label>
                    <input type="text" name="title" value={formData.title} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Linha fina</label>
                    <input type="text" name="subtitle" value={formData.subtitle} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">Categoria</label>
                      <select name="category" value={formData.category} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none">
                        {categoryOptions.map((category) => (
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
                                setDrafts((current) => ({ ...current, [formData.id]: { ...formData, authorUserIds: ids, author: names.join(' e ') || formData.author } }));
                              }} disabled={!canViewAllArticles(currentUser) && user.id !== currentUser.id} />
                              <span>{getPublicUserName(user)} <span className="text-xs text-gray-500">({user.name})</span></span>
                            </label>
                          ))}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-red-100 bg-red-50/40 p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(formData.showColumnist)} onChange={(event) => setDrafts((current) => ({ ...current, [formData.id]: { ...formData, showColumnist: event.target.checked, columnistUserId: event.target.checked ? formData.columnistUserId : '' } }))} /> Exibir bloco do colunista ao final da matéria</label>
                    <select className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2" value={formData.columnistUserId ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [formData.id]: { ...formData, columnistUserId: event.target.value } }))} disabled={!formData.showColumnist}>
                      <option value="">Selecione um colunista</option>
                      {users.filter((user) => user.status === 'ativo' && user.isColumnist).map((user) => <option key={user.id} value={user.id}>{getPublicUserName(user)}</option>)}
                    </select>
                    <p className="mt-2 text-xs text-gray-500">A seleção é persistida com a matéria pelo ID do usuário colunista.</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Resumo</label>
                    <textarea name="excerpt" value={formData.excerpt} onChange={handleFieldChange} rows={4} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Sugestão de URL (slug)</label>
                    <input
                      type="text"
                      name="slug"
                      value={formData.slug ?? ''}
                      onChange={handleFieldChange}
                      placeholder="exemplo-de-slug-jornalistico"
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">Define a URL pública da matéria. Alterar o slug de uma matéria já publicada muda o link — evite editar depois de divulgada.</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Descrição para SEO</label>
                    <textarea
                      name="metaDescription"
                      value={formData.metaDescription ?? ''}
                      onChange={handleFieldChange}
                      rows={3}
                      maxLength={160}
                      placeholder="Descrição curta para mecanismos de busca"
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">Usada nos mecanismos de busca e ao compartilhar o link (até 160 caracteres). Deixe em branco para usar o resumo automaticamente.</p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Local de publicação</label>
                    <select name="location" value={formData.location ?? brazilianLocations[0]} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none">
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
                    <h2 className="text-lg font-bold text-gray-900">Conteúdo</h2>
                    <p className="text-sm text-gray-500">Edite a notícia com a mesma formatação do cadastro.</p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>{wordCount} palavras</p>
                    <p>{readingTime} min de leitura</p>
                  </div>
                </div>
                <HtmlEditor
                  value={formData.content}
                  onChange={(content) => setDrafts((current) => ({ ...current, [formData.id]: { ...formData, content } }))}
                  minHeight={360}
                  libraryImages={mediaState.images}
                  libraryVideos={mediaState.videos}
                  onRegisterMedia={handleEditorMediaRegister}
                  onSelectionTextChange={setSelectedEditorText}
                  replaceSelectionRequest={replaceSelectionRequest}
                />
              </section>

              <ArticlePreviewPanel
                title={formData.title}
                subtitle={formData.subtitle}
                category={categoryOptions.find((category) => category.slug === formData.category)?.name ?? formData.category}
                author={formData.author}
                content={formData.content}
                images={mediaState.images}
                videos={mediaState.videos}
                location={formData.location}
                publishedAt={formData.publishedAt ?? formData.createdAt}
                lastUpdatedAt={formData.lastUpdatedAt ?? formData.updatedAt}
              />
            </div>

            <aside className="space-y-6">
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Mídia da matéria</h2>
                  <p className="mt-1 text-sm text-gray-500">Atualize imagens, vídeos e a imagem principal sem sair do painel.</p>
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
                <h2 className="text-lg font-bold text-gray-900">PESTALOZZI</h2>
                <p className="mt-1 text-sm font-semibold text-[#991B1B]">Seu parceiro na escrita</p>
                <p className="mt-1 text-xs text-gray-600">
                  Converse com a IA para revisar, reescrever e refinar a matéria sem perder o controle editorial.
                </p>

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
                              'Olá, eu sou o Pestalozzi. Posso reescrever, revisar e melhorar trechos específicos preservando os fatos da matéria.',
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
                        className="rounded-lg border border-[#991B1B]/25 bg-[#fff7f7] px-3 py-2 text-sm font-semibold text-[#991B1B] hover:bg-[#ffeaea] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPestalozziProcessing ? 'Pestalozzi está processando...' : 'Analisar, revisar e reescrever'}
                      </button>
                      <button
                        type="button"
                        onClick={rewriteSelectedText}
                        disabled={isPestalozziProcessing}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Reescrever trecho selecionado
                      </button>
                    </div>

                    <p className="text-xs text-gray-500">
                      {selectedEditorText.trim()
                        ? `Trecho selecionado: "${selectedEditorText.trim().slice(0, 90)}${selectedEditorText.trim().length > 90 ? '...' : ''}"`
                        : 'Selecione um trecho no editor para reescrever apenas aquela parte.'}
                    </p>

                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="max-h-52 space-y-2 overflow-auto pr-1">
                        {pestalozziChat.map((entry) => (
                          <div
                            key={entry.id}
                            className={`rounded-lg px-3 py-2 text-xs ${
                              entry.role === 'user' ? 'bg-gray-100 text-gray-800' : 'bg-[#fff7f7] text-[#7f1d1d]'
                            }`}
                          >
                            <p className="mb-1 font-semibold">{entry.role === 'user' ? 'Você' : 'Pestalozzi'}</p>
                            <p className="whitespace-pre-wrap">{entry.content}</p>
                          </div>
                        ))}
                      </div>
                      <textarea
                        rows={3}
                        value={pestalozziInput}
                        onChange={(event) => setPestalozziInput(event.target.value)}
                        placeholder="Ex.: deixe o lead mais forte e objetivo."
                        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-[#FF796C] focus:outline-none"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const message = pestalozziInput;
                            setPestalozziInput('');
                            void sendPestalozziMessage(message, 'reescrita-editorial');
                          }}
                          disabled={isPestalozziProcessing || !pestalozziInput.trim()}
                          className="rounded-lg bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPestalozziProcessing ? 'Processando...' : 'Enviar'}
                        </button>
                      </div>
                    </div>

                    {pestalozziVersions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Versões sugeridas</p>
                        {pestalozziVersions.map((version, index) => (
                          <button
                            key={`${version.label}-${index}`}
                            type="button"
                            onClick={() => applyVersionToDraft(version)}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            {version.label || `Versão ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {pestalozziFeedback && <p className="text-xs font-medium text-emerald-700">{pestalozziFeedback}</p>}
                  </div>
                )}
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Publicação</h2>
                <div className="mt-4 space-y-4">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="featured" checked={formData.featured} onChange={handleFieldChange} className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF796C]" />
                    <span>
                      <span className="block font-semibold text-gray-900">Exibir no hero</span>
                      <span className="text-sm text-gray-500">Use para destacar a notícia na página inicial.</span>
                    </span>
                  </label>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleFieldChange}
                      disabled={!canPublishArticle(currentUser, formData.author)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                      <option value="rascunho">Rascunho</option>
                      <option value="agendado">Agendado</option>
                      <option value="publicado">Publicado</option>
                    </select>
                  </div>
                  {formData.status === 'agendado' && (
                    <div className="grid gap-3">
                      <input type="date" name="scheduledDate" value={formData.scheduledDate ?? ''} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                      <input type="time" name="scheduledTime" value={formData.scheduledTime ?? ''} onChange={handleFieldChange} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-[#FF796C] focus:outline-none" />
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Disparo rápido por e-mail</h2>
                    <p className="text-sm text-gray-500">Escolha para quem enviar a notícia ao publicar.</p>
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
                    <span className="text-sm text-gray-500">Você pode ativar/desativar esse disparo nesta matéria.</span>
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

              <button type="button" onClick={handleSave} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700">
                <Save className="h-4 w-4" />
                Salvar edição
              </button>
            </aside>
          </div>
        </div>

        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </main>
    </div>
  );
}
