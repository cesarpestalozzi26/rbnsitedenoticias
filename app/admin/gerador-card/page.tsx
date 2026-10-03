'use client';

import { ChangeEvent, ComponentType, CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Montserrat } from 'next/font/google';
import {
  Clock,
  Download,
  Facebook,
  FolderOpen,
  Globe,
  ImageUp,
  Instagram,
  Layers3,
  Link2,
  Music2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Youtube,
} from 'lucide-react';
import AdminSidebar from '@/app/components/AdminSidebar';
import { useArticles } from '@/app/hooks/useArticles';
import { useUsers } from '@/app/hooks/useUsers';
import { getCategoryDisplayName } from '@/app/lib/categoryLabels';

// Auto-hospedada pelo Next.js (sem chamadas externas ao Google Fonts em
// tempo de execução). Usada tanto pelos campos de texto do gerador quanto
// pelo canvas de desenho do card (ver MONTSERRAT_FONT_FAMILY).
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});
const MONTSERRAT_FONT_FAMILY = montserrat.style.fontFamily;

type CardTemplate = 'editorial' | 'urgente' | 'clean';
type CardKind = 'news' | 'column' | 'memorial';
type ExportFormat = 'png' | 'jpeg';
type HeaderTheme = 'black' | 'white';
type FooterGradient = 'dark' | 'light';
type LogoPosition = 'left' | 'center' | 'right';
type TitleAlign = 'left' | 'center' | 'right';
type TitleFont =
  | 'arial'
  | 'calibri'
  | 'cambria'
  | 'georgia'
  | 'impact'
  | 'garamond'
  | 'trebuchet'
  | 'verdana'
  | 'times'
  | 'montserrat-regular'
  | 'montserrat-medium'
  | 'montserrat-semibold'
  | 'montserrat-bold'
  | 'montserrat-extrabold';
type TitleFontStyle = 'regular' | 'bold' | 'italic' | 'bold-italic';
type IntroAnimation = 'fade-up' | 'slide-left' | 'zoom-in';
type PreviewKind = 'image' | 'video';
// Controla, no vídeo exportado, se a logo/categoria/manchete/redes sociais
// ficam visíveis durante todo o clipe ("full") ou só numa janela de tempo
// escolhida pelo usuário ("custom", com cardOverlayStart/cardOverlayEnd).
type CardOverlayMode = 'full' | 'custom';
type SocialPlatformKey = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'website' | 'other';
type SocialLinkEntry = { value: string; enabled: boolean };
type SocialLinksState = Record<SocialPlatformKey, SocialLinkEntry> & { otherLabel: string };
type SocialBadgeEntry = { platform: SocialPlatformKey; text: string; color: string };
type CardGeneratorPreset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: {
    cardKind: CardKind;
    selectedTemplate: CardTemplate;
    exportFormat: ExportFormat;
    titleFont: TitleFont;
    titleFontStyle: TitleFontStyle;
    titleAlign?: TitleAlign;
    logoPosition: LogoPosition;
    introAnimation: IntroAnimation;
    headerTheme: HeaderTheme;
    footerGradient: FooterGradient;
    showCategory: boolean;
    isCategoryBackgroundTransparent: boolean;
    categoryBackgroundColor: string;
    categoryTextColor: string;
    categoryBorderColor: string;
    categoryFont?: TitleFont;
    categoryFontStyle?: TitleFontStyle;
    categoryFontSize?: number;
    categoryPadding?: number;
    categoryBorderRadius?: number;
    categoryTitleGap?: number;
    logoSize?: number;
    logoOffsetX?: number;
    logoOffsetY?: number;
    columnTitleSize?: number;
    columnTitleOffsetX?: number;
    columnTitleOffsetY?: number;
    columnAccentOffsetX?: number;
    columnAccentOffsetY?: number;
    imageScale: number;
    imageOffsetX: number;
    imageOffsetY: number;
  };
};

type WrappedText = {
  fontSize: number;
  lineHeight: number;
  lines: string[];
};

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;
const CARD_LOGO_SRC = '/rbn-card-logo.png';
const CARD_ACCENT_RED = '#C1121F';
const VIDEO_EXPORT_EXTENSION = 'webm';
const VIDEO_EXPORT_MAX_DURATION_SECONDS = 180;
const VIDEO_INTRO_DURATION_SECONDS = 1.15;
const CARD_PRESETS_STORAGE_KEY = 'rbn-card-generator-presets';
// As redes sociais/site são informações de marca que o usuário costuma
// cadastrar uma única vez e reaproveitar em muitos cards, por isso ficam
// salvas no navegador (como as predefinições) em vez de resetar a cada
// notícia selecionada.
const CARD_SOCIAL_LINKS_STORAGE_KEY = 'rbn-card-generator-social-links';

const SOCIAL_PLATFORM_ORDER: SocialPlatformKey[] = ['instagram', 'tiktok', 'youtube', 'facebook', 'website', 'other'];

const DEFAULT_SOCIAL_LINKS: SocialLinksState = {
  instagram: { value: '', enabled: false },
  tiktok: { value: '', enabled: false },
  youtube: { value: '', enabled: false },
  facebook: { value: '', enabled: false },
  website: { value: '', enabled: false },
  other: { value: '', enabled: false },
  otherLabel: 'Contato',
};

const SOCIAL_PLATFORM_META: Record<
  SocialPlatformKey,
  {
    label: string;
    color: string;
    placeholder: string;
    Icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  }
> = {
  instagram: { label: 'Instagram', color: '#D6249F', placeholder: '@rbnbrasil', Icon: Instagram },
  tiktok: { label: 'TikTok', color: '#111111', placeholder: '@rbnbrasil', Icon: Music2 },
  youtube: { label: 'YouTube', color: '#CC0000', placeholder: '@rbnbrasil', Icon: Youtube },
  facebook: { label: 'Facebook', color: '#1877F2', placeholder: '/rbnbrasil', Icon: Facebook },
  website: { label: 'Site', color: '#1F2937', placeholder: 'rbnbrasil.com.br', Icon: Globe },
  other: { label: 'Outro contato', color: '#374151', placeholder: 'Ex.: WhatsApp (11) 99999-9999', Icon: Link2 },
};

// Marcação interna (sem o wrapper <svg>) de cada ícone, copiada das mesmas
// definições usadas pelos componentes lucide-react acima, para desenhar o
// logotipo real de cada rede dentro do selo colorido do card (em vez de
// uma sigla de texto/emoji).
const SOCIAL_ICON_INNER_SVG: Record<SocialPlatformKey, string> = {
  instagram:
    '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  tiktok: '<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/>',
  youtube:
    '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  website: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  other: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
};

function buildSocialIconDataUrl(platform: SocialPlatformKey) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${SOCIAL_ICON_INNER_SVG[platform]}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Logotipo real do Instagram (quadrado arredondado com o gradiente oficial),
// desenhado por inteiro no lugar do selo de cor sólida + ícone branco usado
// pelas demais redes, para ficar fiel ao app.
function buildInstagramLogoDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <defs>
      <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FFDD55"/>
        <stop offset="28%" stop-color="#FF543E"/>
        <stop offset="55%" stop-color="#C837AB"/>
        <stop offset="100%" stop-color="#5B51D8"/>
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6.5" fill="url(#ig-gradient)"/>
    <rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#FFFFFF" stroke-width="1.7"/>
    <circle cx="12" cy="12" r="3.1" fill="none" stroke="#FFFFFF" stroke-width="1.7"/>
    <circle cx="16.3" cy="7.7" r="1" fill="#FFFFFF"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function loadSocialIconImages() {
  return Promise.all(
    SOCIAL_PLATFORM_ORDER.map(async (platform) => {
      const dataUrl = platform === 'instagram' ? buildInstagramLogoDataUrl() : buildSocialIconDataUrl(platform);
      return [platform, await loadImage(dataUrl)] as const;
    })
  ).then((pairs) => Object.fromEntries(pairs) as Record<SocialPlatformKey, HTMLImageElement>);
}

const templateOptions: Array<{
  id: CardTemplate;
  name: string;
  description: string;
}> = [
  { id: 'editorial', name: 'Editorial', description: 'Visual principal do portal, forte e equilibrado.' },
  { id: 'urgente', name: 'Urgente', description: 'Imagem de fundo em preto e branco.' },
  { id: 'clean', name: 'Clean', description: 'Leitura limpa, com composição elegante e minimalista.' },
];

const fontOptions: Array<{ id: TitleFont; label: string; family: string; weight?: number }> = [
  { id: 'arial', label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { id: 'calibri', label: 'Calibri', family: 'Calibri, Arial, sans-serif' },
  { id: 'cambria', label: 'Cambria', family: 'Cambria, Georgia, serif' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia, Times New Roman, serif' },
  { id: 'garamond', label: 'Garamond', family: 'Garamond, Georgia, serif' },
  { id: 'impact', label: 'Impact', family: 'Impact, Arial Black, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet', family: 'Trebuchet MS, Arial, sans-serif' },
  { id: 'verdana', label: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { id: 'times', label: 'Times', family: 'Times New Roman, Times, serif' },
  { id: 'montserrat-regular', label: 'Montserrat Regular', family: MONTSERRAT_FONT_FAMILY, weight: 400 },
  { id: 'montserrat-medium', label: 'Montserrat Medium', family: MONTSERRAT_FONT_FAMILY, weight: 500 },
  { id: 'montserrat-semibold', label: 'Montserrat SemiBold', family: MONTSERRAT_FONT_FAMILY, weight: 600 },
  { id: 'montserrat-bold', label: 'Montserrat Bold', family: MONTSERRAT_FONT_FAMILY, weight: 700 },
  { id: 'montserrat-extrabold', label: 'Montserrat ExtraBold', family: MONTSERRAT_FONT_FAMILY, weight: 800 },
];

const introAnimationOptions: Array<{ id: IntroAnimation; label: string; description: string }> = [
  { id: 'fade-up', label: 'Fade para cima', description: 'Texto e logo sobem suavemente.' },
  { id: 'slide-left', label: 'Entrada lateral', description: 'As informações entram pela esquerda.' },
  { id: 'zoom-in', label: 'Zoom suave', description: 'A informação entra com leve aproximação.' },
];

const cardKindOptions: Array<{ id: CardKind; label: string; description: string }> = [
  { id: 'news', label: 'Notícia', description: 'Card flexível para manchetes, imagem ou vídeo.' },
  { id: 'column', label: 'Card de Coluna', description: 'Modelo editorial com colunista, foto de perfil e título da coluna.' },
  { id: 'memorial', label: 'Luto / Falecimento', description: 'Modelo sóbrio com foto, nome, profissão e anos de nascimento e falecimento.' },
];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    image.src = src;
  });
}

function loadVideo(src: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const cleanup = () => {
      video.onloadeddata = null;
      video.onerror = null;
    };

    video.onloadeddata = () => {
      cleanup();
      resolve(video);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(`Falha ao carregar video: ${src}`));
    };
    video.src = src;
    video.load();
  });
}

function seekVideo(video: HTMLVideoElement, timeInSeconds: number) {
  return new Promise<void>((resolve, reject) => {
    const safeTime = Math.max(0, Math.min(timeInSeconds, Number.isFinite(video.duration) ? Math.max(video.duration - 0.01, 0) : timeInSeconds));

    if (safeTime === 0) {
      requestAnimationFrame(() => resolve());
      return;
    }

    const cleanup = () => {
      video.onseeked = null;
      video.onerror = null;
    };

    video.onseeked = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Falha ao preparar o video para o card.'));
    };
    video.currentTime = safeTime;
  });
}

function getFontFamily(font: TitleFont) {
  return fontOptions.find((option) => option.id === font)?.family ?? fontOptions[0].family;
}

function getFontStyleParts(fontStyle: TitleFontStyle) {
  switch (fontStyle) {
    case 'bold':
      return { fontStyle: 'normal', fontWeight: '800' };
    case 'italic':
      return { fontStyle: 'italic', fontWeight: '700' };
    case 'bold-italic':
      return { fontStyle: 'italic', fontWeight: '800' };
    default:
      return { fontStyle: 'normal', fontWeight: '700' };
  }
}

// Algumas fontes (as variantes Montserrat) já têm um peso fixo e nomeado
// (Regular/Medium/SemiBold/Bold/ExtraBold). Quando a fonte escolhida tiver
// esse peso definido, ele prevalece sobre o peso genérico do estilo
// Regular/Negrito — assim "Montserrat SemiBold" sempre desenha em 600,
// não importa se o estilo está marcado como Regular ou Negrito.
function getEffectiveFontStyleParts(font: TitleFont, fontStyle: TitleFontStyle) {
  const base = getFontStyleParts(fontStyle);
  const fixedWeight = fontOptions.find((option) => option.id === font)?.weight;
  return fixedWeight ? { ...base, fontWeight: String(fixedWeight) } : base;
}

