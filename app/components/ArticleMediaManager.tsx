'use client';

import { ArrowDown, ArrowUp, CheckCircle2, ImagePlus, Link2, Pencil, RotateCw, Trash2, Video, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadDataUrlOrKeep, uploadMedia } from '../lib/uploadMedia';

export interface ArticleImage {
  id: string;
  url: string;
  alt: string;
  caption: string;
  isPrimary: boolean;
  name?: string;
  placement?: 'gallery' | 'inline';
}

export interface ArticleVideo {
  id: string;
  url: string;
  title: string;
  caption: string;
  name?: string;
  type?: 'upload' | 'external' | 'microsoft-stream';
  embedUrl?: string;
  placement?: 'gallery' | 'inline';
}

interface ArticleMediaManagerProps {
  initialImages?: ArticleImage[];
  initialVideos?: ArticleVideo[];
  initialPrimaryImage?: string;
  title?: string;
  onChange: (images: ArticleImage[], videos: ArticleVideo[], primaryImageUrl: string) => void;
}

interface EditorState {
  open: boolean;
  source: string;
  name: string;
  targetId?: string;
}

function getAspectRatio(value: string) {
  switch (value) {
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '16:9':
      return 16 / 9;
    case '3:2':
      return 3 / 2;
    default:
      return 0;
  }
}

function detectVideoType(url: string) {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes('microsoftstream.com') || normalizedUrl.includes('stream.microsoft.com')) {
    return 'microsoft-stream' as const;
  }

  return 'external' as const;
}

