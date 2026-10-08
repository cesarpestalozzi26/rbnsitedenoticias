'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Facebook, MessageCircle, Share2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import ArticleBodyContent from '@/app/components/ArticleBodyContent';
import Sidebar from '@/app/components/Sidebar';
import { featuredArticle as fallbackFeaturedArticle } from '@/app/data/mockData';
import { getCategoryDisplayName } from '@/app/lib/categoryLabels';
import { readCurrentRbnUser, type RbnAccount } from '@/app/lib/rbnAuth';
import { formatDate } from '@/app/utils/dateUtils';
import { formatArticleAuthor } from '@/app/lib/articleAuthor';

type ArticleReply = {
  id: string;
  author: string;
  text: string;
  date: string;
  createdAt: string;
};

type MediaImageItem = {
  id: string;
  url: string;
  alt?: string;
  caption?: string;
  placement?: string;
  isPrimary?: boolean;
};

type MediaVideoItem = {
  id: string;
  url: string;
  placement?: string;
  title?: string;
};

type ArticleComment = {
  id: string;
  articleId: string;
  author: string;
  text: string;
  date: string;
  createdAt: string;
  location?: string;
  likes: number;
  replies: ArticleReply[];
};

type Columnist = {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  professionalInfo: string;
  columnistSlug: string;
};

function normalizeComment(comment: any): ArticleComment | null {
  if (!comment || typeof comment !== 'object') {
    return null;
  }

  const id = typeof comment.id === 'string' ? comment.id : '';
  const articleId = typeof comment.articleId === 'string' ? comment.articleId : '';
  const author = typeof comment.author === 'string' ? comment.author.trim() : '';
  const text = typeof comment.text === 'string' ? comment.text.trim() : '';

  if (!id || !articleId || !author || !text) {
    return null;
  }

  const normalizedReplies: ArticleReply[] = Array.isArray(comment.replies)
    ? comment.replies.map((reply: any): ArticleReply => ({
        id: typeof reply.id === 'string' ? reply.id : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        author: typeof reply.author === 'string' ? reply.author : '',
        text: typeof reply.text === 'string' ? reply.text : '',
        date: typeof reply.date === 'string' ? reply.date : new Date(reply.createdAt || Date.now()).toLocaleDateString('pt-BR'),
        createdAt: typeof reply.createdAt === 'string' ? reply.createdAt : new Date().toISOString(),
      })).filter((reply: ArticleReply) => reply.author && reply.text)
    : [];

  return {
    id,
    articleId,
    author,
    text,
    date: typeof comment.date === 'string' && comment.date ? comment.date : new Date(comment.createdAt || Date.now()).toLocaleDateString('pt-BR'),
    createdAt: typeof comment.createdAt === 'string' && comment.createdAt ? comment.createdAt : new Date().toISOString(),
    location: typeof comment.location === 'string' ? comment.location : '',
    likes: typeof comment.likes === 'number' ? comment.likes : 0,
    replies: normalizedReplies,
  };
}