// O Canvas 2D não espera automaticamente o carregamento de web fonts como o
// HTML faz: se a fonte Montserrat ainda não tiver sido baixada pelo
// navegador, o desenho usa silenciosamente a fonte de fallback do sistema.
// Antes de desenhar o card, garantimos que todos os pesos do Montserrat já
// estejam prontos (chamadas repetidas são baratas: o navegador guarda em
// cache assim que o primeiro carregamento termina).
async function ensureCardFontsLoaded() {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }

  const weights = [400, 500, 600, 700, 800];
  try {
    await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 48px ${MONTSERRAT_FONT_FAMILY}`)));
    await document.fonts.ready;
  } catch {
    // Se o carregamento falhar (ex.: sem rede), o desenho segue com a
    // fonte de fallback em vez de travar a geração do card.
  }
}

function getVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  // VP8 é priorizado sobre o VP9: embora o VP9 comprima um pouco melhor, a
  // codificação por software é bem mais pesada para a CPU em tempo real.
  // Com o canvas em 1080x1350 a 30fps, o VP9 costumava disputar CPU com o
  // próprio desenho do frame, o que causava o travamento/engasgo relatado
  // no vídeo exportado. O VP8 é muito mais leve de codificar e evita isso.
  const mimeTypes = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

function easeOutCubic(progress: number) {
  const safeProgress = Math.max(0, Math.min(progress, 1));
  return 1 - (1 - safeProgress) ** 3;
}

function extractYearFromDate(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  const match = trimmedValue.match(/^(\d{4})/);
  return match ? match[1] : trimmedValue;
}

function formatMemorialYears(birthDate: string, deathDate: string) {
  const birthYear = extractYearFromDate(birthDate);
  const deathYear = extractYearFromDate(deathDate);

  if (!birthYear && !deathYear) {
    return '';
  }

  if (birthYear && deathYear) {
    return `${birthYear} - ${deathYear}`;
  }

  return birthYear || deathYear;
}

function clampVideoTrim(startTime: number, clipDuration: number, totalDuration: number) {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return { startTime: 0, clipDuration: 5 };
  }

  const safeStart = Math.max(0, Math.min(startTime, Math.max(totalDuration - 1, 0)));
  const maxClipDuration = Math.max(1, Math.min(VIDEO_EXPORT_MAX_DURATION_SECONDS, totalDuration - safeStart));
  const safeDuration = Math.max(1, Math.min(clipDuration, maxClipDuration));

  return {
    startTime: safeStart,
    clipDuration: safeDuration,
  };
}

// Janela de tempo (dentro do clipe já cortado) em que a logo, a categoria, a
// manchete e as redes sociais ficam visíveis no vídeo exportado. Garante
// sempre 0 <= start <= end <= clipDuration, mesmo que o usuário tenha
// configurado a janela para um vídeo mais longo antes de reduzir o corte.
function clampOverlayWindow(start: number, end: number, clipDuration: number) {
  const safeTotal = Number.isFinite(clipDuration) && clipDuration > 0 ? clipDuration : 0;
  const safeStart = Math.max(0, Math.min(start, safeTotal));
  const safeEnd = Math.max(safeStart, Math.min(end, safeTotal));
  return { start: safeStart, end: safeEnd };
}

function formatSecondsLabel(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getIntroFrameStyle(animation: IntroAnimation, progress: number) {
  const eased = easeOutCubic(progress);

  if (animation === 'slide-left') {
    return {
      alpha: eased,
      translateX: -120 * (1 - eased),
      translateY: 0,
      scale: 1,
    };
  }

  if (animation === 'zoom-in') {
    return {
      alpha: eased,
      translateX: 0,
      translateY: 0,
      scale: 0.88 + 0.12 * eased,
    };
  }

  return {
    alpha: eased,
    translateX: 0,
    translateY: 58 * (1 - eased),
    scale: 1,
  };
}

function isCardGeneratorPreset(value: unknown): value is CardGeneratorPreset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const preset = value as CardGeneratorPreset;
  return Boolean(
    typeof preset.id === 'string' &&
      typeof preset.name === 'string' &&
      typeof preset.createdAt === 'string' &&
      typeof preset.updatedAt === 'string' &&
      preset.config &&
      typeof preset.config === 'object'
  );
}

function readCardPresetsFromStorage() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedPresets = window.localStorage.getItem(CARD_PRESETS_STORAGE_KEY);
    if (!storedPresets) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(storedPresets);
    return Array.isArray(parsedValue) ? parsedValue.filter(isCardGeneratorPreset) : [];
  } catch {
    return [];
  }
}

function writeCardPresetsToStorage(presets: CardGeneratorPreset[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CARD_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function isSocialLinkEntry(value: unknown): value is SocialLinkEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as SocialLinkEntry;
  return typeof entry.value === 'string' && typeof entry.enabled === 'boolean';
}

function readSocialLinksFromStorage(): SocialLinksState {
  if (typeof window === 'undefined') {
    return DEFAULT_SOCIAL_LINKS;
  }

  try {
    const stored = window.localStorage.getItem(CARD_SOCIAL_LINKS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SOCIAL_LINKS;
    }

    const parsedValue: unknown = JSON.parse(stored);
    if (!parsedValue || typeof parsedValue !== 'object') {
      return DEFAULT_SOCIAL_LINKS;
    }

    const parsedRecord = parsedValue as Partial<Record<keyof SocialLinksState, unknown>>;
    const nextState = { ...DEFAULT_SOCIAL_LINKS };

    SOCIAL_PLATFORM_ORDER.forEach((key) => {
      const parsedEntry = parsedRecord[key];
      if (isSocialLinkEntry(parsedEntry)) {
        nextState[key] = parsedEntry;
      }
    });

    if (typeof parsedRecord.otherLabel === 'string' && parsedRecord.otherLabel.trim()) {
      nextState.otherLabel = parsedRecord.otherLabel;
    }

    return nextState;
  } catch {
    return DEFAULT_SOCIAL_LINKS;
  }
}

function writeSocialLinksToStorage(state: SocialLinksState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CARD_SOCIAL_LINKS_STORAGE_KEY, JSON.stringify(state));
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const drawScale = Math.max(1, scale);
  const baseCoverScale = Math.max(width / sourceWidth, height / sourceHeight);
  const finalScale = baseCoverScale * drawScale;
  const drawWidth = sourceWidth * finalScale;
  const drawHeight = sourceHeight * finalScale;
  const drawX = x + (width - drawWidth) / 2 + offsetX;
  const drawY = y + (height - drawHeight) / 2 + offsetY;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  fontStyle: TitleFontStyle,
  preferredFontSize?: number,
  font?: TitleFont
) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const words = normalizedText.split(' ').filter(Boolean);
  const fontStyleParts = font ? getEffectiveFontStyleParts(font, fontStyle) : getFontStyleParts(fontStyle);

  const maxFontSize = typeof preferredFontSize === 'number'
    ? Math.max(24, Math.min(120, preferredFontSize))
    : 82;
  const minFontSize = typeof preferredFontSize === 'number' ? maxFontSize : 42;
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    context.font = `${fontStyleParts.fontStyle} ${fontStyleParts.fontWeight} ${fontSize}px ${fontFamily}`;
    const lineHeight = Math.round(fontSize * 1.12);
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (context.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        return;
      }

      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    if (lines.length * lineHeight <= maxHeight && lines.length <= 5) {
      return {
        fontSize,
        lineHeight,
        lines,
      } satisfies WrappedText;
    }
  }

  const fallbackFontSize = typeof preferredFontSize === 'number' ? minFontSize : 42;
  context.font = `${fontStyleParts.fontStyle} ${fontStyleParts.fontWeight} ${fallbackFontSize}px ${fontFamily}`;
  return {
    fontSize: fallbackFontSize,
    lineHeight: Math.round(fallbackFontSize * 1.12),
    lines: [normalizedText],
  } satisfies WrappedText;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
}

// Desenha a linha de redes sociais/site do card: um selo colorido com o
// logotipo real da rede (ícone, não sigla/emoji) seguido do valor cadastrado
// (ex.: "@rbnbrasil"), quebrando para a linha seguinte quando não cabe mais
// na largura do card. Fonte, tamanho e alinhamento são configuráveis.
function drawSocialLinksRow(
  context: CanvasRenderingContext2D,
  entries: SocialBadgeEntry[],
  iconImages: Partial<Record<SocialPlatformKey, HTMLImageElement>>,
  startX: number,
  startY: number,
  maxWidth: number,
  textColor: string,
  fontFamily: string,
  fontSize: number,
  align: TitleAlign
) {
  if (entries.length === 0) {
    return;
  }

  const safeFontSize = Math.max(16, Math.min(64, fontSize));
  const badgeSize = safeFontSize * 1.55;
  const iconSize = badgeSize * 0.56;
  const textFont = `600 ${safeFontSize}px ${fontFamily}`;
  const gapBadgeText = safeFontSize * 0.42;
  const gapItems = safeFontSize * 1.05;
  const lineHeight = badgeSize + safeFontSize * 0.5;

  context.font = textFont;

  // Primeiro agrupa os itens em linhas (respeitando a largura máxima) para
  // então poder alinhar cada linha à esquerda, ao centro ou à direita.
  const lines: Array<Array<{ entry: SocialBadgeEntry; itemWidth: number }>> = [[]];
  let currentLineWidth = 0;

  entries.forEach((entry) => {
    const textWidth = context.measureText(entry.text).width;
    const itemWidth = badgeSize + gapBadgeText + textWidth;
    const currentLine = lines[lines.length - 1];

    if (currentLine.length > 0 && currentLineWidth + gapItems + itemWidth > maxWidth) {
      lines.push([{ entry, itemWidth }]);
      currentLineWidth = itemWidth;
      return;
    }

    currentLine.push({ entry, itemWidth });
    currentLineWidth += (currentLine.length > 1 ? gapItems : 0) + itemWidth;
  });

  lines.forEach((line, lineIndex) => {
    const lineWidth = line.reduce((total, item, index) => total + item.itemWidth + (index > 0 ? gapItems : 0), 0);
    const lineStartX =
      align === 'center'
        ? startX + (maxWidth - lineWidth) / 2
        : align === 'right'
          ? startX + maxWidth - lineWidth
          : startX;
    const cursorY = startY + lineIndex * lineHeight;
    let cursorX = lineStartX;

    line.forEach(({ entry, itemWidth }) => {
      const icon = iconImages[entry.platform];

      if (entry.platform === 'instagram') {
        // O logotipo do Instagram já traz seu próprio fundo em gradiente,
        // então é desenhado sozinho (sem o selo de cor sólida) e um pouco
        // menor que o selo das demais redes, para não ficar grande demais.
        const logoSize = badgeSize * 0.8;
        const logoOffset = (badgeSize - logoSize) / 2;
        if (icon) {
          context.drawImage(icon, cursorX + logoOffset, cursorY + logoOffset, logoSize, logoSize);
        }
      } else {
        context.fillStyle = entry.color;
        drawRoundedRect(context, cursorX, cursorY, badgeSize, badgeSize, badgeSize / 2);

        if (icon) {
          context.drawImage(icon, cursorX + (badgeSize - iconSize) / 2, cursorY + (badgeSize - iconSize) / 2, iconSize, iconSize);
        }
      }

      context.fillStyle = textColor;
      context.font = textFont;
      context.textBaseline = 'middle';
      context.fillText(entry.text, cursorX + badgeSize + gapBadgeText, cursorY + badgeSize / 2 + 1);
      context.textBaseline = 'alphabetic';

      cursorX += itemWidth + gapItems;
    });
  });
}

// `makeNearBlackTransparent` lê e reescreve todos os pixels do logotipo
// (getImageData/putImageData), uma operação pesada de CPU. Durante a
// exportação de vídeo, `drawTemplate` é chamado a cada frame (até 30x por
// segundo) com a MESMA instância de `logoImage`, então recalcular esse
// processamento em todo frame concorria diretamente com a gravação do
// vídeo e era a principal causa do travamento/engasgo — tanto na prévia
// quanto no arquivo final. Este cache memoriza o resultado por imagem
// (reaproveitado em todos os frames) e só é recalculado se a imagem de
// origem mudar.
const nearBlackTransparentCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

function makeNearBlackTransparent(image: HTMLImageElement) {
  const cached = nearBlackTransparentCache.get(image);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    return image;
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];

    if (red <= 18 && green <= 18 && blue <= 18) {
      data[index + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);
  nearBlackTransparentCache.set(image, canvas);
  return canvas;
}

function cropTransparentImage(image: HTMLCanvasElement) {
  const context = image.getContext('2d');
  if (!context) {
    return image;
  }

  const { width, height } = image;
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return image;
  }

  const croppedImage = document.createElement('canvas');
  croppedImage.width = maxX - minX + 1;
  croppedImage.height = maxY - minY + 1;
  croppedImage
    .getContext('2d')
    ?.drawImage(image, minX, minY, croppedImage.width, croppedImage.height, 0, 0, croppedImage.width, croppedImage.height);
  return croppedImage;
}

function drawTemplate(
  context: CanvasRenderingContext2D,
  title: string,
  categoryLabel: string,
  showCategory: boolean,
  heroMedia: CanvasImageSource,
  heroMediaWidth: number,
  heroMediaHeight: number,
  logoImage: HTMLImageElement | null,
  template: CardTemplate,
  logoPosition: LogoPosition,
  logoSize: number,
  logoOffsetX: number,
  logoOffsetY: number,
  headerTheme: HeaderTheme,
  footerGradient: FooterGradient,
  imageScale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  isCategoryBackgroundTransparent: boolean,
  categoryBackgroundColor: string,
  categoryTextColor: string,
  categoryBorderColor: string,
  categoryFont: TitleFont,
  categoryFontStyle: TitleFontStyle,
  categoryFontSize: number,
  categoryPadding: number,
  categoryBorderRadius: number,
  categoryTitleGap: number,
  titleFont: TitleFont,
  titleFontStyle: TitleFontStyle,
  titleAlign: TitleAlign,
  introAnimation: IntroAnimation,
  animationProgress: number,
  socialBadges: SocialBadgeEntry[],
  socialIconImages: Partial<Record<SocialPlatformKey, HTMLImageElement>>,
  socialFont: TitleFont,
  socialFontSize: number,
  socialOffsetX: number,
  socialOffsetY: number,
  socialAlign: TitleAlign
) {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const isUrgentTemplate = template === 'urgente';
  const titleFontFamily = getFontFamily(titleFont);
  const fontStyleParts = getEffectiveFontStyleParts(titleFont, titleFontStyle);
  const categoryFontFamily = getFontFamily(categoryFont);
  const categoryFontStyleParts = getEffectiveFontStyleParts(categoryFont, categoryFontStyle);
  const introFrameStyle = getIntroFrameStyle(introAnimation, animationProgress);
  if (isUrgentTemplate && 'filter' in context) {
    context.filter = 'grayscale(100%) contrast(115%) brightness(1.08)';
  }
  drawCoverImage(
    context,
    heroMedia,
    heroMediaWidth,
    heroMediaHeight,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    imageScale,
    imageOffsetX,
    imageOffsetY
  );
  if (isUrgentTemplate && 'filter' in context) {
    context.filter = 'none';
  }

  const bottomGradient = context.createLinearGradient(0, CANVAS_HEIGHT - 520, 0, CANVAS_HEIGHT);
  if (footerGradient === 'light') {
    bottomGradient.addColorStop(0, 'rgba(255,255,255,0)');
    bottomGradient.addColorStop(0.34, 'rgba(255,255,255,0.62)');
    bottomGradient.addColorStop(1, 'rgba(255,255,255,0.98)');
  } else {
    bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGradient.addColorStop(0.35, 'rgba(0,0,0,0.5)');
    bottomGradient.addColorStop(1, 'rgba(0,0,0,0.95)');
  }
  context.fillStyle = bottomGradient;
  context.fillRect(0, CANVAS_HEIGHT - 520, CANVAS_WIDTH, 520);

  if (template === 'clean') {
    context.fillStyle = 'rgba(255,255,255,0.08)';
    context.fillRect(40, 40, CANVAS_WIDTH - 80, CANVAS_HEIGHT - 80);
  }

  if (logoImage) {
    const preparedLogo = makeNearBlackTransparent(logoImage);
    const sourceWidth = 'naturalWidth' in preparedLogo ? preparedLogo.naturalWidth : preparedLogo.width;
    const sourceHeight = 'naturalHeight' in preparedLogo ? preparedLogo.naturalHeight : preparedLogo.height;
    const maxLogoWidth = 360 * (logoSize / 100);
    const maxLogoHeight = 130 * (logoSize / 100);
    const logoRatio = sourceWidth / sourceHeight;
    let logoWidth = maxLogoWidth;
    let logoHeight = logoWidth / logoRatio;

    if (logoHeight > maxLogoHeight) {
      logoHeight = maxLogoHeight;
      logoWidth = logoHeight * logoRatio;
    }

    const baseLogoX =
      logoPosition === 'left'
        ? 44
        : logoPosition === 'center'
          ? (CANVAS_WIDTH - logoWidth) / 2
          : CANVAS_WIDTH - logoWidth - 44;
    const logoX = Math.max(12, Math.min(CANVAS_WIDTH - logoWidth - 12, baseLogoX + logoOffsetX));

    const logoY = Math.max(12, 38 + logoOffsetY);
    context.drawImage(preparedLogo, logoX, logoY, logoWidth, logoHeight);
  }

  context.save();
  context.globalAlpha = introFrameStyle.alpha;
  context.translate(introFrameStyle.translateX, introFrameStyle.translateY);
  context.scale(introFrameStyle.scale, introFrameStyle.scale);
  const categoryX = 72;
  const categoryY = template === 'clean' ? 860 : 900;
  let titleStartY = categoryY + 68;

  if (showCategory) {
    const safeCategoryFontSize = Math.max(18, Math.min(60, categoryFontSize));
    const safeCategoryPadding = Math.max(12, Math.min(60, categoryPadding));
    const safeCategoryRadius = Math.max(0, Math.min(60, categoryBorderRadius));
    context.font = `${categoryFontStyleParts.fontStyle} ${categoryFontStyleParts.fontWeight} ${safeCategoryFontSize}px ${categoryFontFamily}`;
    const categoryHeight = safeCategoryFontSize + safeCategoryPadding;
    const measuredCategoryWidth = context.measureText(categoryLabel.toUpperCase()).width + safeCategoryPadding * 2;
    const categoryWidth = Math.max(categoryHeight, Math.min(CANVAS_WIDTH - categoryX * 2, measuredCategoryWidth));
    context.fillStyle = isCategoryBackgroundTransparent ? 'rgba(255,255,255,0)' : categoryBackgroundColor;
    drawRoundedRect(context, categoryX, categoryY, categoryWidth, categoryHeight, safeCategoryRadius);
    context.lineWidth = 3;
    context.strokeStyle = categoryBorderColor;
    context.stroke();
    context.fillStyle = categoryTextColor;
    context.textBaseline = 'middle';
    context.fillText(categoryLabel.toUpperCase(), categoryX + safeCategoryPadding, categoryY + categoryHeight / 2 + 1);
    context.textBaseline = 'alphabetic';
    titleStartY = categoryY + categoryHeight + categoryTitleGap;
  }

  const wrappedTitle = wrapText(context, title, CANVAS_WIDTH - 144, 320, titleFontFamily, titleFontStyle, undefined, titleFont);
  context.fillStyle = footerGradient === 'light' ? '#111111' : '#FFFFFF';
  context.font = `${fontStyleParts.fontStyle} ${fontStyleParts.fontWeight} ${wrappedTitle.fontSize}px ${titleFontFamily}`;

  const titleAlignX = titleAlign === 'center' ? CANVAS_WIDTH / 2 : titleAlign === 'right' ? CANVAS_WIDTH - 72 : 72;
  context.textAlign = titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'right' : 'left';
  wrappedTitle.lines.forEach((line, index) => {
    context.fillText(line, titleAlignX, titleStartY + index * wrappedTitle.lineHeight);
  });
  context.textAlign = 'start';

  if (socialBadges.length > 0) {
    const socialTextColor = footerGradient === 'light' ? '#111111' : '#FFFFFF';
    // A margem inferior considera a altura do selo (badge) para a linha não
    // ser cortada, mesmo quando o usuário arrasta o controle de posição
    // vertical para o valor máximo (mais perto da borda do card).
    const socialBadgeSize = Math.max(16, Math.min(64, socialFontSize)) * 1.55;
    const socialBottomMargin = socialBadgeSize + 24;
    const socialStartY = Math.min(
      titleStartY + wrappedTitle.lines.length * wrappedTitle.lineHeight + 36 + socialOffsetY,
      CANVAS_HEIGHT - socialBottomMargin
    );
    drawSocialLinksRow(
      context,
      socialBadges,
      socialIconImages,
      categoryX + socialOffsetX,
      socialStartY,
      CANVAS_WIDTH - categoryX * 2,
      socialTextColor,
      getFontFamily(socialFont),
      socialFontSize,
      socialAlign
    );
  }

  context.restore();
}

function drawColumnTemplate(
  context: CanvasRenderingContext2D,
  title: string,
  heroMedia: CanvasImageSource,
  heroMediaWidth: number,
  heroMediaHeight: number,
  logoImage: HTMLImageElement | null,
  columnistName: string,
  columnistAvatar: CanvasImageSource | null,
  logoPosition: LogoPosition,
  logoSize: number,
  logoOffsetX: number,
  logoOffsetY: number,
  imageScale: number,
  imageOffsetX: number,
  imageOffsetY: number,
  titleFontFamily: string,
  titleFont: TitleFont,
  titleFontStyle: TitleFontStyle,
  titleSize: number,
  titleOffsetX: number,
  titleOffsetY: number,
  accentOffsetX: number,
  accentOffsetY: number
) {
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (logoImage) {
    const preparedLogoSource = makeNearBlackTransparent(logoImage);
    const preparedLogo =
      preparedLogoSource instanceof HTMLCanvasElement
        ? cropTransparentImage(preparedLogoSource)
        : preparedLogoSource;
    const logoRatio = preparedLogo.width / preparedLogo.height;
    let logoWidth = Math.min(190 * (logoSize / 100), 230);
    let logoHeight = logoWidth / logoRatio;
    if (logoHeight > 72) {
      logoHeight = 72;
      logoWidth = logoHeight * logoRatio;
    }
    const logoX = Math.max(12, Math.min(CANVAS_WIDTH - logoWidth - 12, 58 + logoOffsetX));
    const logoY = Math.max(12, 26 + logoOffsetY);
    context.drawImage(preparedLogo, logoX, logoY, logoWidth, logoHeight);
  }
  const categoryY = 166;
  context.fillStyle = CARD_ACCENT_RED;
  context.font = '800 26px Arial, sans-serif';
  context.fillText('COLUNAS', 58, categoryY);
  context.fillStyle = '#9CA3AF';
  context.fillRect(58, categoryY + 19, 120, 4);
  context.fillStyle = '#242424';
  context.font = '700 34px Georgia, Times New Roman, serif';
  context.fillText(columnistName || 'Colunista RBN', 58, categoryY + 54);
  const avatarX = CANVAS_WIDTH - 218;
  const avatarY = 58;
  context.save();
  context.beginPath();
  context.arc(avatarX + 82, avatarY + 82, 82, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = '#E5E7EB';
  context.fillRect(avatarX, avatarY, 164, 164);
  if (columnistAvatar) {
    context.filter = 'grayscale(100%) contrast(112%) brightness(0.94)';
    const avatarWidth = 'naturalWidth' in columnistAvatar ? columnistAvatar.naturalWidth : 'width' in columnistAvatar ? columnistAvatar.width : 1;
    const avatarHeight = 'naturalHeight' in columnistAvatar ? columnistAvatar.naturalHeight : 'height' in columnistAvatar ? columnistAvatar.height : 1;
    drawCoverImage(context, columnistAvatar, Number(avatarWidth), Number(avatarHeight), avatarX, avatarY, 164, 164, 1, 0, 0);
    context.filter = 'none';
  }
  context.restore();
  context.lineWidth = 8;
  context.strokeStyle = '#FFFFFF';
  context.beginPath();
  context.arc(avatarX + 82, avatarY + 82, 82, 0, Math.PI * 2);
  context.stroke();
  drawCoverImage(context, heroMedia, heroMediaWidth, heroMediaHeight, 0, 300, CANVAS_WIDTH, 680, imageScale, imageOffsetX, imageOffsetY);
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 980, CANVAS_WIDTH, 370);
  const titleStyle = getEffectiveFontStyleParts(titleFont, titleFontStyle);
  const titleFontSize = Math.max(24, Math.min(120, titleSize));
  context.font = `${titleStyle.fontStyle} ${titleStyle.fontWeight} ${titleFontSize}px ${titleFontFamily}`;
  const wrappedTitle = wrapText(context, title || 'Título da coluna', CANVAS_WIDTH - 116, 300, titleFontFamily, titleFontStyle, titleFontSize, titleFont);
  context.fillStyle = '#1F2937';
  context.font = `${titleStyle.fontStyle} ${titleStyle.fontWeight} ${titleFontSize}px ${titleFontFamily}`;
  const titleX = Math.max(24, Math.min(CANVAS_WIDTH - 70, 58 + titleOffsetX));
  const titleY = Math.max(1010, Math.min(1320, 1080 + titleOffsetY));
  wrappedTitle.lines.forEach((line, index) => context.fillText(line, titleX, titleY + index * wrappedTitle.lineHeight));
  context.fillStyle = CARD_ACCENT_RED;
  const accentX = Math.max(12, Math.min(CANVAS_WIDTH - 132, titleX + accentOffsetX));
  const accentY = Math.max(990, Math.min(1338, titleY - wrappedTitle.lineHeight - 18 + accentOffsetY));
  context.fillRect(accentX, accentY, 120, 6);
}

function drawMemorialTemplate(
  context: CanvasRenderingContext2D,
  heroMedia: CanvasImageSource,
  heroMediaWidth: number,
  heroMediaHeight: number,
  logoImage: HTMLImageElement | null,
  logoPosition: LogoPosition,
  logoSize: number,
  logoOffsetX: number,
  logoOffsetY: number,
  fullName: string,
  profession: string,
  birthDate: string,
  deathDate: string,
  titleFont: TitleFont,
  titleFontStyle: TitleFontStyle,
  imageScale: number,
  imageOffsetX: number,
  imageOffsetY: number
) {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const titleFontFamily = getFontFamily(titleFont);
  const fontStyleParts = getEffectiveFontStyleParts(titleFont, titleFontStyle);

  context.save();
  if ('filter' in context) {
    context.filter = 'grayscale(100%) contrast(112%) brightness(0.82)';
  }

  drawCoverImage(
    context,
    heroMedia,
    heroMediaWidth,
    heroMediaHeight,
    0,
    0,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    imageScale,
    imageOffsetX,
    imageOffsetY
  );
  context.restore();

  const overlayGradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  overlayGradient.addColorStop(0, 'rgba(5,5,5,0.78)');
  overlayGradient.addColorStop(0.38, 'rgba(8,8,8,0.34)');
  overlayGradient.addColorStop(1, 'rgba(0,0,0,0.9)');
  context.fillStyle = overlayGradient;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (logoImage) {
    const preparedLogo = makeNearBlackTransparent(logoImage);
    const sourceWidth = 'naturalWidth' in preparedLogo ? preparedLogo.naturalWidth : preparedLogo.width;
    const sourceHeight = 'naturalHeight' in preparedLogo ? preparedLogo.naturalHeight : preparedLogo.height;
    const maxLogoWidth = 400 * (logoSize / 100);
    const maxLogoHeight = 138 * (logoSize / 100);
    const logoRatio = sourceWidth / sourceHeight;
    let logoWidth = maxLogoWidth;
    let logoHeight = logoWidth / logoRatio;

    if (logoHeight > maxLogoHeight) {
      logoHeight = maxLogoHeight;
      logoWidth = logoHeight * logoRatio;
    }

    const baseLogoX =
      logoPosition === 'left'
        ? 44
        : logoPosition === 'center'
          ? (CANVAS_WIDTH - logoWidth) / 2
          : CANVAS_WIDTH - logoWidth - 44;
    const logoX = Math.max(12, Math.min(CANVAS_WIDTH - logoWidth - 12, baseLogoX + logoOffsetX));
    const logoY = Math.max(12, 76 + logoOffsetY);
    context.drawImage(preparedLogo, logoX, logoY, logoWidth, logoHeight);
  }

  context.textAlign = 'center';
  const normalizedName = fullName.trim().toUpperCase();
  const normalizedProfession = profession.trim().toUpperCase();
  const yearsLine = formatMemorialYears(birthDate, deathDate);

  const wrappedName = wrapText(context, normalizedName, CANVAS_WIDTH - 180, 260, titleFontFamily, titleFontStyle, undefined, titleFont);
  context.fillStyle = '#FFFFFF';
  context.font = `${fontStyleParts.fontStyle} ${fontStyleParts.fontWeight} ${wrappedName.fontSize}px ${titleFontFamily}`;
  const nameStartY = 920;

  wrappedName.lines.forEach((line, index) => {
    context.fillText(line, CANVAS_WIDTH / 2, nameStartY + index * wrappedName.lineHeight);
  });

  const professionY = nameStartY + wrappedName.lines.length * wrappedName.lineHeight + 48;
  context.fillStyle = 'rgba(255,255,255,0.82)';
  context.font = `600 32px ${titleFontFamily}`;
  context.fillText(normalizedProfession, CANVAS_WIDTH / 2, professionY);

  context.fillStyle = '#FFFFFF';
  context.font = '500 36px Georgia, Times New Roman, serif';
  context.fillText(yearsLine, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 110);
  context.textAlign = 'start';
}

export default function GeradorCardPage() {
  const { articles, isLoaded } = useArticles();
  const { users } = useUsers();
  const [cardKind, setCardKind] = useState<CardKind>('news');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [selectedColumnistId, setSelectedColumnistId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [showCategory, setShowCategory] = useState(true);
  const [memorialFullName, setMemorialFullName] = useState('');
  const [memorialProfession, setMemorialProfession] = useState('');
  const [memorialBirthDate, setMemorialBirthDate] = useState('');
  const [memorialDeathDate, setMemorialDeathDate] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplate>('editorial');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [titleFont, setTitleFont] = useState<TitleFont>('arial');
  const [titleFontStyle, setTitleFontStyle] = useState<TitleFontStyle>('bold');
  const [titleAlign, setTitleAlign] = useState<TitleAlign>('left');
  const [logoPosition, setLogoPosition] = useState<LogoPosition>('right');
  const [logoSize, setLogoSize] = useState(100);
  const [logoOffsetX, setLogoOffsetX] = useState(0);
  const [logoOffsetY, setLogoOffsetY] = useState(0);
  const [columnTitleSize, setColumnTitleSize] = useState(64);
  const [columnTitleOffsetX, setColumnTitleOffsetX] = useState(0);
  const [columnTitleOffsetY, setColumnTitleOffsetY] = useState(0);
  const [columnAccentOffsetX, setColumnAccentOffsetX] = useState(0);
  const [columnAccentOffsetY, setColumnAccentOffsetY] = useState(0);
  const [introAnimation, setIntroAnimation] = useState<IntroAnimation>('fade-up');
  const [headerTheme, setHeaderTheme] = useState<HeaderTheme>('black');
  const [footerGradient, setFooterGradient] = useState<FooterGradient>('dark');
  const [imageScale, setImageScale] = useState(1);
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);
  const [categoryBackgroundColor, setCategoryBackgroundColor] = useState(CARD_ACCENT_RED);
  const [isCategoryBackgroundTransparent, setIsCategoryBackgroundTransparent] = useState(false);
  const [categoryTextColor, setCategoryTextColor] = useState('#FFFFFF');
  const [categoryBorderColor, setCategoryBorderColor] = useState(CARD_ACCENT_RED);
  const [categoryFont, setCategoryFont] = useState<TitleFont>('montserrat-semibold');
  const [categoryFontStyle, setCategoryFontStyle] = useState<TitleFontStyle>('regular');
  const [categoryFontSize, setCategoryFontSize] = useState(30);
  const [categoryPadding, setCategoryPadding] = useState(26);
  const [categoryBorderRadius, setCategoryBorderRadius] = useState(18);
  const [categoryTitleGap, setCategoryTitleGap] = useState(88);
  const [customImageDataUrl, setCustomImageDataUrl] = useState('');
  const [customImageName, setCustomImageName] = useState('');
  const [customVideoUrl, setCustomVideoUrl] = useState('');
  const [customVideoName, setCustomVideoName] = useState('');
  const [videoSourceDuration, setVideoSourceDuration] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimDuration, setVideoTrimDuration] = useState(15);
  const [cardOverlayMode, setCardOverlayMode] = useState<CardOverlayMode>('full');
  const [cardOverlayStart, setCardOverlayStart] = useState(0);
  const [cardOverlayEnd, setCardOverlayEnd] = useState(5);
  const [socialLinks, setSocialLinks] = useState<SocialLinksState>(() => readSocialLinksFromStorage());
  const [socialFont, setSocialFont] = useState<TitleFont>('montserrat-semibold');
  const [socialFontSize, setSocialFontSize] = useState(28);
  const [socialOffsetX, setSocialOffsetX] = useState(0);
  const [socialOffsetY, setSocialOffsetY] = useState(0);
  const [socialAlign, setSocialAlign] = useState<TitleAlign>('left');
  const [socialIconImages, setSocialIconImages] = useState<Partial<Record<SocialPlatformKey, HTMLImageElement>>>({});
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedPresets, setSavedPresets] = useState<CardGeneratorPreset[]>(() => readCardPresetsFromStorage());
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetMessage, setPresetMessage] = useState('');
  const previewRequestIdRef = useRef(0);
  const uploadedVideoUrlRef = useRef<string | null>(null);
  const generatedVideoUrlRef = useRef<string | null>(null);
  const initializedArticleIdRef = useRef<string | null>(null);

  const selectableArticles = useMemo(
    () =>
      [...articles]
        .filter((article) => article.status === 'publicado' || article.status === 'agendado' || article.status === 'rascunho')
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [articles]
  );
  const selectableColumnists = useMemo(
    () => users
      .filter((user) => user.status !== 'removido' && user.isColumnist && user.profileVisible !== false)
      .sort((left, right) => (left.publicName || left.name).localeCompare(right.publicName || right.name)),
    [users]
  );
  const selectedColumnist = selectableColumnists.find((user) => user.id === selectedColumnistId) ?? null;

  useEffect(() => {
    if (!selectedArticleId && selectableArticles.length > 0) {
      setSelectedArticleId(selectableArticles[0].id);
    }
  }, [selectedArticleId, selectableArticles]);

  const selectedArticle = useMemo(
    () => selectableArticles.find((article) => article.id === selectedArticleId) ?? null,
    [selectableArticles, selectedArticleId]
  );

  useEffect(() => {
    if (!selectedArticleId) {
      initializedArticleIdRef.current = null;
      if (uploadedVideoUrlRef.current) {
        URL.revokeObjectURL(uploadedVideoUrlRef.current);
        uploadedVideoUrlRef.current = null;
      }
      if (generatedVideoUrlRef.current) {
        URL.revokeObjectURL(generatedVideoUrlRef.current);
        generatedVideoUrlRef.current = null;
      }
      setCustomTitle('');
      setCustomCategory('');
      setShowCategory(true);
      setMemorialFullName('');
      setMemorialProfession('');
      setMemorialBirthDate('');
      setMemorialDeathDate('');
      setCustomImageDataUrl('');
      setCustomImageName('');
      setCustomVideoUrl('');
      setCustomVideoName('');
      setVideoSourceDuration(0);
      setVideoTrimStart(0);
      setVideoTrimDuration(15);
      setCardOverlayMode('full');
      setCardOverlayStart(0);
      setCardOverlayEnd(5);
      return;
    }

    if (initializedArticleIdRef.current === selectedArticleId) {
      return;
    }

    if (!selectedArticle) {
      return;
    }

    initializedArticleIdRef.current = selectedArticleId;

    if (uploadedVideoUrlRef.current) {
      URL.revokeObjectURL(uploadedVideoUrlRef.current);
      uploadedVideoUrlRef.current = null;
    }
    if (generatedVideoUrlRef.current) {
      URL.revokeObjectURL(generatedVideoUrlRef.current);
      generatedVideoUrlRef.current = null;
    }
    setCustomTitle(selectedArticle.title);
    setCustomCategory(getCategoryDisplayName(selectedArticle.category));
    setShowCategory(true);
    setCustomImageDataUrl('');
    setCustomImageName('');
    setCustomVideoUrl('');
    setCustomVideoName('');
    setVideoSourceDuration(0);
    setVideoTrimStart(0);
    setVideoTrimDuration(15);
    setCardOverlayMode('full');
    setCardOverlayStart(0);
    setCardOverlayEnd(5);
    setPreviewUrl('');
    setPreviewKind(null);
    setImageScale(1);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setErrorMessage('');
  }, [selectedArticleId, selectedArticle]);

  useEffect(() => {
    if (cardKind === 'memorial') {
      if (uploadedVideoUrlRef.current) {
        URL.revokeObjectURL(uploadedVideoUrlRef.current);
        uploadedVideoUrlRef.current = null;
      }
      if (generatedVideoUrlRef.current) {
        URL.revokeObjectURL(generatedVideoUrlRef.current);
        generatedVideoUrlRef.current = null;
      }
      setCustomVideoUrl('');
      setCustomVideoName('');
      setVideoSourceDuration(0);
      setVideoTrimStart(0);
      setVideoTrimDuration(15);
      setCardOverlayMode('full');
      setCardOverlayStart(0);
      setCardOverlayEnd(5);
      setPreviewKind(null);
      setErrorMessage('');
    }
  }, [cardKind]);

  useEffect(() => {
    setSavedPresets(readCardPresetsFromStorage());

    const syncPresetsFromStorage = (event: StorageEvent) => {
      if (event.key && event.key !== CARD_PRESETS_STORAGE_KEY) {
        return;
      }

      setSavedPresets(readCardPresetsFromStorage());
    };

    window.addEventListener('storage', syncPresetsFromStorage);
    return () => window.removeEventListener('storage', syncPresetsFromStorage);
  }, []);

  useEffect(() => {
    return () => {
      if (uploadedVideoUrlRef.current) {
        URL.revokeObjectURL(uploadedVideoUrlRef.current);
      }

      if (generatedVideoUrlRef.current) {
        URL.revokeObjectURL(generatedVideoUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    writeSocialLinksToStorage(socialLinks);
  }, [socialLinks]);

  useEffect(() => {
    let isMounted = true;
    loadSocialIconImages()
      .then((images) => {
        if (isMounted) {
          setSocialIconImages(images);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const categoryLabel = customCategory.trim() || (selectedArticle ? getCategoryDisplayName(selectedArticle.category) : 'Geral');
  const isColumnCard = cardKind === 'column';
  const isMemorialCard = cardKind === 'memorial';
  const isNewsCard = !isColumnCard && !isMemorialCard;
  const isVideoSource = !isMemorialCard && !isColumnCard && Boolean(customVideoUrl);
  const currentImageSource = isMemorialCard
    ? customImageDataUrl
    : customImageDataUrl || (selectedArticle ? `/api/article-image?id=${selectedArticle.id}` : '');
  const currentSourceLabel = isMemorialCard
    ? customImageName || 'Enviar foto da pessoa'
    : isColumnCard
      ? customImageName || (selectedArticle ? 'Imagem principal da matéria' : 'Enviar imagem principal')
    : customVideoName || customImageName || 'Midia da materia';
  const memorialYearsLabel = formatMemorialYears(memorialBirthDate, memorialDeathDate);
  const effectiveVideoTrim = clampVideoTrim(videoTrimStart, videoTrimDuration, videoSourceDuration);
  const effectiveVideoTrimEnd = Math.min(videoSourceDuration, effectiveVideoTrim.startTime + effectiveVideoTrim.clipDuration);
  const trimStartPercent = videoSourceDuration > 0 ? (effectiveVideoTrim.startTime / videoSourceDuration) * 100 : 0;
  const trimEndPercent = videoSourceDuration > 0 ? (effectiveVideoTrimEnd / videoSourceDuration) * 100 : 0;
  const effectiveCardOverlayWindow = useMemo(
    () =>
      cardOverlayMode === 'full'
        ? { start: 0, end: effectiveVideoTrim.clipDuration }
        : clampOverlayWindow(cardOverlayStart, cardOverlayEnd, effectiveVideoTrim.clipDuration),
    [cardOverlayMode, cardOverlayStart, cardOverlayEnd, effectiveVideoTrim.clipDuration]
  );
  const socialBadgeEntries = useMemo<SocialBadgeEntry[]>(
    () =>
      SOCIAL_PLATFORM_ORDER.filter((platform) => socialLinks[platform].enabled && socialLinks[platform].value.trim().length > 0).map(
        (platform) => ({
          platform,
          text: socialLinks[platform].value.trim(),
          color: SOCIAL_PLATFORM_META[platform].color,
        })
      ),
    [socialLinks]
  );
  const videoTimelineMarkers = useMemo(() => {
    if (videoSourceDuration <= 0) {
      return [];
    }

    const markerCount = Math.min(8, Math.max(4, Math.ceil(videoSourceDuration / 20)));
    return Array.from({ length: markerCount + 1 }, (_, index) => {
      const ratio = index / markerCount;
      return {
        label: formatSecondsLabel(videoSourceDuration * ratio),
        percent: ratio * 100,
      };
    });
  }, [videoSourceDuration]);

  const currentPresetConfig = useMemo(
    () => ({
      cardKind,
      selectedTemplate,
      exportFormat,
      titleFont,
      titleFontStyle,
      titleAlign,
      logoPosition,
      logoSize,
      logoOffsetX,
      logoOffsetY,
      columnTitleSize,
      columnTitleOffsetX,
      columnTitleOffsetY,
      columnAccentOffsetX,
      columnAccentOffsetY,
      introAnimation,
      headerTheme,
      footerGradient,
      showCategory,
      isCategoryBackgroundTransparent,
      categoryBackgroundColor,
      categoryTextColor,
      categoryBorderColor,
      categoryFont,
      categoryFontStyle,
      categoryFontSize,
      categoryPadding,
      categoryBorderRadius,
      categoryTitleGap,
      imageScale,
      imageOffsetX,
      imageOffsetY,
    }),
    [
      cardKind,
      selectedTemplate,
      exportFormat,
      titleFont,
      titleFontStyle,
      titleAlign,
      logoPosition,
      logoSize,
      logoOffsetX,
      logoOffsetY,
      columnTitleSize,
      columnTitleOffsetX,
      columnTitleOffsetY,
      columnAccentOffsetX,
      columnAccentOffsetY,
      introAnimation,
      headerTheme,
      footerGradient,
      showCategory,
      isCategoryBackgroundTransparent,
      categoryBackgroundColor,
      categoryTextColor,
      categoryBorderColor,
      categoryFont,
      categoryFontStyle,
      categoryFontSize,
      categoryPadding,
      categoryBorderRadius,
      categoryTitleGap,
      imageScale,
      imageOffsetX,
      imageOffsetY,
    ]
  );

  const persistPresets = (nextPresets: CardGeneratorPreset[]) => {
    try {
      writeCardPresetsToStorage(nextPresets);
      setSavedPresets(nextPresets);
    } catch {
      setErrorMessage('Nao foi possivel salvar as predefinicoes do gerador de card.');
    }
  };

  const applyPreset = (preset: CardGeneratorPreset) => {
    setCardKind(preset.config.cardKind);
    setSelectedTemplate(preset.config.selectedTemplate);
    setExportFormat(preset.config.exportFormat);
    setTitleFont(preset.config.titleFont);
    setTitleFontStyle(preset.config.titleFontStyle);
    setTitleAlign(preset.config.titleAlign ?? 'left');
    setLogoPosition(preset.config.logoPosition);
    setLogoSize(typeof preset.config.logoSize === 'number' && Number.isFinite(preset.config.logoSize) ? preset.config.logoSize : 100);
    setLogoOffsetX(typeof preset.config.logoOffsetX === 'number' && Number.isFinite(preset.config.logoOffsetX) ? preset.config.logoOffsetX : 0);
    setLogoOffsetY(typeof preset.config.logoOffsetY === 'number' && Number.isFinite(preset.config.logoOffsetY) ? preset.config.logoOffsetY : 0);
    setColumnTitleSize(typeof preset.config.columnTitleSize === 'number' && Number.isFinite(preset.config.columnTitleSize) ? preset.config.columnTitleSize : 64);
    setColumnTitleOffsetX(typeof preset.config.columnTitleOffsetX === 'number' && Number.isFinite(preset.config.columnTitleOffsetX) ? preset.config.columnTitleOffsetX : 0);
    setColumnTitleOffsetY(typeof preset.config.columnTitleOffsetY === 'number' && Number.isFinite(preset.config.columnTitleOffsetY) ? preset.config.columnTitleOffsetY : 0);
    setColumnAccentOffsetX(typeof preset.config.columnAccentOffsetX === 'number' && Number.isFinite(preset.config.columnAccentOffsetX) ? preset.config.columnAccentOffsetX : 0);
    setColumnAccentOffsetY(typeof preset.config.columnAccentOffsetY === 'number' && Number.isFinite(preset.config.columnAccentOffsetY) ? preset.config.columnAccentOffsetY : 0);
    setIntroAnimation(preset.config.introAnimation);
    setHeaderTheme(preset.config.headerTheme);
    setFooterGradient(preset.config.footerGradient);
    setShowCategory(preset.config.showCategory);
    setIsCategoryBackgroundTransparent(preset.config.isCategoryBackgroundTransparent);
    setCategoryBackgroundColor(preset.config.categoryBackgroundColor);
    setCategoryTextColor(preset.config.categoryTextColor);
    setCategoryBorderColor(preset.config.categoryBorderColor);
    // Predefinicoes salvas antes desta atualizacao nao tem esses campos.
    // Nesse caso, reproduzimos exatamente o visual antigo da etiqueta
    // (mesma fonte do titulo, negrito, 30px, 26px de espacamento e cantos
    // totalmente arredondados) em vez de assumir o novo padrao Montserrat,
    // para nao alterar o resultado de predefinicoes ja salvas.
    setCategoryFont(preset.config.categoryFont ?? preset.config.titleFont);
    setCategoryFontStyle(preset.config.categoryFontStyle ?? 'bold');
    setCategoryFontSize(typeof preset.config.categoryFontSize === 'number' && Number.isFinite(preset.config.categoryFontSize) ? preset.config.categoryFontSize : 30);
    setCategoryPadding(typeof preset.config.categoryPadding === 'number' && Number.isFinite(preset.config.categoryPadding) ? preset.config.categoryPadding : 26);
    setCategoryBorderRadius(typeof preset.config.categoryBorderRadius === 'number' && Number.isFinite(preset.config.categoryBorderRadius) ? preset.config.categoryBorderRadius : 29);
    setCategoryTitleGap(typeof preset.config.categoryTitleGap === 'number' && Number.isFinite(preset.config.categoryTitleGap) ? preset.config.categoryTitleGap : 88);
    setImageScale(preset.config.imageScale);
    setImageOffsetX(preset.config.imageOffsetX);
    setImageOffsetY(preset.config.imageOffsetY);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setPresetMessage(`Predefinicao "${preset.name}" aplicada.`);
    setErrorMessage('');
  };

  const handleSavePreset = () => {
    const normalizedName = presetName.trim();
    if (!normalizedName) {
      setErrorMessage('Informe um nome para salvar a predefinicao.');
      return;
    }

    const now = new Date().toISOString();
    const existingPreset = savedPresets.find((preset) => preset.id === selectedPresetId) ?? savedPresets.find((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase());

    const nextPreset: CardGeneratorPreset = {
      id: existingPreset?.id ?? `${Date.now()}`,
      name: normalizedName,
      createdAt: existingPreset?.createdAt ?? now,
      updatedAt: now,
      config: currentPresetConfig,
    };

    const nextPresets = existingPreset
      ? savedPresets.map((preset) => (preset.id === existingPreset.id ? nextPreset : preset))
      : [nextPreset, ...savedPresets];

    persistPresets(nextPresets);
    setSelectedPresetId(nextPreset.id);
    setPresetName(nextPreset.name);
    setPresetMessage(existingPreset ? `Predefinicao "${nextPreset.name}" atualizada.` : `Predefinicao "${nextPreset.name}" salva.`);
    setErrorMessage('');
  };

  const handleApplySelectedPreset = () => {
    const preset = savedPresets.find((currentPreset) => currentPreset.id === selectedPresetId);
    if (!preset) {
      setErrorMessage('Selecione uma predefinicao para usar.');
      return;
    }

    applyPreset(preset);
  };

  const handleDeleteSelectedPreset = () => {
    const preset = savedPresets.find((currentPreset) => currentPreset.id === selectedPresetId);
    if (!preset) {
      setErrorMessage('Selecione uma predefinicao para excluir.');
      return;
    }

    const nextPresets = savedPresets.filter((currentPreset) => currentPreset.id !== preset.id);
    persistPresets(nextPresets);
    setSelectedPresetId('');
    setPresetName('');
    setPresetMessage(`Predefinicao "${preset.name}" removida.`);
    setErrorMessage('');
  };

  const handleMediaUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage('');
    setPreviewKind(null);

    if (generatedVideoUrlRef.current) {
      URL.revokeObjectURL(generatedVideoUrlRef.current);
      generatedVideoUrlRef.current = null;
    }

    if (file.type.startsWith('video/')) {
      if (isMemorialCard) {
        setErrorMessage('O modelo de luto/falecimento usa somente foto.');
        return;
      }

      if (uploadedVideoUrlRef.current) {
        URL.revokeObjectURL(uploadedVideoUrlRef.current);
      }

      const objectUrl = URL.createObjectURL(file);
      uploadedVideoUrlRef.current = objectUrl;
      setCustomVideoUrl(objectUrl);
      setCustomVideoName(file.name);
      setCustomImageDataUrl('');
      setCustomImageName('');
      setImageScale(1);
      setImageOffsetX(0);
      setImageOffsetY(0);
      void loadVideo(objectUrl)
        .then((video) => {
          const safeDuration =
            Number.isFinite(video.duration) && video.duration > 0
              ? Math.min(video.duration, VIDEO_EXPORT_MAX_DURATION_SECONDS)
              : 15;
          setVideoSourceDuration(safeDuration);
          setVideoTrimStart(0);
          setVideoTrimDuration(Math.min(15, Math.max(1, safeDuration)));
          setCardOverlayMode('full');
          setCardOverlayStart(0);
          setCardOverlayEnd(5);
        })
        .catch(() => {
          setVideoSourceDuration(0);
          setVideoTrimStart(0);
          setVideoTrimDuration(15);
          setCardOverlayMode('full');
          setCardOverlayStart(0);
          setCardOverlayEnd(5);
        });
      return;
    }

    if (uploadedVideoUrlRef.current) {
      URL.revokeObjectURL(uploadedVideoUrlRef.current);
      uploadedVideoUrlRef.current = null;
    }

    setCustomVideoUrl('');
    setCustomVideoName('');
    setVideoSourceDuration(0);
    setVideoTrimStart(0);
    setVideoTrimDuration(15);
    setCardOverlayMode('full');
    setCardOverlayStart(0);
    setCardOverlayEnd(5);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImageDataUrl(reader.result);
        setCustomImageName(file.name);
        setImageScale(1);
        setImageOffsetX(0);
        setImageOffsetY(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const drawCurrentFrame = useCallback(
    (
      context: CanvasRenderingContext2D,
      heroMedia: CanvasImageSource,
      heroMediaWidth: number,
      heroMediaHeight: number,
      logoImage: HTMLImageElement | null,
      columnistAvatar: CanvasImageSource | null,
      animationProgress = 1
    ) => {
      if (isMemorialCard) {
        drawMemorialTemplate(
          context,
          heroMedia,
          heroMediaWidth,
          heroMediaHeight,
          logoImage,
          logoPosition,
          logoSize,
          logoOffsetX,
          logoOffsetY,
          memorialFullName,
          memorialProfession,
          memorialBirthDate,
          memorialDeathDate,
          titleFont,
          titleFontStyle,
          imageScale,
          imageOffsetX,
          imageOffsetY
        );
        return;
      }

      if (isColumnCard) {
        drawColumnTemplate(
          context,
          customTitle.trim(),
          heroMedia,
          heroMediaWidth,
          heroMediaHeight,
          logoImage,
          selectedColumnist ? (selectedColumnist.publicName || selectedColumnist.name) : '',
          columnistAvatar,
          logoPosition,
          logoSize,
          logoOffsetX,
          logoOffsetY,
          imageScale,
          imageOffsetX,
          imageOffsetY,
          getFontFamily(titleFont),
          titleFont,
          titleFontStyle,
          columnTitleSize,
          columnTitleOffsetX,
          columnTitleOffsetY,
          columnAccentOffsetX,
          columnAccentOffsetY
        );
        return;
      }

      drawTemplate(
        context,
        customTitle.trim() || selectedArticle?.title || '',
        categoryLabel,
        showCategory,
        heroMedia,
        heroMediaWidth,
        heroMediaHeight,
        logoImage,
        selectedTemplate,
        logoPosition,
        logoSize,
        logoOffsetX,
        logoOffsetY,
        headerTheme,
        footerGradient,
        imageScale,
        imageOffsetX,
        imageOffsetY,
        isCategoryBackgroundTransparent,
        categoryBackgroundColor,
        categoryTextColor,
        categoryBorderColor,
        categoryFont,
        categoryFontStyle,
        categoryFontSize,
        categoryPadding,
        categoryBorderRadius,
        categoryTitleGap,
        titleFont,
        titleFontStyle,
        titleAlign,
        introAnimation,
        animationProgress,
        socialBadgeEntries,
        socialIconImages,
        socialFont,
        socialFontSize,
        socialOffsetX,
        socialOffsetY,
        socialAlign
      );
    },
    [
      categoryBackgroundColor,
      categoryBorderColor,
      categoryLabel,
      categoryTextColor,
      categoryFont,
      categoryFontStyle,
      categoryFontSize,
      categoryPadding,
      categoryBorderRadius,
      categoryTitleGap,
      columnAccentOffsetX,
      columnAccentOffsetY,
      columnTitleOffsetX,
      columnTitleOffsetY,
      columnTitleSize,
      customTitle,
      footerGradient,
      headerTheme,
      imageOffsetX,
      imageOffsetY,
      imageScale,
      isMemorialCard,
      isColumnCard,
      introAnimation,
      isCategoryBackgroundTransparent,
      logoPosition,
      logoSize,
      logoOffsetX,
      logoOffsetY,
      memorialBirthDate,
      memorialDeathDate,
      memorialFullName,
      memorialProfession,
      showCategory,
      selectedArticle,
      selectedColumnist,
      selectedTemplate,
      socialBadgeEntries,
      socialIconImages,
      socialFont,
      socialFontSize,
      socialOffsetX,
      socialOffsetY,
      socialAlign,
      titleFont,
      titleFontStyle,
      titleAlign,
    ]
  );

  const generateStaticPreview = useCallback(async () => {
    await ensureCardFontsLoaded();
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Não foi possível iniciar o gerador da arte.');
    }

    const maybeLogoImage = await loadImage(CARD_LOGO_SRC)
      .catch(() => loadImage('/logo-oficial.png'))
      .catch(() => null);
    const maybeColumnistAvatar = isColumnCard && selectedColumnist?.avatar
      ? await loadImage(selectedColumnist.avatar).catch(() => null)
      : null;

    if (isVideoSource && customVideoUrl) {
      const heroVideo = await loadVideo(customVideoUrl);
      await seekVideo(heroVideo, effectiveVideoTrim.startTime);
      drawCurrentFrame(context, heroVideo, heroVideo.videoWidth, heroVideo.videoHeight, maybeLogoImage, maybeColumnistAvatar, 1);
      return canvas.toDataURL('image/png');
    }

    if (!currentImageSource) {
      throw new Error(isMemorialCard ? 'Envie a foto da pessoa para gerar o card de luto.' : 'Selecione uma notícia com imagem para gerar o card.');
    }

    const heroImage = await loadImage(currentImageSource);
    drawCurrentFrame(context, heroImage, heroImage.naturalWidth, heroImage.naturalHeight, maybeLogoImage, maybeColumnistAvatar, 1);
    const mimeType = isMemorialCard ? 'image/png' : exportFormat === 'png' ? 'image/png' : 'image/jpeg';
    const quality = isMemorialCard || exportFormat === 'png' ? undefined : 0.96;
    return canvas.toDataURL(mimeType, quality);
  }, [currentImageSource, customVideoUrl, drawCurrentFrame, effectiveVideoTrim.startTime, exportFormat, isColumnCard, isMemorialCard, isVideoSource, selectedColumnist]);

  const generateVideoPreview = useCallback(async () => {
    if (!customVideoUrl || !selectedArticle) {
      throw new Error('Envie um vídeo para gerar a versão em movimento do card.');
    }

    await ensureCardFontsLoaded();

    const mimeType = getVideoMimeType();
    if (!mimeType) {
      throw new Error('Seu navegador não suporta exportação de vídeo neste gerador.');
    }

    const [heroVideo, maybeLogoImage] = await Promise.all([
      loadVideo(customVideoUrl),
      loadImage(CARD_LOGO_SRC).catch(() => loadImage('/logo-oficial.png')).catch(() => null),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Não foi possível iniciar o render do vídeo.');
    }

    const durationSeconds = effectiveVideoTrim.clipDuration;

    const stream = canvas.captureStream(30);

    // O vídeo de origem fica silenciado (`video.muted = true`) para que o
    // usuário não ouça o áudio tocando durante a geração do card, mas o
    // `canvas.captureStream()` só carrega a trilha de vídeo — o áudio nunca
    // era incluído no stream gravado, por isso o card exportado saía mudo.
    // Para capturar o áudio sem precisar "des-silenciar" o elemento (e sem
    // reproduzi-lo pelas caixas de som), usamos o Web Audio API: conectamos
    // o vídeo a um nó de destino de stream sem ligá-lo à saída de áudio do
    // navegador, e anexamos a trilha de áudio resultante ao stream do canvas
    // antes de iniciar a gravação.
    let audioContext: AudioContext | null = null;
    let audioSourceNode: MediaElementAudioSourceNode | null = null;
    let audioDestinationNode: MediaStreamAudioDestinationNode | null = null;

    try {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => undefined);
        }
        audioSourceNode = audioContext.createMediaElementSource(heroVideo);
        audioDestinationNode = audioContext.createMediaStreamDestination();
        audioSourceNode.connect(audioDestinationNode);
        audioDestinationNode.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
    } catch {
      // Se o navegador não suportar o Web Audio API (ou o vídeo não tiver
      // áudio), a exportação segue normalmente, apenas sem som.
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];

    const videoBlobPromise = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => reject(new Error('Falha ao gravar o vídeo do card.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    heroVideo.currentTime = effectiveVideoTrim.startTime;
    // O elemento começa a tocar mudo (`muted = true`) porque os navegadores
    // bloqueiam a reprodução programática de vídeo com som sem um gesto do
    // usuário recente — e os `await`s acima (fontes, carregamento do vídeo)
    // podem consumir essa permissão antes de chegarmos aqui. Assim que o
    // `play()` é aceito, já estamos com o elemento conectado ao grafo de
    // Web Audio (a rota direta para as caixas de som já foi cortada), então
    // é seguro "desmutar" agora: isso não toca som nenhum pelo computador,
    // mas libera o volume efetivo que alimenta o nó de áudio capturado —
    // sem isso, a trilha gravada ficava sempre em silêncio.
    await heroVideo.play();
    if (audioSourceNode) {
      heroVideo.muted = false;
      heroVideo.volume = 1;
    }
    recorder.start(250);

    await new Promise<void>((resolve) => {
      const start = performance.now();
      // O canvas é capturado a 30fps (`canvas.captureStream(30)`), mas sem
      // um limite o `requestAnimationFrame` tentava redesenhar a cada
      // atualização de tela do navegador (normalmente 60fps ou mais). Como
      // cada frame refaz cálculos pesados (quebra de texto, selos de redes
      // sociais, gradientes), isso sobrecarregava a CPU e disputava tempo
      // com o codificador do `MediaRecorder`, causando o travamento/engasgo
      // percebido no vídeo exportado. Limitar o desenho a ~30fps alivia essa
      // disputa e elimina os engasgos.
      const targetFrameIntervalMs = 1000 / 30;
      let lastDrawTime = -Infinity;

      const renderFrame = (now: number) => {
        const elapsedSeconds = (now - start) / 1000;

        if (now - lastDrawTime >= targetFrameIntervalMs) {
          lastDrawTime = now;
          const withinOverlayWindow =
            elapsedSeconds >= effectiveCardOverlayWindow.start && elapsedSeconds <= effectiveCardOverlayWindow.end;

          if (withinOverlayWindow) {
            const introProgress = Math.min(
              (elapsedSeconds - effectiveCardOverlayWindow.start) / VIDEO_INTRO_DURATION_SECONDS,
              1
            );
            drawCurrentFrame(context, heroVideo, heroVideo.videoWidth, heroVideo.videoHeight, maybeLogoImage, null, introProgress);
          } else {
            context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            drawCoverImage(
              context,
              heroVideo,
              heroVideo.videoWidth,
              heroVideo.videoHeight,
              0,
              0,
              CANVAS_WIDTH,
              CANVAS_HEIGHT,
              imageScale,
              imageOffsetX,
              imageOffsetY
            );
          }
        }

        if (elapsedSeconds < durationSeconds && heroVideo.currentTime < effectiveVideoTrim.startTime + durationSeconds) {
          requestAnimationFrame(renderFrame);
          return;
        }

        heroVideo.pause();
        recorder.stop();
        resolve();
      };

      requestAnimationFrame(renderFrame);
    });

    audioSourceNode?.disconnect();
    audioDestinationNode?.disconnect();
    if (audioContext) {
      await audioContext.close().catch(() => undefined);
    }

    return videoBlobPromise;
  }, [
    customVideoUrl,
    drawCurrentFrame,
    effectiveCardOverlayWindow.end,
    effectiveCardOverlayWindow.start,
    effectiveVideoTrim.clipDuration,
    effectiveVideoTrim.startTime,
    imageOffsetX,
    imageOffsetY,
    imageScale,
    selectedArticle,
  ]);

  const generateCardPreview = useCallback(
    async (showLoading = false) => {
      const hasMemorialContent = Boolean(memorialFullName.trim() && memorialProfession.trim() && memorialBirthDate && memorialDeathDate && currentImageSource);
      const hasNewsContent = isColumnCard
        ? Boolean(selectedColumnist && currentImageSource)
        : Boolean(selectedArticle && (currentImageSource || isVideoSource));

      if ((isMemorialCard && !hasMemorialContent) || (!isMemorialCard && !hasNewsContent)) {
        setIsGenerating(false);
        setPreviewUrl('');
        setPreviewKind(null);
        setErrorMessage(
          isMemorialCard
            ? 'Preencha foto, nome, profissão, nascimento e falecimento para gerar o card de luto.'
            : isColumnCard
              ? 'Selecione um colunista e uma imagem principal para gerar o card de coluna.'
              : selectedArticle
                ? 'Selecione uma notícia com mídia para gerar o card.'
              : ''
        );
        return;
      }

      const previewRequestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = previewRequestId;

      if (showLoading) {
        setIsGenerating(true);
      }
      setErrorMessage('');

      try {
        if (generatedVideoUrlRef.current && (!isVideoSource || !showLoading)) {
          URL.revokeObjectURL(generatedVideoUrlRef.current);
          generatedVideoUrlRef.current = null;
        }

        if (isVideoSource && showLoading) {
          const videoBlob = await generateVideoPreview();
          if (previewRequestId !== previewRequestIdRef.current) {
            return;
          }

          const videoUrl = URL.createObjectURL(videoBlob);
          if (generatedVideoUrlRef.current) {
            URL.revokeObjectURL(generatedVideoUrlRef.current);
          }
          generatedVideoUrlRef.current = videoUrl;
          setPreviewUrl(videoUrl);
          setPreviewKind('video');
          return;
        }

        const nextPreviewUrl = await generateStaticPreview();
        if (previewRequestId !== previewRequestIdRef.current) {
          return;
        }

        setPreviewUrl(nextPreviewUrl);
        setPreviewKind('image');
      } catch (error) {
        if (previewRequestId !== previewRequestIdRef.current) {
          return;
        }

        console.error('[CARD_VIDEO_GENERATION]', error);
        const message = error instanceof Error
          ? error.message
          : typeof error === 'string' && error.trim()
            ? error
            : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()
              ? error.message
              : 'Não foi possível gerar o vídeo. Verifique o arquivo e tente novamente.';
        setErrorMessage(message);
      } finally {
        if (previewRequestId === previewRequestIdRef.current) {
          setIsGenerating(false);
        }
      }
    },
    [currentImageSource, generateStaticPreview, generateVideoPreview, isColumnCard, isMemorialCard, isVideoSource, memorialBirthDate, memorialDeathDate, memorialFullName, memorialProfession, selectedArticle, selectedColumnist]
  );

  const handleGenerateCard = useCallback(async () => {
    await generateCardPreview(true);
  }, [generateCardPreview]);

  useEffect(() => {
    const shouldPreviewMemorial = isMemorialCard
      ? Boolean(memorialFullName.trim() && memorialProfession.trim() && memorialBirthDate && memorialDeathDate && currentImageSource)
      : isColumnCard
        ? Boolean(selectedColumnist && currentImageSource)
        : Boolean(selectedArticle && (currentImageSource || isVideoSource));

    if (!shouldPreviewMemorial) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void generateCardPreview(false);
    }, isVideoSource ? 180 : 120);

    return () => window.clearTimeout(timeoutId);
  }, [currentImageSource, generateCardPreview, isColumnCard, isMemorialCard, isVideoSource, memorialBirthDate, memorialDeathDate, memorialFullName, memorialProfession, selectedArticle, selectedColumnist]);

  const handleDownloadCard = () => {
    if (!previewUrl || (!isMemorialCard && !isColumnCard && !selectedArticle) || (isColumnCard && !selectedColumnist)) {
      return;
    }

    if (isVideoSource && previewKind !== 'video') {
      setErrorMessage('Clique em "Gerar vídeo" para montar o vídeo completo antes de baixar.');
      return;
    }

    const link = document.createElement('a');
    link.href = previewUrl;
    const newsFileBaseName = selectedArticle ? `rbn-card-${selectedArticle.id}` : isColumnCard ? `rbn-card-coluna-${selectedColumnist?.id ?? 'rbn'}` : 'rbn-card';
    link.download = isVideoSource
      ? `${newsFileBaseName}.${VIDEO_EXPORT_EXTENSION}`
      : `${isMemorialCard ? 'rbn-card-luto' : newsFileBaseName}.${isMemorialCard || exportFormat === 'png' ? 'png' : 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 md:flex-row">
      <AdminSidebar />

      <main className="flex-1">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#991B1B]">Instagram</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">Gerador de Card</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Selecione a matéria, ajuste o título, troque a mídia se quiser e gere uma arte 1080 x 1350 pronta para publicação, inclusive vídeo WEBM sem conversão para MP4.
              </p>
            </div>
            <div className="rounded-2xl border border-[#991B1B]/15 bg-[#991B1B]/5 px-4 py-3 text-sm text-[#7F1D1D]">
              Fluxo: Publicar notícia → Gerar card → Baixar WEBM → Converter para MP4 e publicar
            </div>
          </div>

          {!isLoaded ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">Carregando notícias...</div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
              <section className="space-y-6 rounded-2xl bg-white p-5 shadow-sm">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Configuração</h2>
                  <p className="mt-1 text-sm text-gray-500">Monte o card com base na notícia cadastrada.</p>
                </div>

                <div className="space-y-4 rounded-2xl border border-[#991B1B]/15 bg-[#fff7f7] p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Predefinicoes salvas</p>
                    <p className="mt-1 text-xs text-gray-500">Guarde seu estilo favorito do card para reaplicar sempre que quiser.</p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="presetName" className="text-sm font-semibold text-gray-800">
                      Nome da predefinicao
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        id="presetName"
                        type="text"
                        value={presetName}
                        onChange={(event) => {
                          setPresetName(event.target.value);
                          setPresetMessage('');
                        }}
                        placeholder="Ex.: Padrao stories urgente"
                        className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      />
                      <button
                        type="button"
                        onClick={handleSavePreset}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#991B1B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7F1D1D]"
                      >
                        <Save className="h-4 w-4" />
                        Salvar
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="savedPreset" className="text-sm font-semibold text-gray-800">
                      Predefinicoes disponiveis
                    </label>
                    <select
                      id="savedPreset"
                      value={selectedPresetId}
                      onChange={(event) => {
                        const nextPresetId = event.target.value;
                        setSelectedPresetId(nextPresetId);
                        const selectedPreset = savedPresets.find((preset) => preset.id === nextPresetId);
                        setPresetName(selectedPreset?.name ?? '');
                        setPresetMessage('');
                      }}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                    >
                      <option value="">Selecione uma predefinicao salva</option>
                      {savedPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleApplySelectedPreset}
                        disabled={!selectedPresetId}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#991B1B]/20 bg-white px-4 py-3 text-sm font-semibold text-[#991B1B] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FolderOpen className="h-4 w-4" />
                        Usar predefinicao
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedPreset}
                        disabled={!selectedPresetId}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>
                  </div>

                  {presetMessage && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{presetMessage}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="cardKind" className="text-sm font-semibold text-gray-800">
                    Tipo de card
                  </label>
                  <select
                    id="cardKind"
                    value={cardKind}
                    onChange={(event) => setCardKind(event.target.value as CardKind)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  >
                    {cardKindOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    {cardKindOptions.find((option) => option.id === cardKind)?.description}
                  </p>
                </div>

                {!isMemorialCard ? (
                  <>
                {isColumnCard && (
                  <div className="space-y-2 rounded-2xl border border-[#991B1B]/15 bg-[#fff7f7] p-4">
                    <label htmlFor="columnistId" className="text-sm font-semibold text-gray-800">
                      Selecionar colunista
                    </label>
                    <select
                      id="columnistId"
                      value={selectedColumnistId}
                      onChange={(event) => setSelectedColumnistId(event.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                    >
                      <option value="">Selecione um colunista cadastrado</option>
                      {selectableColumnists.map((columnist) => (
                        <option key={columnist.id} value={columnist.id}>
                          {columnist.publicName || columnist.name}
                        </option>
                      ))}
                    </select>
                    {selectableColumnists.length === 0 ? (
                      <p className="text-xs text-amber-700">Nenhum colunista cadastrado. Cadastre ou vincule um colunista antes de gerar o card.</p>
                    ) : selectedColumnist ? (
                      <p className="text-xs text-gray-600">
                        Perfil vinculado:{' '}
                        <a className="font-semibold text-[#991B1B] underline" href={`/colunistas/${selectedColumnist.columnistSlug || selectedColumnist.id}`} target="_blank" rel="noreferrer">
                          {selectedColumnist.publicName || selectedColumnist.name}
                        </a>
                      </p>
                    ) : null}
                  </div>
                )}
                {selectableArticles.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                    Nenhuma notícia encontrada no momento. Você ainda pode usar o tipo de card Luto / Falecimento.
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="articleId" className="text-sm font-semibold text-gray-800">
                    {isColumnCard ? 'Imagem cadastrada (selecione uma matéria)' : 'Notícia'}
                  </label>
                  <select
                    id="articleId"
                    value={selectedArticleId}
                    onChange={(event) => setSelectedArticleId(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  >
                    {selectableArticles.map((article) => (
                      <option key={article.id} value={article.id}>
                        {article.title} — {getCategoryDisplayName(article.category)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="cardTitle" className="text-sm font-semibold text-gray-800">
                    Título do card
                  </label>
                  <textarea
                    id="cardTitle"
                    rows={5}
                    value={customTitle}
                    onChange={(event) => setCustomTitle(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  />
                  <p className="text-xs text-gray-500">O sistema ajusta o tamanho da fonte automaticamente dentro da área do card.</p>
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Categoria no card</p>
                      <p className="text-xs text-gray-500">Você pode trocar o nome da categoria ou esconder a barrinha.</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                      <input
                        type="checkbox"
                        checked={showCategory}
                        onChange={(event) => setShowCategory(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#991B1B] focus:ring-[#991B1B]"
                      />
                      Mostrar categoria
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="cardCategory" className="text-sm font-semibold text-gray-800">
                      Texto da categoria
                    </label>
                    <input
                      id="cardCategory"
                      type="text"
                      value={customCategory}
                      onChange={(event) => setCustomCategory(event.target.value)}
                      placeholder="Ex.: Política"
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                    />
                  </div>
                </div>
                {isColumnCard && (
                  <div className="space-y-4 rounded-2xl border border-[#991B1B]/20 bg-red-50/40 p-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Posição e tamanho do texto da coluna</p>
                      <p className="text-xs text-gray-500">Ajuste o título diretamente no card. Os valores ficam salvos na predefinição.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="space-y-2 text-sm font-semibold text-gray-800">
                        Tamanho
                        <input
                          type="range"
                          min="24"
                          max="120"
                          step="2"
                          value={columnTitleSize}
                          onChange={(event) => setColumnTitleSize(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                        <span className="block text-xs font-normal text-gray-500">{columnTitleSize}px</span>
                      </label>
                      <label className="space-y-2 text-sm font-semibold text-gray-800">
                        Mover horizontal
                        <input
                          type="range"
                          min="-400"
                          max="400"
                          step="2"
                          value={columnTitleOffsetX}
                          onChange={(event) => setColumnTitleOffsetX(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                        <span className="block text-xs font-normal text-gray-500">{columnTitleOffsetX}px</span>
                      </label>
                      <label className="space-y-2 text-sm font-semibold text-gray-800">
                        Mover vertical
                        <input
                          type="range"
                          min="-70"
                          max="220"
                          step="2"
                          value={columnTitleOffsetY}
                          onChange={(event) => setColumnTitleOffsetY(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                        <span className="block text-xs font-normal text-gray-500">{columnTitleOffsetY}px</span>
                      </label>
                      <label className="space-y-2 text-sm font-semibold text-gray-800">
                        Barrinha horizontal
                        <input
                          type="range"
                          min="-400"
                          max="400"
                          step="2"
                          value={columnAccentOffsetX}
                          onChange={(event) => setColumnAccentOffsetX(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                        <span className="block text-xs font-normal text-gray-500">{columnAccentOffsetX}px</span>
                      </label>
                      <label className="space-y-2 text-sm font-semibold text-gray-800">
                        Barrinha vertical
                        <input
                          type="range"
                          min="-180"
                          max="260"
                          step="2"
                          value={columnAccentOffsetY}
                          onChange={(event) => setColumnAccentOffsetY(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                        <span className="block text-xs font-normal text-gray-500">{columnAccentOffsetY}px</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setColumnTitleSize(64);
                        setColumnTitleOffsetX(0);
                        setColumnTitleOffsetY(0);
                        setColumnAccentOffsetX(0);
                        setColumnAccentOffsetY(0);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#991B1B] hover:text-[#991B1B]"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Restaurar texto
                    </button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-800">Categoria atual</label>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#991B1B]">
                      {showCategory ? categoryLabel : 'Oculta no card'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="exportFormat" className="text-sm font-semibold text-gray-800">
                      Formato de exportação
                    </label>
                    {isVideoSource ? (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
                        WEBM (vídeo)
                      </div>
                    ) : (
                      <select
                        id="exportFormat"
                        value={exportFormat}
                        onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      >
                        <option value="png">PNG</option>
                        <option value="jpeg">JPG</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Fonte do texto</p>
                    <p className="text-xs text-gray-500">Escolha a família e o estilo, como em um editor de texto. Agora com os 5 pesos do Montserrat.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="titleFont" className="text-sm font-semibold text-gray-800">
                        Fonte
                      </label>
                      <select
                        id="titleFont"
                        value={titleFont}
                        onChange={(event) => setTitleFont(event.target.value as TitleFont)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      >
                        {fontOptions.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="titleFontStyle" className="text-sm font-semibold text-gray-800">
                        Estilo
                      </label>
                      <select
                        id="titleFontStyle"
                        value={titleFontStyle}
                        onChange={(event) => setTitleFontStyle(event.target.value as TitleFontStyle)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      >
                        <option value="regular">Regular</option>
                        <option value="bold">Negrito</option>
                        <option value="italic">Itálico</option>
                        <option value="bold-italic">Negrito itálico</option>
                      </select>
                    </div>
                  </div>
                  {isNewsCard && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-800">Alinhamento da manchete</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { id: 'left', label: 'Esquerda' },
                          { id: 'center', label: 'Centro' },
                          { id: 'right', label: 'Direita' },
                        ] as Array<{ id: TitleAlign; label: string }>).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setTitleAlign(option.id)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                              titleAlign === option.id
                                ? 'border-[#991B1B] bg-[#991B1B]/10 text-[#991B1B]'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-[#991B1B]/40'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div
                    className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-4 text-lg text-gray-900"
                    style={{
                      fontFamily: getFontFamily(titleFont),
                      fontStyle: getEffectiveFontStyleParts(titleFont, titleFontStyle).fontStyle,
                      fontWeight: Number(getEffectiveFontStyleParts(titleFont, titleFontStyle).fontWeight),
                      textAlign: isNewsCard ? titleAlign : 'left',
                    }}
                  >
                    {customTitle.trim() || 'Prévia da fonte do título'}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="headerTheme" className="text-sm font-semibold text-gray-800">
                      Parte superior
                    </label>
                    <select
                      id="headerTheme"
                      value={headerTheme}
                      onChange={(event) => setHeaderTheme(event.target.value as HeaderTheme)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                    >
                      <option value="black">Preto</option>
                      <option value="white">Branco</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="footerGradient" className="text-sm font-semibold text-gray-800">
                      Gradiente inferior
                    </label>
                    <select
                      id="footerGradient"
                      value={footerGradient}
                      onChange={(event) => setFooterGradient(event.target.value as FooterGradient)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                    >
                      <option value="dark">Escuro</option>
                      <option value="light">Branco</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="logoPosition" className="text-sm font-semibold text-gray-800">
                    Posição da logo
                  </label>
                  <select
                    id="logoPosition"
                    value={logoPosition}
                    onChange={(event) => setLogoPosition(event.target.value as LogoPosition)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  >
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                  </select>
                  <p className="text-xs text-gray-500">A logo do RBN fica sobre a imagem e voce escolhe se ela aparece do lado esquerdo, no meio ou do lado direito.</p>
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Ajuste fino da logo</p>
                    <p className="text-xs text-gray-500">Esses controles valem para Notícia, Card de Coluna e Luto.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2 text-sm font-semibold text-gray-800">
                      <span className="flex items-center justify-between">
                        <span>Tamanho</span>
                        <span className="font-normal text-gray-500">{logoSize}%</span>
                      </span>
                      <input
                        type="range"
                        min="40"
                        max="140"
                        step="1"
                        value={logoSize}
                        onChange={(event) => setLogoSize(Number(event.target.value))}
                        className="w-full accent-[#991B1B]"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-gray-800">
                      <span className="flex items-center justify-between">
                        <span>Horizontal</span>
                        <span className="font-normal text-gray-500">{logoOffsetX}px</span>
                      </span>
                      <input
                        type="range"
                        min="-120"
                        max="120"
                        step="1"
                        value={logoOffsetX}
                        onChange={(event) => setLogoOffsetX(Number(event.target.value))}
                        className="w-full accent-[#991B1B]"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-gray-800">
                      <span className="flex items-center justify-between">
                        <span>Vertical</span>
                        <span className="font-normal text-gray-500">{logoOffsetY}px</span>
                      </span>
                      <input
                        type="range"
                        min="-80"
                        max="180"
                        step="1"
                        value={logoOffsetY}
                        onChange={(event) => setLogoOffsetY(Number(event.target.value))}
                        className="w-full accent-[#991B1B]"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLogoSize(100);
                      setLogoOffsetX(0);
                      setLogoOffsetY(0);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#991B1B] hover:text-[#991B1B]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Restaurar logo
                  </button>
                </div>

                <div className="space-y-2">
                  <label htmlFor="introAnimation" className="text-sm font-semibold text-gray-800">
                    Entrada do texto
                  </label>
                  <select
                    id="introAnimation"
                    value={introAnimation}
                    onChange={(event) => setIntroAnimation(event.target.value as IntroAnimation)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                  >
                    {introAnimationOptions.map((animation) => (
                      <option key={animation.id} value={animation.id}>
                        {animation.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    {introAnimationOptions.find((animation) => animation.id === introAnimation)?.description}
                    {isVideoSource ? ` O vídeo exportado usa até ${VIDEO_EXPORT_MAX_DURATION_SECONDS / 60} minutos do arquivo enviado.` : ' A animação aparece no vídeo exportado e também guia a prévia do texto.'}
                  </p>
                </div>

                {isNewsCard && isVideoSource && videoSourceDuration > 0 ? (
                  <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#991B1B]" />
                      <p className="text-sm font-semibold text-gray-800">Tempo de exibição do Card</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Defina quando a logo, a categoria, a manchete e as redes sociais ficam visíveis sobre o vídeo. Fora desse período, o vídeo continua rodando sem as informações do card.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCardOverlayMode('full')}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          cardOverlayMode === 'full'
                            ? 'border-[#991B1B] bg-[#991B1B] text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-[#991B1B] hover:text-[#991B1B]'
                        }`}
                      >
                        Vídeo inteiro
                      </button>
                      <button
                        type="button"
                        onClick={() => setCardOverlayMode('custom')}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          cardOverlayMode === 'custom'
                            ? 'border-[#991B1B] bg-[#991B1B] text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-[#991B1B] hover:text-[#991B1B]'
                        }`}
                      >
                        Alguns segundos
                      </button>
                    </div>

                    {cardOverlayMode === 'custom' ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                          Início ({formatSecondsLabel(effectiveCardOverlayWindow.start)})
                          <input
                            type="range"
                            min={0}
                            max={effectiveVideoTrim.clipDuration}
                            step={0.5}
                            value={cardOverlayStart}
                            onChange={(event) => setCardOverlayStart(Number(event.target.value))}
                            className="w-full accent-[#991B1B]"
                          />
                        </label>
                        <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                          Fim ({formatSecondsLabel(effectiveCardOverlayWindow.end)})
                          <input
                            type="range"
                            min={0}
                            max={effectiveVideoTrim.clipDuration}
                            step={0.5}
                            value={cardOverlayEnd}
                            onChange={(event) => setCardOverlayEnd(Number(event.target.value))}
                            className="w-full accent-[#991B1B]"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Barrinha da categoria</p>
                      <p className="text-xs text-gray-500">Fonte, peso, tamanho, cores, cantos e espaçamento internos são todos editáveis. A largura sempre se ajusta ao texto.</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCategoryBackgroundTransparent(false);
                          setCategoryBackgroundColor('#FFFFFF');
                          setCategoryTextColor(CARD_ACCENT_RED);
                          setCategoryBorderColor(CARD_ACCENT_RED);
                        }}
                        className="text-xs font-semibold text-[#991B1B] transition hover:text-[#7F1D1D]"
                      >
                        Padrão
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCategoryBackgroundTransparent(false);
                          setCategoryBackgroundColor(CARD_ACCENT_RED);
                          setCategoryTextColor('#FFFFFF');
                          setCategoryBorderColor(CARD_ACCENT_RED);
                          setCategoryFont('montserrat-semibold');
                          setCategoryFontStyle('regular');
                          setCategoryFontSize(30);
                          setCategoryPadding(26);
                          setCategoryBorderRadius(18);
                          setCategoryTitleGap(88);
                        }}
                        className="text-xs font-semibold text-[#991B1B] transition hover:text-[#7F1D1D]"
                      >
                        Estilo editorial (referência)
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="categoryFont" className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Fonte da etiqueta
                      </label>
                      <select
                        id="categoryFont"
                        value={categoryFont}
                        onChange={(event) => setCategoryFont(event.target.value as TitleFont)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      >
                        {fontOptions.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="categoryFontStyle" className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Peso da fonte
                      </label>
                      <select
                        id="categoryFontStyle"
                        value={categoryFontStyle}
                        onChange={(event) => setCategoryFontStyle(event.target.value as TitleFontStyle)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      >
                        <option value="regular">Regular</option>
                        <option value="bold">Negrito</option>
                        <option value="italic">Itálico</option>
                        <option value="bold-italic">Negrito itálico</option>
                      </select>
                      <p className="text-[11px] text-gray-500">Para as variantes Montserrat, o peso exato (Regular/Medium/SemiBold/Bold/ExtraBold) já vem da fonte escolhida acima.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                      Tamanho da fonte
                      <input
                        type="range"
                        min="18"
                        max="60"
                        step="1"
                        value={categoryFontSize}
                        onChange={(event) => setCategoryFontSize(Number(event.target.value))}
                        className="w-full accent-[#991B1B]"
                      />
                      <span className="block text-xs font-normal normal-case text-gray-500">{categoryFontSize}px</span>
                    </label>
                    <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                      Espaçamento interno
                      <input
                        type="range"
                        min="12"
                        max="60"
                        step="1"
                        value={categoryPadding}
                        onChange={(event) => setCategoryPadding(Number(event.target.value))}
                        className="w-full accent-[#991B1B]"
                      />
                      <span className="block text-xs font-normal normal-case text-gray-500">{categoryPadding}px</span>
                    </label>
                    <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                      Raio dos cantos
                      <input
                        type="range"
                        min="0"
                        max="60"
                        step="1"
                        value={categoryBorderRadius}
                        onChange={(event) => setCategoryBorderRadius(Number(event.target.value))}
                        className="w-full accent-[#991B1B]"
                      />
                      <span className="block text-xs font-normal normal-case text-gray-500">{categoryBorderRadius}px {categoryBorderRadius >= (categoryFontSize + categoryPadding) / 2 ? '(cápsula)' : ''}</span>
                    </label>
                  </div>

                  <label className={`block space-y-2 text-xs font-semibold uppercase tracking-[0.12em] ${showCategory ? 'text-gray-600' : 'text-gray-400'}`}>
                    Distância entre categoria e manchete
                    <input
                      id="categoryTitleGap"
                      type="range"
                      min="40"
                      max="180"
                      step="4"
                      value={categoryTitleGap}
                      disabled={!showCategory}
                      onChange={(event) => setCategoryTitleGap(Number(event.target.value))}
                      className="w-full accent-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="block text-xs font-normal normal-case text-gray-500">
                      {categoryTitleGap}px {!showCategory && '— ative a categoria para ajustar'}
                    </span>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <label htmlFor="categoryBackgroundColor" className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Fundo
                      </label>
                      <div className="space-y-3 rounded-xl border border-gray-200 bg-white px-3 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            id="categoryBackgroundColor"
                            type="color"
                            value={categoryBackgroundColor}
                            disabled={isCategoryBackgroundTransparent}
                            onChange={(event) => {
                              setCategoryBackgroundColor(event.target.value);
                            }}
                            className="h-10 w-12 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {isCategoryBackgroundTransparent ? 'TRANSPARENTE' : categoryBackgroundColor.toUpperCase()}
                          </span>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                          <input
                            type="checkbox"
                            checked={isCategoryBackgroundTransparent}
                            onChange={(event) => {
                              setIsCategoryBackgroundTransparent(event.target.checked);
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-[#991B1B] focus:ring-[#991B1B]"
                          />
                          Fundo transparente
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="categoryTextColor" className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Texto
                      </label>
                      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <input
                          id="categoryTextColor"
                          type="color"
                          value={categoryTextColor}
                          onChange={(event) => {
                            setCategoryTextColor(event.target.value);
                          }}
                          className="h-10 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        <span className="text-sm font-medium text-gray-700">{categoryTextColor.toUpperCase()}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="categoryBorderColor" className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Borda
                      </label>
                      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <input
                          id="categoryBorderColor"
                          type="color"
                          value={categoryBorderColor}
                          onChange={(event) => {
                            setCategoryBorderColor(event.target.value);
                          }}
                          className="h-10 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        <span className="text-sm font-medium text-gray-700">{categoryBorderColor.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-start">
                    <span
                      className="inline-flex items-center rounded-full px-4 py-2 text-sm uppercase tracking-wide"
                      style={{
                        backgroundColor: isCategoryBackgroundTransparent ? 'transparent' : categoryBackgroundColor,
                        color: categoryTextColor,
                        border: `2px solid ${categoryBorderColor}`,
                        borderRadius: `${categoryBorderRadius}px`,
                        padding: `${categoryPadding * 0.4}px ${categoryPadding}px`,
                        fontFamily: getFontFamily(categoryFont),
                        fontStyle: getEffectiveFontStyleParts(categoryFont, categoryFontStyle).fontStyle,
                        fontWeight: Number(getEffectiveFontStyleParts(categoryFont, categoryFontStyle).fontWeight),
                        fontSize: `${Math.min(categoryFontSize, 28)}px`,
                      }}
                    >
                      {(showCategory ? categoryLabel : 'ENTRETENIMENTO').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-6 text-gray-600">
                  Logo fixa do card: <span className="font-semibold text-gray-900">RBN com fundo tratado como transparente</span>. A logo fica sobre a mídia, sem frase e sem nome do autor na base, com posicao ajustavel entre esquerda, centro e direita.
                </div>

                {isNewsCard ? (
                  <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Redes sociais e site</p>
                      <p className="text-xs text-gray-500">
                        Cadastre seus contatos (tudo opcional) e marque quais devem aparecer no card. As informações ficam salvas neste navegador para reutilizar em outros cards.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {SOCIAL_PLATFORM_ORDER.map((platform) => {
                        const meta = SOCIAL_PLATFORM_META[platform];
                        const entry = socialLinks[platform];
                        const Icon = meta.Icon;
                        return (
                          <div key={platform} className="space-y-2 rounded-xl border border-gray-200 bg-white px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-gray-600">
                                <Icon className="h-4 w-4" style={{ color: meta.color }} />
                                {platform === 'other' ? (
                                  <input
                                    type="text"
                                    value={socialLinks.otherLabel}
                                    onChange={(event) =>
                                      setSocialLinks((previous) => ({ ...previous, otherLabel: event.target.value }))
                                    }
                                    placeholder="Nome do contato"
                                    className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-xs font-normal normal-case text-gray-900 outline-none focus:border-[#991B1B]"
                                  />
                                ) : (
                                  meta.label
                                )}
                              </label>
                              <input
                                type="checkbox"
                                checked={entry.enabled}
                                onChange={(event) =>
                                  setSocialLinks((previous) => ({
                                    ...previous,
                                    [platform]: { ...previous[platform], enabled: event.target.checked },
                                  }))
                                }
                                className="h-4 w-4 accent-[#991B1B]"
                              />
                            </div>
                            <input
                              type="text"
                              value={entry.value}
                              onChange={(event) =>
                                setSocialLinks((previous) => ({
                                  ...previous,
                                  [platform]: { ...previous[platform], value: event.target.value },
                                }))
                              }
                              placeholder={meta.placeholder}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500">
                      {socialBadgeEntries.length > 0
                        ? `Aparecerão no card: ${socialBadgeEntries.map((item) => item.text).join(' · ')}`
                        : 'Nenhuma rede marcada para aparecer no card.'}
                    </p>

                    <div className="grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="socialFont" className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                          Fonte das redes sociais
                        </label>
                        <select
                          id="socialFont"
                          value={socialFont}
                          onChange={(event) => setSocialFont(event.target.value as TitleFont)}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                        >
                          {fontOptions.map((font) => (
                            <option key={font.id} value={font.id}>
                              {font.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Tamanho ({socialFontSize}px)
                        <input
                          type="range"
                          min={16}
                          max={48}
                          step={1}
                          value={socialFontSize}
                          onChange={(event) => setSocialFontSize(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Posição horizontal
                        <input
                          type="range"
                          min={-200}
                          max={200}
                          step={2}
                          value={socialOffsetX}
                          onChange={(event) => setSocialOffsetX(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        Posição vertical
                        <input
                          type="range"
                          min={-200}
                          max={400}
                          step={2}
                          value={socialOffsetY}
                          onChange={(event) => setSocialOffsetY(Number(event.target.value))}
                          className="w-full accent-[#991B1B]"
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Alinhamento</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { id: 'left', label: 'Esquerda' },
                          { id: 'center', label: 'Centro' },
                          { id: 'right', label: 'Direita' },
                        ] as Array<{ id: TitleAlign; label: string }>).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSocialAlign(option.id)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                              socialAlign === option.id
                                ? 'border-[#991B1B] bg-[#991B1B]/10 text-[#991B1B]'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-[#991B1B]/40'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSocialFont('montserrat-semibold');
                        setSocialFontSize(28);
                        setSocialOffsetX(0);
                        setSocialOffsetY(0);
                        setSocialAlign('left');
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#991B1B] hover:text-[#991B1B]"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Restaurar fonte e posição
                    </button>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="cardImage" className="text-sm font-semibold text-gray-800">
                      Trocar mídia
                    </label>
                    {(customImageDataUrl || customVideoUrl) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (uploadedVideoUrlRef.current) {
                            URL.revokeObjectURL(uploadedVideoUrlRef.current);
                            uploadedVideoUrlRef.current = null;
                          }
                          setCustomImageDataUrl('');
                          setCustomImageName('');
                          setCustomVideoUrl('');
                          setCustomVideoName('');
                          setVideoSourceDuration(0);
                          setVideoTrimStart(0);
                          setVideoTrimDuration(15);
                          setCardOverlayMode('full');
                          setCardOverlayStart(0);
                          setCardOverlayEnd(5);
                          setPreviewKind(null);
                        }}
                        className="text-xs font-semibold text-[#991B1B] transition hover:text-[#7F1D1D]"
                      >
                        Remover troca
                      </button>
                    )}
                  </div>
                  <label
                    htmlFor="cardImage"
                    className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600 transition hover:border-[#991B1B]/40 hover:bg-[#fff7f7]"
                  >
                    <ImageUp className="h-5 w-5 text-[#991B1B]" />
                    <span>{currentSourceLabel || 'Enviar nova imagem ou vídeo para o card'}</span>
                  </label>
                  <input
                    id="cardImage"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
                    onChange={handleMediaUpload}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-500">Use PNG, JPG, WEBP, MP4, WEBM ou MOV. Vídeos de até 3 minutos são baixados em WEBM, sem conversão para MP4. Se não trocar, o card usará a foto principal da matéria.</p>
                </div>

                {isVideoSource && videoSourceDuration > 0 && (
                  <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Corte do vídeo</p>
                      <p className="text-xs text-gray-500">
                        Escolha visualmente o trecho do vídeo que vai entrar no card. Isso ajuda a deixar o arquivo final mais leve.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[#1b2430] bg-[#0f1720] px-3 py-4 text-white shadow-inner">
                      <div className="mb-3 flex items-center justify-between gap-3 text-[11px] font-medium text-white/70">
                        <span>Timeline do corte</span>
                        <span>{formatSecondsLabel(videoSourceDuration)}</span>
                      </div>

                      <div className="relative mb-3 h-6">
                        <div className="absolute inset-x-0 top-3 h-px bg-white/15" />
                        {videoTimelineMarkers.map((marker) => (
                          <div
                            key={`${marker.label}-${marker.percent}`}
                            className="absolute top-0 -translate-x-1/2"
                            style={{ left: `${marker.percent}%` }}
                          >
                            <div className="mx-auto h-3 w-px bg-white/35" />
                            <span className="mt-1 block whitespace-nowrap text-[10px] text-white/65">{marker.label}</span>
                          </div>
                        ))}
                      </div>

                      <div className="relative mt-8">
                        <div
                          className="relative h-20 overflow-hidden rounded-xl border border-white/10 bg-[#101827]"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.05) 12%, rgba(255,255,255,0.1) 12%, rgba(255,255,255,0.1) 13%, rgba(255,255,255,0.04) 13%, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.08) 26%, rgba(255,255,255,0.03) 26%, rgba(255,255,255,0.03) 38%, rgba(255,255,255,0.08) 38%, rgba(255,255,255,0.08) 39%, rgba(255,255,255,0.04) 39%, rgba(255,255,255,0.04) 51%, rgba(255,255,255,0.09) 51%, rgba(255,255,255,0.09) 52%, rgba(255,255,255,0.03) 52%, rgba(255,255,255,0.03) 64%, rgba(255,255,255,0.08) 64%, rgba(255,255,255,0.08) 65%, rgba(255,255,255,0.04) 65%, rgba(255,255,255,0.04) 77%, rgba(255,255,255,0.08) 77%, rgba(255,255,255,0.08) 78%, rgba(255,255,255,0.04) 78%, rgba(255,255,255,0.04) 100%)',
                          }}
                        >
                          <div className="absolute inset-y-0 left-0 bg-black/45" style={{ width: `${trimStartPercent}%` }} />
                          <div
                            className="absolute inset-y-0 bg-[#991B1B]/25 ring-2 ring-[#ef4444]"
                            style={{ left: `${trimStartPercent}%`, width: `${Math.max(2, trimEndPercent - trimStartPercent)}%` }}
                          />
                          <div className="absolute inset-y-0 right-0 bg-black/45" style={{ width: `${Math.max(0, 100 - trimEndPercent)}%` }} />

                          <div
                            className="absolute inset-y-[-6px] z-10 w-[3px] rounded-full bg-[#ef4444] shadow-[0_0_0_4px_rgba(239,68,68,0.18)]"
                            style={{ left: `calc(${trimStartPercent}% - 1px)` }}
                          />
                          <div
                            className="absolute inset-y-[-6px] z-10 w-[3px] rounded-full bg-[#ef4444] shadow-[0_0_0_4px_rgba(239,68,68,0.18)]"
                            style={{ left: `calc(${trimEndPercent}% - 1px)` }}
                          />
                          <div
                            className="absolute top-[-12px] z-20 h-6 w-6 -translate-x-1/2 rounded-full border border-[#fca5a5] bg-[#991B1B] text-center text-xs leading-6 text-white shadow-lg"
                            style={{ left: `${trimStartPercent}%` }}
                          >
                            |
                          </div>
                          <div
                            className="absolute bottom-[-12px] z-20 h-6 w-6 -translate-x-1/2 rounded-full border border-[#fca5a5] bg-[#991B1B] text-center text-xs leading-6 text-white shadow-lg"
                            style={{ left: `${trimEndPercent}%` }}
                          >
                            |
                          </div>
                        </div>

                        <input
                          id="videoTrimStart"
                          type="range"
                          min="0"
                          max={Math.max(0, videoSourceDuration - 1)}
                          step="1"
                          value={Math.min(videoTrimStart, Math.max(0, videoSourceDuration - 1))}
                          onChange={(event) => {
                            const nextStart = Number(event.target.value);
                            setVideoTrimStart(nextStart);
                            const maxRemaining = Math.max(1, Math.min(VIDEO_EXPORT_MAX_DURATION_SECONDS, videoSourceDuration - nextStart));
                            setVideoTrimDuration((currentDuration) => Math.min(currentDuration, maxRemaining));
                          }}
                          className="absolute inset-x-0 top-0 h-20 w-full cursor-ew-resize opacity-0"
                        />
                        <input
                          aria-label="Fim do vídeo"
                          type="range"
                          min="1"
                          max={Math.max(1, Math.min(VIDEO_EXPORT_MAX_DURATION_SECONDS, videoSourceDuration))}
                          step="1"
                          value={effectiveVideoTrimEnd}
                          onChange={(event) => {
                            const nextEnd = Math.max(Number(event.target.value), effectiveVideoTrim.startTime + 1);
                            setVideoTrimDuration(Math.max(1, nextEnd - effectiveVideoTrim.startTime));
                          }}
                          className="absolute inset-x-0 top-0 h-20 w-full cursor-ew-resize opacity-0"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Início</p>
                        <p className="mt-1 text-base font-bold text-gray-900">{formatSecondsLabel(effectiveVideoTrim.startTime)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Fim</p>
                        <p className="mt-1 text-base font-bold text-gray-900">{formatSecondsLabel(effectiveVideoTrimEnd)}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Duração</p>
                        <p className="mt-1 text-base font-bold text-gray-900">{formatSecondsLabel(effectiveVideoTrim.clipDuration)}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-xs leading-6 text-gray-600">
                      Trecho atual: <span className="font-semibold text-gray-900">{formatSecondsLabel(effectiveVideoTrim.startTime)}</span> ate{' '}
                      <span className="font-semibold text-gray-900">
                        {formatSecondsLabel(effectiveVideoTrimEnd)}
                      </span>{' '}
                      de um total de <span className="font-semibold text-gray-900">{formatSecondsLabel(videoSourceDuration)}</span>.
                    </div>
                  </div>
                )}

                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Ajuste manual da mídia</p>
                      <p className="text-xs text-gray-500">Controle zoom e posição da imagem ou do vídeo dentro do card.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImageScale(1);
                        setImageOffsetX(0);
                        setImageOffsetY(0);
                      }}
                      className="text-xs font-semibold text-[#991B1B] transition hover:text-[#7F1D1D]"
                    >
                      Resetar
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <label htmlFor="imageScale">Zoom</label>
                      <span>{imageScale.toFixed(2)}x</span>
                    </div>
                    <input
                      id="imageScale"
                      type="range"
                      min="1"
                      max="2.2"
                      step="0.05"
                      value={imageScale}
                      onChange={(event) => {
                        setImageScale(Number(event.target.value));
                      }}
                      className="w-full accent-[#991B1B]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <label htmlFor="imageOffsetX">Mover para os lados</label>
                      <span>{imageOffsetX}px</span>
                    </div>
                    <input
                      id="imageOffsetX"
                      type="range"
                      min="-260"
                      max="260"
                      step="5"
                      value={imageOffsetX}
                      onChange={(event) => {
                        setImageOffsetX(Number(event.target.value));
                      }}
                      className="w-full accent-[#991B1B]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <label htmlFor="imageOffsetY">Mover para cima/baixo</label>
                      <span>{imageOffsetY}px</span>
                    </div>
                    <input
                      id="imageOffsetY"
                      type="range"
                      min="-260"
                      max="260"
                      step="5"
                      value={imageOffsetY}
                      onChange={(event) => {
                        setImageOffsetY(Number(event.target.value));
                      }}
                      className="w-full accent-[#991B1B]"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-[#991B1B]" />
                    <p className="text-sm font-semibold text-gray-800">Modelos</p>
                  </div>
                  <div className="grid gap-3">
                    {templateOptions.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          selectedTemplate === template.id
                            ? 'border-[#991B1B] bg-[#fff6f6] shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{template.name}</p>
                            <p className="mt-1 text-sm text-gray-500">{template.description}</p>
                          </div>
                          {selectedTemplate === template.id && <Sparkles className="h-5 w-5 text-[#991B1B]" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="memorialFullName" className="text-sm font-semibold text-gray-800">
                        Nome completo
                      </label>
                      <input
                        id="memorialFullName"
                        type="text"
                        value={memorialFullName}
                        onChange={(event) => setMemorialFullName(event.target.value)}
                        placeholder="Nome completo"
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="memorialProfession" className="text-sm font-semibold text-gray-800">
                        Profissão
                      </label>
                      <input
                        id="memorialProfession"
                        type="text"
                        value={memorialProfession}
                        onChange={(event) => setMemorialProfession(event.target.value)}
                        placeholder="Profissão"
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="memorialBirthDate" className="text-sm font-semibold text-gray-800">
                          Nascimento
                        </label>
                        <input
                          id="memorialBirthDate"
                          type="date"
                          value={memorialBirthDate}
                          onChange={(event) => setMemorialBirthDate(event.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="memorialDeathDate" className="text-sm font-semibold text-gray-800">
                          Falecimento
                        </label>
                        <input
                          id="memorialDeathDate"
                          type="date"
                          value={memorialDeathDate}
                          onChange={(event) => setMemorialDeathDate(event.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/10"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900">Modelo Luto / Falecimento</p>
                      <p className="mt-2 text-sm leading-6">
                        Esse modelo gera automaticamente a foto em preto e branco, uma única logo no topo, assinatura do portal,
                        nome em destaque, profissão discreta e as datas no formato final {memorialYearsLabel || '1927 - 2026'}.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="cardImage" className="text-sm font-semibold text-gray-800">
                          Foto da pessoa
                        </label>
                        {customImageDataUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomImageDataUrl('');
                              setCustomImageName('');
                              setPreviewKind(null);
                            }}
                            className="text-xs font-semibold text-[#991B1B] transition hover:text-[#7F1D1D]"
                          >
                            Remover foto
                          </button>
                        )}
                      </div>
                      <label
                        htmlFor="cardImage"
                        className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600 transition hover:border-[#991B1B]/40 hover:bg-[#fff7f7]"
                      >
                        <ImageUp className="h-5 w-5 text-[#991B1B]" />
                        <span>{currentSourceLabel}</span>
                      </label>
                      <input
                        id="cardImage"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleMediaUpload}
                        className="hidden"
                      />
                      <p className="text-xs text-gray-500">Envie somente a foto principal. O sistema aplica o tratamento visual automaticamente.</p>
                    </div>
                  </>
                )}

                {errorMessage && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleGenerateCard}
                    disabled={isGenerating || (isMemorialCard ? !customImageDataUrl : isColumnCard ? !selectedColumnist || !currentImageSource : !selectedArticle)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#991B1B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7F1D1D] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isVideoSource ? 'Gerar vídeo' : 'Atualizar agora'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCard}
                    disabled={!previewUrl || (isVideoSource && previewKind !== 'video')}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#27272a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {isVideoSource ? 'Baixar vídeo' : 'Baixar card'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:h-fit xl:self-start">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Prévia</h2>
                    <p className="text-sm text-gray-500">
                      Formato 4:5 — 1080 x 1350 px. A prévia atualiza automaticamente enquanto voce edita
                      {isVideoSource ? ', e o botão principal gera o vídeo completo.' : '.'}
                    </p>
                  </div>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {isMemorialCard
                      ? 'Modelo Luto / Falecimento'
                      : isColumnCard
                        ? 'Card de Coluna'
                      : selectedTemplate === 'editorial'
                        ? 'Modelo Editorial'
                        : selectedTemplate === 'urgente'
                          ? 'Modelo Urgente'
                          : 'Modelo Clean'}
                  </div>
                </div>

                <div className="flex min-h-[740px] items-center justify-center rounded-[28px] border border-dashed border-gray-300 bg-[#f8f8f8] p-4">
                  {previewUrl ? (
                    previewKind === 'video' ? (
                      <video
                        src={previewUrl}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full max-w-[430px] rounded-[28px] border border-black/10 shadow-[0_24px_60px_rgba(17,17,17,0.16)]"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Prévia do card"
                        className="w-full max-w-[430px] rounded-[28px] border border-black/10 shadow-[0_24px_60px_rgba(17,17,17,0.16)]"
                      />
                    )
                  ) : (
                    <div className="max-w-md text-center text-gray-500">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#991B1B]/10 text-[#991B1B]">
                        <ImageUp className="h-6 w-6" />
                      </div>
                      <p className="text-base font-semibold text-gray-700">A prévia sera gerada automaticamente</p>
                      <p className="mt-2 text-sm leading-6">
                        A arte aparece em tempo real com a logo do RBN, {isMemorialCard ? 'foto tratada em preto e branco' : 'categoria, midia principal'} e titulo ajustado automaticamente.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