function getVideoEmbedUrl(video: ArticleVideo) {
  if (video.embedUrl) {
    return video.embedUrl;
  }

  if (video.type === 'microsoft-stream' || video.url.toLowerCase().includes('microsoftstream.com')) {
    const match = video.url.match(/\/video\/([^/?#]+)/i);
    if (match?.[1]) {
      return `https://web.microsoftstream.com/embed/video/${match[1]}`;
    }

    return video.url;
  }

  return video.url;
}

export default function ArticleMediaManager({
  initialImages = [],
  initialVideos = [],
  initialPrimaryImage = '',
  title = 'A notícia',
  onChange,
}: ArticleMediaManagerProps) {
  const [images, setImages] = useState<ArticleImage[]>(initialImages);
  const [videos, setVideos] = useState<ArticleVideo[]>(initialVideos);
  const [primaryImage, setPrimaryImage] = useState(initialPrimaryImage);
  const [editorState, setEditorState] = useState<EditorState>({ open: false, source: '', name: '' });
  const [videoLinkInput, setVideoLinkInput] = useState('');
  const [videoLinkType, setVideoLinkType] = useState<'external' | 'microsoft-stream'>('external');
  const [editorZoom, setEditorZoom] = useState(100);
  const [editorRotation, setEditorRotation] = useState(0);
  const [editorRatio, setEditorRatio] = useState('original');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const renderEditorPreview = (source: string, zoom: number, rotation: number, ratio: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !source) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      const aspectRatio = ratio === 'original' ? image.width / image.height : getAspectRatio(ratio);
      const targetWidth = 900;
      const targetHeight = Math.max(420, Math.round(targetWidth / (aspectRatio || 1)));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#F8F9FA';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      const scale = zoom / 100;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
    };

    image.src = source;
  };

  useEffect(() => {
    setImages(initialImages);
    setVideos(initialVideos);
    setPrimaryImage(initialPrimaryImage);
  }, [initialImages, initialVideos, initialPrimaryImage]);

  useEffect(() => {
    if (!editorState.open || !editorState.source) {
      return;
    }

    renderEditorPreview(editorState.source, editorZoom, editorRotation, editorRatio);
  }, [editorState.open, editorState.source, editorZoom, editorRotation, editorRatio]);

  useEffect(() => {
    if (!editorState.open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (event.key === 'Escape') {
        event.preventDefault();
        setEditorState({ open: false, source: '', name: '' });
        return;
      }

      if (event.key === 'Enter' && !isTypingField) {
        event.preventDefault();
        handleEditorApply();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorState.open, editorState.source, editorZoom, editorRotation, editorRatio, images, videos]);

  const emitChange = (nextImages: ArticleImage[], nextVideos: ArticleVideo[], nextPrimaryImage?: string) => {
    const normalizedImages = nextImages.map((image, index) => ({
      ...image,
      isPrimary: nextImages.some((item) => item.isPrimary) ? image.isPrimary : index === 0,
    }));

    const normalizedPrimary = nextPrimaryImage ?? normalizedImages.find((image) => image.isPrimary)?.url ?? normalizedImages[0]?.url ?? '';

    setImages(normalizedImages);
    setVideos(nextVideos);
    setPrimaryImage(normalizedPrimary);
    onChange(normalizedImages, nextVideos, normalizedPrimary);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    let dataUrl: string;
    try {
      dataUrl = await uploadMedia(file, file.name);
    } catch (error) {
      event.target.value = '';
      window.alert(error instanceof Error ? error.message : 'Falha ao enviar a imagem.');
      return;
    }
    const nextImage: ArticleImage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: dataUrl,
      alt: title,
      caption: '',
      isPrimary: images.length === 0,
      name: file.name,
    };

    emitChange([...images, nextImage], videos);
    event.target.value = '';
  };

  const handleEditExistingImage = (image: ArticleImage) => {
    setEditorState({ open: true, source: image.url, name: image.name ?? 'imagem', targetId: image.id });
  };

  const handleEditorApply = () => {
    const canvas = canvasRef.current;
    if (!canvas || !editorState.source) {
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = async () => {
      const ratio = editorRatio === 'original' ? image.width / image.height : getAspectRatio(editorRatio);
      const outputWidth = 1600;
      const outputHeight = Math.max(400, Math.round(outputWidth / (ratio || 1)));
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outputWidth;
      tempCanvas.height = outputHeight;
      const context = tempCanvas.getContext('2d');

      if (!context) {
        return;
      }

      context.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      context.save();
      context.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      context.rotate((editorRotation * Math.PI) / 180);
      const scale = editorZoom / 100;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();

      let editedUrl: string;
      try {
        editedUrl = await uploadDataUrlOrKeep(tempCanvas.toDataURL('image/jpeg', 0.92), `${editorState.name || 'imagem'}.jpg`);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Falha ao salvar a imagem editada.');
        return;
      }
      if (editorState.targetId) {
        const nextImages = images.map((imageItem) => (imageItem.id === editorState.targetId ? { ...imageItem, url: editedUrl, name: editorState.name } : imageItem));
        emitChange(nextImages, videos);
      } else {
        const newImage: ArticleImage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: editedUrl,
          alt: title,
          caption: '',
          isPrimary: images.length === 0,
          name: editorState.name,
        };
        emitChange([...images, newImage], videos);
      }

      setEditorState({ open: false, source: '', name: '' });
      setEditorZoom(100);
      setEditorRotation(0);
      setEditorRatio('original');
    };

    image.src = editorState.source;
  };

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    let videoUrl: string;
    try {
      videoUrl = await uploadMedia(file, file.name);
    } catch (error) {
      event.target.value = '';
      window.alert(error instanceof Error ? error.message : 'Falha ao enviar o vídeo.');
      return;
    }
    const newVideo: ArticleVideo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: videoUrl,
      title: file.name.replace(/\.[^/.]+$/, ''),
      caption: '',
      name: file.name,
      type: 'upload',
    };

    emitChange(images, [...videos, newVideo]);
    event.target.value = '';
  };

  const handleAddVideoLink = () => {
    const normalizedUrl = videoLinkInput.trim();
    if (!normalizedUrl) {
      return;
    }

    const type = videoLinkType === 'microsoft-stream' ? 'microsoft-stream' : detectVideoType(normalizedUrl);
    const embedUrl = type === 'microsoft-stream' ? getVideoEmbedUrl({ id: '', url: normalizedUrl, title: '', caption: '', type }) : normalizedUrl;
    const newVideo: ArticleVideo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalizedUrl,
      title: type === 'microsoft-stream' ? 'Microsoft Stream' : 'Vídeo externo',
      caption: '',
      name: normalizedUrl,
      type,
      embedUrl,
    };

    emitChange(images, [...videos, newVideo]);
    setVideoLinkInput('');
    setVideoLinkType('external');
  };

  const handleEditVideo = (video: ArticleVideo) => {
    const nextTitle = window.prompt('Editar título do vídeo', video.title || 'Vídeo');
    if (nextTitle === null) {
      return;
    }

    const nextUrl = window.prompt('Editar URL do vídeo', video.url || '');
    if (nextUrl === null) {
      return;
    }

    const normalizedType: ArticleVideo['type'] = nextUrl.trim().toLowerCase().includes('microsoftstream.com') || video.type === 'microsoft-stream'
      ? 'microsoft-stream'
      : 'external';
    const nextVideos: ArticleVideo[] = videos.map((item) =>
      item.id === video.id
        ? {
            ...item,
            title: nextTitle.trim() || item.title,
            url: nextUrl.trim() || item.url,
            name: nextUrl.trim() || item.name,
            type: normalizedType,
            embedUrl: normalizedType === 'microsoft-stream' ? getVideoEmbedUrl({ ...item, title: nextTitle.trim() || item.title, url: nextUrl.trim() || item.url, type: normalizedType }) : nextUrl.trim() || item.url,
          }
        : item
    );

    emitChange(images, nextVideos);
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const nextImages = [...images];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= nextImages.length) {
      return;
    }

    const [moved] = nextImages.splice(index, 1);
    nextImages.splice(targetIndex, 0, moved);
    emitChange(nextImages, videos);
  };

  const moveVideo = (index: number, direction: -1 | 1) => {
    const nextVideos = [...videos];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= nextVideos.length) {
      return;
    }

    const [moved] = nextVideos.splice(index, 1);
    nextVideos.splice(targetIndex, 0, moved);
    emitChange(images, nextVideos);
  };

  const markPrimaryImage = (imageId: string) => {
    const nextImages = images.map((image) => ({ ...image, isPrimary: image.id === imageId }));
    emitChange(nextImages, videos);
  };

  const removeImage = (imageId: string) => {
    const nextImages = images.filter((image) => image.id !== imageId);
    const nextPrimaryImage = nextImages.length > 0 ? nextImages[0].url : '';
    emitChange(nextImages, videos, nextPrimaryImage);
  };

  const removeVideo = (videoId: string) => {
    const nextVideos = videos.filter((video) => video.id !== videoId);
    emitChange(images, nextVideos);
  };

  const previewImages = useMemo(() => images, [images]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-[#FFF7F5] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Mídia da matéria</p>
            <p className="text-xs text-gray-500">Adicione imagens, edite-as no próprio painel e associe vídeos externos ou do Microsoft Stream.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">
              <ImagePlus className="h-4 w-4" />
              Adicionar imagem
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">
              <Video className="h-4 w-4" />
              Enviar vídeo
              <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">URL do vídeo</label>
              <input
                type="url"
                value={videoLinkInput}
                onChange={(event) => setVideoLinkInput(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
              />
            </div>
            <div className="w-full md:w-48">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</label>
              <select
                value={videoLinkType}
                onChange={(event) => setVideoLinkType(event.target.value as 'external' | 'microsoft-stream')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
              >
                <option value="external">Vídeo externo</option>
                <option value="microsoft-stream">Microsoft Stream</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddVideoLink}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#C40000] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#a60000]"
            >
              <Link2 className="h-4 w-4" />
              Adicionar link
            </button>
          </div>
        </div>
      </div>

      {previewImages.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">Imagens</p>
          <div className="space-y-3">
            {previewImages.map((image, index) => (
              <div key={image.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <img src={image.url} alt={image.alt} className="h-28 w-full rounded-lg bg-white object-contain md:w-40" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {image.isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FF796C]/10 px-2.5 py-1 text-xs font-semibold text-[#FF796C]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Principal
                        </span>
                      )}
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Legenda / descrição
                      </label>
                      <textarea
                        value={image.caption ?? ''}
                        onChange={(event) => {
                          const nextImages = images.map((item) =>
                            item.id === image.id ? { ...item, caption: event.target.value } : item
                          );
                          emitChange(nextImages, videos);
                        }}
                        rows={2}
                        placeholder={image.isPrimary ? 'Legenda da imagem principal da matéria' : 'Descreva esta imagem'}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-[#FF796C] focus:outline-none"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => markPrimaryImage(image.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">
                        Usar como principal
                      </button>
                      <button type="button" onClick={() => handleEditExistingImage(image)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                      <button type="button" onClick={() => removeImage(image.id)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-red-300 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 md:flex-col">
                    <button type="button" onClick={() => moveImage(index, -1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-[#FF796C] hover:text-[#FF796C]" aria-label="Mover imagem para cima">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => moveImage(index, 1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-[#FF796C] hover:text-[#FF796C]" aria-label="Mover imagem para baixo">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">Vídeos</p>
          <div className="space-y-3">
            {videos.map((video, index) => (
              <div key={video.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  {video.type === 'microsoft-stream' || video.embedUrl?.includes('microsoftstream.com/embed') ? (
                    <iframe
                      src={video.embedUrl || video.url}
                      title={video.title}
                      className="h-24 w-full rounded-lg bg-[#111111] md:w-40"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  ) : (
                    <video controls className="h-24 w-full rounded-lg bg-[#111111] object-cover md:w-40">
                      <source src={video.url} />
                    </video>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{video.title}</p>
                    <p className="text-xs text-gray-500">{video.name ?? 'Vídeo anexado'}</p>
                  </div>
                  <div className="flex gap-2 md:flex-col">
                    <button type="button" onClick={() => moveVideo(index, -1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-[#FF796C] hover:text-[#FF796C]" aria-label="Mover vídeo para cima">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => moveVideo(index, 1)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-[#FF796C] hover:text-[#FF796C]" aria-label="Mover vídeo para baixo">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeVideo(video.id)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-red-300 hover:text-red-600" aria-label="Remover vídeo">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editorState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-4xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 text-center">
                <h3 className="text-2xl font-light tracking-[-0.05em] text-gray-900">Editar imagem</h3>
                <p className="mt-2 text-sm text-gray-500">Ajuste zoom, rotação e proporção antes de confirmar.</p>
              </div>
              <button type="button" onClick={() => setEditorState({ open: false, source: '', name: '' })} className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr,0.65fr]">
              <div className="rounded-[24px] border border-gray-200 bg-[#F8F9FA] p-4">
                <canvas ref={canvasRef} className="w-full rounded-[18px] border border-gray-200 bg-white" />
              </div>

              <div className="space-y-5">
                <div className="rounded-[20px] border border-gray-200 bg-[#FFF7F5] p-4">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <label className="text-sm font-semibold text-gray-900">Zoom</label>
                    <span className="text-xs font-medium text-gray-500">{editorZoom}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditorZoom((previous) => Math.max(60, previous - 10))} className="h-9 w-9 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">−</button>
                    <input type="range" min="60" max="180" step="1" value={editorZoom} onChange={(event) => setEditorZoom(Number(event.target.value))} className="w-full" />
                    <button type="button" onClick={() => setEditorZoom((previous) => Math.min(180, previous + 10))} className="h-9 w-9 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">+</button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-gray-200 bg-[#F8F9FA] p-4">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <label className="text-sm font-semibold text-gray-900">Rotação</label>
                    <span className="text-xs font-medium text-gray-500">{editorRotation}°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditorRotation((previous) => Math.max(-180, previous - 15))} className="h-9 w-9 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">↺</button>
                    <input type="range" min="-180" max="180" step="1" value={editorRotation} onChange={(event) => setEditorRotation(Number(event.target.value))} className="w-full" />
                    <button type="button" onClick={() => setEditorRotation((previous) => Math.min(180, previous + 15))} className="h-9 w-9 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:border-[#FF796C] hover:text-[#FF796C]">↻</button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-gray-200 bg-[#F8F9FA] p-4 text-center">
                  <label className="mb-2 block text-sm font-semibold text-gray-900">Proporção</label>
                  <select value={editorRatio} onChange={(event) => setEditorRatio(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none">
                    <option value="original">Original</option>
                    <option value="1:1">1:1</option>
                    <option value="4:3">4:3</option>
                    <option value="16:9">16:9</option>
                    <option value="3:2">3:2</option>
                  </select>
                </div>

                <div className="rounded-[20px] border border-gray-200 bg-[#FFF7F5] p-4 text-center text-sm text-gray-600">
                  <p className="font-semibold text-gray-900">O que você consegue fazer aqui</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-left">
                    <li>Cortar e ajustar a composição visual</li>
                    <li>Redimensionar o recorte com zoom</li>
                    <li>Girar a imagem antes de salvar</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => setEditorState({ open: false, source: '', name: '' })} className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={handleEditorApply} className="inline-flex items-center gap-2 rounded-full bg-[#FF796C] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f35f50]">
                <RotateCw className="h-4 w-4" />
                Confirmar edição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