function stripHtml(content: string) {
  return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeArticleId(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function idsMatch(left: unknown, right: unknown) {
  const leftNormalized = normalizeArticleId(left);
  const rightNormalized = normalizeArticleId(right);

  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  return leftNormalized === rightNormalized || String(Number(leftNormalized)) === String(Number(rightNormalized));
}

function resolveArticleMediaUrl(value: unknown, articleId: string) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const normalizedValue = value.trim();
  return normalizedValue.startsWith('data:')
    ? `/api/article-image?id=${encodeURIComponent(articleId)}`
    : normalizedValue;
}

function normalizeLoadedArticle(article: any, articleId: string) {
  if (!article || typeof article !== 'object') {
    return article;
  }

  const images = Array.isArray(article.images)
    ? article.images.map((image: MediaImageItem) => ({
        ...image,
        url: resolveArticleMediaUrl(image?.url, articleId),
      }))
    : article.images;

  return {
    ...article,
    image: resolveArticleMediaUrl(article.image, articleId),
    images,
  };
}

function formatArticleMeta(date: Date) {
  const day = new Intl.DateTimeFormat('pt-BR', { day: 'numeric' }).format(date);
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  const year = new Intl.DateTimeFormat('pt-BR', { year: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${day} de ${month} de ${year} às ${time}`;
}

function formatUpdatedRelative(date: Date) {
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));

  if (diffMinutes < 60) {
    return `há ${diffMinutes === 1 ? '1 minuto' : `${diffMinutes} minutos`}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `há ${diffHours === 1 ? 'uma hora' : `${diffHours} horas`}`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `há ${diffDays === 1 ? 'um dia' : `${diffDays} dias`}`;
}

const OFFICIAL_SITE_URL = 'https://www.rbnbrasil.com.br';

export default function ArticlePageClient() {
  const params = useParams<{ id: string }>();
  const [articleRecord, setArticleRecord] = useState<any | null>(null);
  const [commentsByArticle, setCommentsByArticle] = useState<Record<string, ArticleComment[]>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [currentRbnUser, setCurrentRbnUser] = useState<RbnAccount | null>(null);
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<string | null>(null);
  const [replyAuthor, setReplyAuthor] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState('');
  const [shareFeedback, setShareFeedback] = useState('');
  const [columnist, setColumnist] = useState<Columnist | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadArticle = async () => {
      if (!params?.id) {
        setArticleRecord(null);
        setIsLoaded(true);
        return;
      }

      try {
        const response = await fetch(`/api/articles?id=${encodeURIComponent(params.id)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const rows = (await response.json()) as Array<{ id?: string; payload?: any }>;
        // A API já resolve a matéria pelo ID numérico OU pelo slug amigável
        // (payload.slug), então basta confiar na resposta do servidor. Ainda
        // validamos por ID quando possível; se nada bater (ex.: parâmetro é
        // um slug), usamos a primeira linha retornada, pois o servidor só
        // devolve a matéria correspondente para essa busca.
        const idMatch = rows.find((row) => {
          const candidates = [row.id, row.payload?.id];
          return candidates.some((candidate) => idsMatch(candidate, params.id));
        });
        const slugMatch = rows.find((row) => String(row.payload?.slug ?? '').trim() === params.id);
        const match = idMatch ?? slugMatch ?? rows[0];
        const nextArticle = normalizeLoadedArticle(match?.payload ?? match ?? null, String(match?.id ?? params.id));

        if (isActive) {
          setArticleRecord(nextArticle);
        }
      } catch (error) {
        console.warn('Erro ao carregar a matéria da página:', error);
        if (isActive) {
          setArticleRecord(null);
        }
      } finally {
        if (isActive) {
          setIsLoaded(true);
        }
      }
    };

    setIsLoaded(false);
    void loadArticle();

    return () => {
      isActive = false;
    };
  }, [params?.id]);

  useEffect(() => {
    if (!articleRecord?.showColumnist || !articleRecord?.columnistUserId) {
      setColumnist(null);
      return;
    }
    fetch(`/api/columnists?id=${encodeURIComponent(articleRecord.columnistUserId)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: Columnist[]) => setColumnist(data[0] ?? null))
      .catch(() => setColumnist(null));
  }, [articleRecord?.columnistUserId, articleRecord?.showColumnist]);

  useEffect(() => {
    if (!params?.id) {
      setCommentsByArticle({});
      return;
    }

    let isActive = true;

    const loadComments = async () => {
      try {
        const response = await fetch(`/api/comments?articleId=${encodeURIComponent(params.id)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const rows = (await response.json()) as Array<{ payload?: any }>;
        const comments = rows
          .map((row) => normalizeComment(row.payload))
          .filter((comment): comment is ArticleComment => comment !== null);

        if (isActive) {
          setCommentsByArticle({ [params.id]: comments });
        }
      } catch (error) {
        console.warn('Erro ao carregar comentários da matéria:', error);
        if (isActive) {
          setCommentsByArticle({ [params.id]: [] });
        }
      }
    };

    void loadComments();
    return () => {
      isActive = false;
    };
  }, [params?.id]);

  const article = articleRecord
    ? {
        ...articleRecord,
        plainContent: stripHtml(articleRecord.content || ''),
        image: articleRecord.image || fallbackFeaturedArticle.image,
      }
    : null;

  useEffect(() => {
    if (!isLoaded || !article?.id || typeof window === 'undefined') {
      return;
    }

    const viewKey = `rbn_article_viewed_${article.id}`;
    const hasViewed = sessionStorage.getItem(viewKey) === '1';
    if (hasViewed) {
      return;
    }

    sessionStorage.setItem(viewKey, '1');
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        eventType: 'article_view',
        articleId: article.id,
        category: article.category,
        authorUserIds: article.authorUserIds ?? [],
        occurredAt: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch((error) => console.warn('Falha ao registrar visualização:', error));
  }, [article?.id, isLoaded]);

  const recordShare = (articleId?: string) => {
    if (!articleId || typeof window === 'undefined') {
      return;
    }

    const shareKey = `rbn_article_shared_${articleId}`;
    if (sessionStorage.getItem(shareKey) === '1') {
      return;
    }

    sessionStorage.setItem(shareKey, '1');
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), eventType: 'article_share', articleId, occurredAt: new Date().toISOString() }),
      keepalive: true,
    }).catch((error) => console.warn('Falha ao registrar compartilhamento:', error));
  };

  const relatedArticles: Array<{ id: string; title: string; updatedAt: string; category: string; image?: string }> = [];

  const isLoadingArticle = !isLoaded;

  const mediaImages: MediaImageItem[] = Array.isArray(article?.images) && article.images.length > 0
    ? article.images
    : article?.image
      ? [{ id: 'cover', url: article.image, alt: article?.title || 'Imagem da matéria', caption: '', isPrimary: true, placement: 'full' }]
      : [];

  const articleVideos: MediaVideoItem[] = Array.isArray(article?.videos) ? article.videos : [];
  const comments = article?.id ? commentsByArticle[article.id] ?? [] : [];

  const publicationDate = article?.publishedAt ? new Date(article.publishedAt) : new Date(article?.createdAt ?? Date.now());
  const updatedDate = article?.lastUpdatedAt ? new Date(article.lastUpdatedAt) : new Date(article?.updatedAt ?? article?.createdAt ?? Date.now());
  const readingTime = article ? Math.max(1, Math.ceil((article.plainContent.split(' ').filter(Boolean).length || 0) / 200)) : fallbackFeaturedArticle.readingTime;

  const shareTitle = article?.title || fallbackFeaturedArticle.title;
  const shareText = article?.subtitle || 'Leia esta notícia no PORTAL IWP';
  const shareVersion = article?.updatedAt || article?.lastUpdatedAt || article?.publishedAt;
  const shareUrl = typeof window !== 'undefined'
    ? `${OFFICIAL_SITE_URL}/artigo/${params?.id ?? ''}${shareVersion ? `?v=${encodeURIComponent(shareVersion)}` : ''}`
    : '';
  const sharePreviewText = `${shareTitle} — ${shareUrl}`;

  const openShareLink = (target: 'whatsapp' | 'telegram' | 'twitter' | 'facebook' | 'linkedin' | 'email') => {
    const url = shareUrl || window.location.href;
    const shareMessage = `${shareTitle} — ${shareText}`;
    const encodedUrl = encodeURIComponent(url);
    const encodedMessage = encodeURIComponent(shareMessage);
    const encodedPreviewText = encodeURIComponent(sharePreviewText);

    const shareLinks: Record<typeof target, string> = {
      whatsapp: `https://wa.me/?text=${encodedPreviewText}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedPreviewText}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedPreviewText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      email: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareTitle}\n\n${shareText}\n\n${url}`)}`,
    };

    if (article?.id) {
      recordShare(article.id);
    }
    window.open(shareLinks[target], '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    const url = shareUrl || window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      recordShare(article?.id);
      setShareFeedback('Link copiado para a área de transferência.');
    } catch {
      window.prompt('Copie o link da notícia:', url);
      recordShare(article?.id);
      setShareFeedback('Use o campo acima para copiar o link manualmente.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl || window.location.href,
        });
        recordShare(article?.id);
        setShareFeedback('Matéria compartilhada com sucesso.');
        return;
      } catch {
        setShareFeedback('Compartilhamento cancelado.');
      }
    }

    await handleCopyLink();
  };

  const addComment = (articleId: string, payload: { author: string; text: string; location?: string }) => {
    const comment: ArticleComment = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      articleId,
      author: payload.author.trim(),
      text: payload.text.trim(),
      date: new Date().toLocaleDateString('pt-BR'),
      createdAt: new Date().toISOString(),
      location: payload.location?.trim() || '',
      likes: 0,
      replies: [],
    };

    setCommentsByArticle((current) => ({
      ...current,
      [articleId]: [comment, ...(current[articleId] ?? [])],
    }));

    void fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    }).catch(() => undefined);
  };

  const deleteComment = (articleId: string, commentId: string) => {
    setCommentsByArticle((current) => {
      const nextList = (current[articleId] ?? []).filter((comment) => comment.id !== commentId);
      return {
        ...current,
        [articleId]: nextList,
      };
    });

    void fetch('/api/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: commentId }),
    }).catch(() => undefined);
  };

  const likeComment = (articleId: string, commentId: string) => {
    setCommentsByArticle((current) => ({
      ...current,
      [articleId]: (current[articleId] ?? []).map((comment) =>
        comment.id === commentId ? { ...comment, likes: (comment.likes ?? 0) + 1 } : comment
      ),
    }));

    const currentComment = (commentsByArticle[articleId] ?? []).find((comment) => comment.id === commentId);
    if (currentComment) {
      const nextComment = { ...currentComment, likes: (currentComment.likes ?? 0) + 1 };
      void fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: nextComment }),
      }).catch(() => undefined);
    }
  };

  const replyToComment = (articleId: string, commentId: string, payload: { author: string; text: string }) => {
    const reply = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      author: payload.author.trim(),
      text: payload.text.trim(),
      date: new Date().toLocaleDateString('pt-BR'),
      createdAt: new Date().toISOString(),
    };

    setCommentsByArticle((current) => ({
      ...current,
      [articleId]: (current[articleId] ?? []).map((comment) =>
        comment.id === commentId
          ? { ...comment, replies: [reply, ...(comment.replies ?? [])] }
          : comment
      ),
    }));

    const currentComment = (commentsByArticle[articleId] ?? []).find((comment) => comment.id === commentId);
    if (currentComment) {
      const nextComment = { ...currentComment, replies: [reply, ...(currentComment.replies ?? [])] };
      void fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: nextComment }),
      }).catch(() => undefined);
    }
  };

  const handleAddComment = () => {
    const trimmedComment = newComment.trim();

    if (!currentRbnUser) {
      setCommentError('Entre com a sua Conta RBN para comentar.');
      return;
    }

    if (!trimmedComment) {
      setCommentError('Escreva uma mensagem antes de publicar.');
      return;
    }

    if (!article?.id) {
      setCommentError('Não foi possível associar o comentário a esta matéria.');
      return;
    }

    addComment(article.id, {
      author: currentRbnUser.name,
      text: trimmedComment,
      location: '',
    });
    setNewComment('');
    setCommentError('');
    setShowCommentForm(false);
  };

  const handleDeleteComment = (commentId: string) => {
    if (!article?.id) {
      return;
    }
    deleteComment(article.id, commentId);
  };

  const handleLikeComment = (commentId: string) => {
    if (!article?.id) {
      return;
    }
    likeComment(article.id, commentId);
  };

  const handleAddReply = (commentId: string) => {
    const trimmedAuthor = replyAuthor.trim();
    const trimmedReply = replyText.trim();

    if (!trimmedAuthor) {
      setReplyError('Informe seu nome para responder.');
      return;
    }

    if (!trimmedReply) {
      setReplyError('Escreva uma resposta antes de publicar.');
      return;
    }

    if (!article?.id) {
      setReplyError('Não foi possível associar a resposta a esta matéria.');
      return;
    }

    replyToComment(article.id, commentId, { author: trimmedAuthor, text: trimmedReply });
    setReplyAuthor('');
    setReplyText('');
    setReplyError('');
    setActiveReplyCommentId(null);
  };

  useEffect(() => {
    const syncRbnUser = () => setCurrentRbnUser(readCurrentRbnUser());
    syncRbnUser();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', syncRbnUser);
      return () => window.removeEventListener('storage', syncRbnUser);
    }
  }, []);

  if (isLoadingArticle) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-7xl bg-white px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-10 w-3/4 rounded bg-gray-200" />
          <div className="h-6 w-1/2 rounded bg-gray-200" />
          <div className="h-80 rounded-xl bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-3/4 rounded bg-gray-200" />
        </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-white px-4 py-16 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#991B1B]">Notícia não encontrada</p>
        <h1 className="mb-4 text-3xl font-bold text-gray-900">Essa matéria não está disponível no momento.</h1>
        <p className="mb-8 text-gray-600">A notícia pode ter sido removida, estar em revisão ou ainda não foi publicada para o público.</p>
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg bg-[#991B1B] px-5 py-3 font-semibold text-white transition hover:bg-[#7F1D1D]">
          <ArrowLeft className="h-4 w-4" />
          Voltar para a home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 font-semibold text-[#991B1B] transition hover:text-[#7F1D1D]">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <article>
            <div className="mb-6">
              <span className="inline-block rounded-full bg-[#991B1B]/10 px-3 py-1 text-xs font-semibold text-[#991B1B]">
                {getCategoryDisplayName(article.category)}
              </span>
            </div>

            <h1 className="mb-4 text-4xl font-bold leading-tight text-gray-900 md:text-5xl">
              {article.title}
            </h1>

            {article.subtitle && (
              <p className="mb-6 text-xl leading-relaxed text-gray-600">{article.subtitle}</p>
            )}

            <div className="flex flex-col gap-4 border-y border-gray-200 py-6 md:flex-row md:items-center md:justify-between md:gap-6">
              <div>
                <p className="font-semibold text-gray-900">{formatArticleAuthor(article ? article.author : fallbackFeaturedArticle.author)}</p>
                <div className="text-sm text-gray-500">
                  <p>
                    Publicado em {formatArticleMeta(publicationDate)}
                    {article?.lastUpdatedAt && article.lastUpdatedAt !== article.publishedAt &&(
                      <span> - Atualizado {formatUpdatedRelative(updatedDate)}</span>
                    )}
                  </p>
                  {article?.location && <p className="mt-1">{article.location}</p>}
                </div>
              </div>
            <div className="py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-gray-500">Compartilhar</p>
                {shareFeedback && <span className="text-[8px] text-emerald-700">{shareFeedback}</span>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  aria-label="Compartilhar no Facebook"
                  onClick={() => openShareLink('facebook')}
                  className="flex h-9 items-center justify-center rounded-lg bg-[#1877F2] text-white shadow-sm transition hover:brightness-110"
                >
                  <Facebook className="h-4 w-4 fill-current" />
                </button>
                <button
                  type="button"
                  aria-label="Compartilhar no WhatsApp"
                  onClick={() => openShareLink('whatsapp')}
                  className="flex h-9 items-center justify-center rounded-lg bg-[#17BD5A] text-white shadow-sm transition hover:brightness-110"
                >
                  <MessageCircle className="h-4 w-4 fill-current" />
                </button>
                <button
                  type="button"
                  aria-label="Compartilhar por link"
                  onClick={handleShare}
                  className="flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-[#F3F4F6] text-gray-800 shadow-sm transition hover:bg-gray-200"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

            {mediaImages.filter((image: MediaImageItem) => image.placement !== 'inline').length > 0 && (
              <div className="mt-6 mb-5 grid gap-5 md:mb-6">
                {mediaImages.filter((image: MediaImageItem) => image.placement !== 'inline').map((image: MediaImageItem) => (
                  <figure key={image.id} className="m-0">
                    <img src={image.url} alt={image.alt || article?.title || 'Imagem da matéria'} className="block h-auto w-full rounded-2xl shadow-sm" />
                    {image.caption && (
                      <figcaption className="mt-2 px-1 text-sm leading-relaxed text-gray-600">
                        {image.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}

            {articleVideos.filter((video: MediaVideoItem) => video.placement !== 'inline').length > 0 && (
              <div className="my-8 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                {articleVideos.filter((video: MediaVideoItem) => video.placement !== 'inline').map((video: MediaVideoItem) => (
                  <div key={video.id} className="overflow-hidden rounded-xl bg-black">
                    <video controls className="w-full">
                      <source src={video.url} />
                    </video>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-12 max-w-none">
              {article ? (
                <ArticleBodyContent content={article.content} images={article.images ?? []} videos={article.videos ?? []} />
              ) : (
                <p className="leading-relaxed text-gray-700">{fallbackFeaturedArticle.content}</p>
              )}
            </div>

            {columnist && (
              <section className="mb-12 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#991B1B]">Colunista</p>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link href={`/colunistas/${encodeURIComponent(columnist.columnistSlug || columnist.id)}`}>
                    <img src={columnist.avatar || '/logo-oficial.png'} alt={columnist.name} className="h-20 w-20 rounded-full object-cover" />
                  </Link>
                  <div>
                    <Link href={`/colunistas/${encodeURIComponent(columnist.columnistSlug || columnist.id)}`} className="text-xl font-bold text-gray-900 hover:text-[#991B1B]">{columnist.name}</Link>
                    {columnist.professionalInfo && <p className="mt-1 text-sm font-medium text-gray-600">{columnist.professionalInfo}</p>}
                    {columnist.bio && <p className="mt-2 text-sm leading-relaxed text-gray-600">{columnist.bio}</p>}
                    <Link href={`/colunistas/${encodeURIComponent(columnist.columnistSlug || columnist.id)}`} className="mt-3 inline-block text-sm font-semibold text-[#991B1B] hover:underline">Ver perfil e todas as matérias</Link>
                  </div>
                </div>
              </section>
            )}

            <div className="mt-12 border-t border-gray-200 pt-8">
              <h3 className="mb-6 text-2xl font-bold text-gray-900">Notícias relacionadas</h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {relatedArticles.map((relatedArticle) => (
                  <Link key={relatedArticle.id} href={`/artigo/${relatedArticle.id}`} className="group overflow-hidden rounded-lg border border-gray-200 transition hover:shadow-lg">
                    <div className="h-40 overflow-hidden bg-gray-200">
                      <img src={relatedArticle.image || fallbackFeaturedArticle.image} alt={relatedArticle.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                    </div>
                    <div className="p-4">
                      <h4 className="line-clamp-2 font-bold text-gray-900 transition group-hover:text-[#991B1B]">{relatedArticle.title}</h4>
                      <p className="mt-2 text-xs text-gray-500">{formatDate(new Date(relatedArticle.updatedAt))}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-12 border-t border-gray-200 pt-8">
              <div className="mb-6 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#FF796C]" />
                <h3 className="text-lg font-bold text-gray-900 md:text-xl">Comentários ({comments.length})</h3>
              </div>

              {!showCommentForm ? (
                <button
                  onClick={() => setShowCommentForm(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-[#991B1B] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#7F1D1D] focus:outline-none focus:ring-2 focus:ring-[#991B1B]/40"
                >
                  <Send className="h-3.5 w-3.5" />
                  Adicionar comentário
                </button>
              ) : (
                <div className="mb-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">Adicionar comentário</p>
                    <button
                      onClick={() => {
                        setShowCommentForm(false);
                        setCommentError('');
                      }}
                      className="text-sm font-semibold text-gray-600 transition hover:text-gray-900"
                    >
                      Fechar
                    </button>
                  </div>

                  {!currentRbnUser ? (
                    <div className="rounded-xl border border-[#991B1B]/15 bg-[#fff9f8] p-4">
                      <p className="text-sm font-semibold text-gray-900">Entre com a sua Conta RBN para comentar.</p>
                      <p className="mt-2 text-sm text-gray-600">Faça login ou crie sua conta antes de participar da conversa.</p>
                      <Link
                        href="/conta-rbn"
                        className="mt-4 inline-flex items-center justify-center rounded-full bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7F1D1D]"
                      >
                        Entrar com Conta RBN
                      </Link>
                    </div>
                  ) : (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-white px-4 py-3">
                      <p className="text-sm font-medium text-green-800">Conectado como <span className="font-bold">{currentRbnUser.name}</span></p>
                    </div>
                  )}

                  {currentRbnUser && (
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          handleAddComment();
                        }
                      }}
                      placeholder="Escreva seu comentário aqui..."
                      rows={4}
                      className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-[#111111] focus:outline-none"
                    />
                  )}

                  {commentError && <p className="mt-3 text-sm text-[#991B1B]">{commentError}</p>}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleAddComment}
                      className="inline-flex items-center gap-2 rounded-md bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7F1D1D] focus:outline-none focus:ring-2 focus:ring-[#991B1B]/40"
                    >
                      <Send className="h-4 w-4" />
                      Publicar
                    </button>
                    <button
                      onClick={() => {
                        setShowCommentForm(false);
                        setCommentError('');
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-gray-700 font-semibold transition hover:bg-white"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-8 space-y-4">
                {comments.length > 0 ? (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{comment.author}</p>
                          <p className="text-xs text-gray-500">{comment.date}</p>
                          {comment.location && <p className="mt-1 text-[11px] text-gray-500">{comment.location}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="rounded border border-[#991B1B]/20 px-2 py-1 text-[10px] font-semibold text-[#991B1B] transition hover:bg-[#991B1B]/5"
                        >
                          Excluir
                        </button>
                      </div>
                      <p className="mt-2 text-gray-700">{comment.text}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleLikeComment(comment.id)}
                          className="text-xs font-semibold text-gray-600 transition hover:text-[#991B1B]"
                        >
                          Curtir ({comment.likes ?? 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReplyCommentId((current) => (current === comment.id ? null : comment.id));
                            setReplyError('');
                          }}
                          className="text-xs font-semibold text-gray-600 transition hover:text-[#991B1B]"
                        >
                          Responder
                        </button>
                      </div>

                      {activeReplyCommentId === comment.id && (
                        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <input
                            type="text"
                            value={replyAuthor}
                            onChange={(event) => setReplyAuthor(event.target.value)}
                            placeholder="Seu nome"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#111111] focus:outline-none"
                          />
                          <textarea
                            value={replyText}
                            onChange={(event) => setReplyText(event.target.value)}
                            rows={2}
                            placeholder="Escreva sua resposta..."
                            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#111111] focus:outline-none"
                          />
                          {replyError && <p className="mt-2 text-xs text-[#991B1B]">{replyError}</p>}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleAddReply(comment.id)}
                              className="rounded-md bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                            >
                              Publicar resposta
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReplyCommentId(null);
                                setReplyError('');
                              }}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-3 space-y-2 border-l-2 border-gray-200 pl-3">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="rounded-md bg-gray-50 p-2">
                              <p className="text-xs font-semibold text-gray-900">{reply.author}</p>
                              <p className="text-[11px] text-gray-500">{reply.date}</p>
                              <p className="mt-1 text-sm text-gray-700">{reply.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600">Nenhum comentário ainda. Seja o primeiro a comentar!</p>
                )}
              </div>
            </div>
          </article>
        </div>

        <div className="lg:col-span-1">
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
