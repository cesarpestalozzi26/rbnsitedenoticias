'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading1,
  Heading2,
  Highlighter,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  PaintBucket,
  Pilcrow,
  Quote,
  Strikethrough,
  Underline,
  Video,
} from 'lucide-react';
import { uploadMedia } from '@/app/lib/uploadMedia';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ArticleBodyContent, { resolveInlineMediaContent } from '@/app/components/ArticleBodyContent';
import type { ArticleImage, ArticleVideo } from '@/app/components/ArticleMediaManager';

interface HtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  libraryImages?: ArticleImage[];
  libraryVideos?: ArticleVideo[];
  onRegisterMedia?: (kind: 'image' | 'video', file: File, caption: string) => Promise<{ id: string; url: string }>;
  onSelectionTextChange?: (selectedText: string) => void;
  replaceSelectionRequest?: { id: number; text: string } | null;
}

type InlineImageAlignment = 'left' | 'center' | 'right';

function getInlineImageWidth(figure: HTMLElement) {
  const inlineWidth = Number.parseInt(figure.style.maxWidth.replace('%', ''), 10);
  return Number.isFinite(inlineWidth) ? Math.min(Math.max(inlineWidth, 40), 100) : 100;
}

function getInlineImageAlignment(figure: HTMLElement): InlineImageAlignment {
  const alignment = figure.dataset.inlineAlign;
  if (alignment === 'left' || alignment === 'right') {
    return alignment;
  }
  return 'center';
}

function applyInlineImageLayout(figure: HTMLElement, width: number, alignment: InlineImageAlignment) {
  const safeWidth = Math.min(Math.max(Math.round(width), 40), 100);

  figure.style.width = '100%';
  figure.style.maxWidth = `${safeWidth}%`;
  figure.dataset.inlineAlign = alignment;

  if (alignment === 'left') {
    figure.style.margin = '1.5rem auto 1.5rem 0';
    return;
  }

  if (alignment === 'right') {
    figure.style.margin = '1.5rem 0 1.5rem auto';
    return;
  }

  figure.style.margin = '1.5rem auto';
}

// Envia ao Supabase Storage e devolve a URL pública (evita HTTP 413).
function fileToDataUrl(file: File) {
  return uploadMedia(file, file.name);
}

function buildInlineMediaHtml(kind: 'image' | 'video', src: string, caption: string) {
  const normalizedCaption = caption.trim();
  const normalizedSrc = src.trim();

  const captionHtml = normalizedCaption ? `<figcaption>${normalizedCaption}</figcaption>` : '';
  const microsoftStreamEmbed =
    kind === 'video' && normalizedSrc
      ? (() => {
          const normalizedUrl = normalizedSrc.toLowerCase();
          if (normalizedUrl.includes('microsoftstream.com') || normalizedUrl.includes('stream.microsoft.com')) {
            const match = normalizedSrc.match(/\/video\/([^/?#]+)/i);
            if (match?.[1]) {
              return `<iframe src="https://web.microsoftstream.com/embed/video/${match[1]}" title="Vídeo Microsoft Stream" allow="autoplay; fullscreen" allowFullScreen></iframe>`;
            }
          }
          return null;
        })()
      : null;

  return kind === 'image'
    ? `<figure class="article-media article-media--compact"><img src="${normalizedSrc}" alt="${normalizedCaption || 'Imagem da matéria'}" />${captionHtml}</figure>`
    : `<figure class="article-media article-media--compact">${microsoftStreamEmbed ?? `<video controls><source src="${normalizedSrc}" /></video>`}${captionHtml}</figure>`;
}

function normalizeEditorHtml(content: string) {
  if (typeof window === 'undefined') {
    return content.trim();
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(content, 'text/html');

  documentNode.body.querySelectorAll('div').forEach((element) => {
    if (element.closest('figure, li, blockquote')) {
      return;
    }

    const attributeNames = Array.from(element.attributes).map((attribute) => attribute.name);
    if (attributeNames.length === 0) {
      const paragraph = documentNode.createElement('p');
      paragraph.innerHTML = element.innerHTML.trim() ? element.innerHTML : '<br>';
      element.replaceWith(paragraph);
    }
  });

  documentNode.body.querySelectorAll('a[href]').forEach((anchor) => {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noreferrer');
  });

  documentNode.body.querySelectorAll('[data-editor-selected]').forEach((element) => {
    element.removeAttribute('data-editor-selected');
  });

  documentNode.body.querySelectorAll('[data-inline-media-marker]').forEach((element) => {
    element.removeAttribute('data-inline-media-marker');
  });

  const normalized = documentNode.body.innerHTML
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+class=""/g, '')
    .trim();

  return normalized === '<br>' ? '' : normalized;
}

const editorFontOptions = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Calibri', value: 'Calibri' },
  { label: 'Cambria', value: 'Cambria' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Garamond', value: 'Garamond' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Verdana', value: 'Verdana' },
];

const editorFontSizes = ['12', '14', '16', '18', '20', '22', '24', '28', '32', '36', '48'];
const editorFontSizeMap: Record<string, number> = {
  '12': 1,
  '14': 2,
  '16': 3,
  '18': 4,
  '20': 5,
  '22': 6,
  '24': 7,
  '28': 7,
  '32': 7,
  '36': 7,
  '48': 7,
};

export default function HtmlEditor({
  value,
  onChange,
  placeholder = 'Escreva a noticia...',
  minHeight = 320,
  libraryImages = [],
  libraryVideos = [],
  onRegisterMedia,
  onSelectionTextChange,
  replaceSelectionRequest,
}: HtmlEditorProps) {
  const editorId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const selectedInlineImageRef = useRef<HTMLElement | null>(null);
  const [mediaModal, setMediaModal] = useState<{ open: boolean; kind: 'image' | 'video' | null; caption: string; sourceUrl: string; selectedFile: File | null; fileName: string }>({
    open: false,
    kind: null,
    caption: '',
    sourceUrl: '',
    selectedFile: null,
    fileName: '',
  });
  const [isRegisteringMedia, setIsRegisteringMedia] = useState(false);
  const [selectedFontFamily, setSelectedFontFamily] = useState(editorFontOptions[0].value);
  const [selectedFontSize, setSelectedFontSize] = useState('18');
  const [selectedTextColor, setSelectedTextColor] = useState('#111827');
  const [selectedHighlightColor, setSelectedHighlightColor] = useState('#FEF08A');
  const [selectedInlineImageSettings, setSelectedInlineImageSettings] = useState<{ width: number; alignment: InlineImageAlignment } | null>(null);
  const lastReplaceSelectionRequestIdRef = useRef<number | null>(null);
  const previewContent = useMemo(() => value.trim() || '<p>Nenhum conteudo adicionado ainda.</p>', [value]);
  const editorContent = useMemo(() => {
    return resolveInlineMediaContent(value, libraryImages, libraryVideos).trim();
  }, [libraryImages, libraryVideos, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (normalizeEditorHtml(editor.innerHTML) === normalizeEditorHtml(editorContent)) {
      return;
    }

    editor.innerHTML = editorContent;
  }, [editorContent]);

  const clearSelectedInlineImage = () => {
    if (selectedInlineImageRef.current) {
      selectedInlineImageRef.current.removeAttribute('data-editor-selected');
    }

    selectedInlineImageRef.current = null;
    setSelectedInlineImageSettings(null);
  };

  const selectInlineImage = (figure: HTMLElement | null) => {
    if (!figure || !figure.querySelector('img')) {
      clearSelectedInlineImage();
      return;
    }

    if (selectedInlineImageRef.current && selectedInlineImageRef.current !== figure) {
      selectedInlineImageRef.current.removeAttribute('data-editor-selected');
    }

    selectedInlineImageRef.current = figure;
    figure.setAttribute('data-editor-selected', 'true');
    setSelectedInlineImageSettings({
      width: getInlineImageWidth(figure),
      alignment: getInlineImageAlignment(figure),
    });
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) {
      onSelectionTextChange?.('');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      onSelectionTextChange?.('');
      return;
    }

    savedSelectionRef.current = range.cloneRange();
    const selectedText = selection.toString().trim();
    onSelectionTextChange?.(selectedText);
  };

  const syncEditorValue = () => {
    if (!editorRef.current) {
      return;
    }

    if (selectedInlineImageRef.current && !editorRef.current.contains(selectedInlineImageRef.current)) {
      clearSelectedInlineImage();
    }

    const normalized = normalizeEditorHtml(editorRef.current.innerHTML);
    onChange(normalized);
  };

  const restoreSelection = () => {
    if (!savedSelectionRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(savedSelectionRef.current);
  };

  const prepareEditor = () => {
    const editor = editorRef.current;
    if (!editor) {
      return false;
    }

    editor.focus();
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('defaultParagraphSeparator', false, 'p');
    return true;
  };

  const runEditorCommand = (command: string, commandValue?: string) => {
    if (!prepareEditor()) {
      return;
    }

    document.execCommand(command, false, commandValue);
    syncEditorValue();
    saveSelection();
  };

  const applyInlineStyle = (styles: Record<string, string>, fallback = 'Texto') => {
    if (!prepareEditor() || !editorRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    const span = document.createElement('span');
    Object.entries(styles).forEach(([property, currentValue]) => {
      span.style.setProperty(property, currentValue);
    });

    if (range.collapsed) {
      span.textContent = fallback;
      range.insertNode(span);
      range.selectNodeContents(span);
    } else {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      range.selectNodeContents(span);
    }

    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorValue();
    saveSelection();
  };

  const insertBlock = (tag: 'p' | 'h2' | 'h3' | 'blockquote') => {
    runEditorCommand('formatBlock', tag);
  };

  const insertList = (tag: 'ul' | 'ol') => {
    runEditorCommand(tag === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
  };

  const insertLink = () => {
    const url = window.prompt('Informe a URL do link', 'https://');

    if (!url) {
      return;
    }

    runEditorCommand('createLink', url);
  };

  const clearFormatting = () => {
    if (!prepareEditor()) {
      return;
    }

    document.execCommand('removeFormat');
    document.execCommand('unlink');
    syncEditorValue();
    saveSelection();
  };

  const applyFontFamily = () => {
    if (typeof document !== 'undefined' && document.queryCommandSupported?.('fontName')) {
      runEditorCommand('fontName', selectedFontFamily);
      return;
    }

    applyInlineStyle({ 'font-family': selectedFontFamily }, 'Texto');
  };

  const applyFontSize = () => {
    if (typeof document !== 'undefined' && document.queryCommandSupported?.('fontSize')) {
      runEditorCommand('fontSize', String(editorFontSizeMap[selectedFontSize] ?? 3));
      return;
    }

    applyInlineStyle({ 'font-size': `${selectedFontSize}px`, 'line-height': '1.8' }, 'Texto');
  };

  const applyTextColor = () => {
    runEditorCommand('foreColor', selectedTextColor);
  };

  const applyHighlight = () => {
    runEditorCommand('hiliteColor', selectedHighlightColor);
  };

  const applyAlignment = (alignment: 'left' | 'center' | 'right') => {
    runEditorCommand(alignment === 'center' ? 'justifyCenter' : alignment === 'right' ? 'justifyRight' : 'justifyLeft');
  };

  const insertHtmlAtSelection = (html: string) => {
    if (!prepareEditor() || !editorRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      editorRef.current.insertAdjacentHTML('beforeend', html);
      syncEditorValue();
      saveSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragmentWrapper = document.createElement('div');
    fragmentWrapper.innerHTML = html;
    const fragment = document.createDocumentFragment();
    let lastNode: ChildNode | null = null;

    while (fragmentWrapper.firstChild) {
      lastNode = fragment.appendChild(fragmentWrapper.firstChild);
    }

    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    syncEditorValue();
    saveSelection();
  };

  const insertMediaBlock = (kind: 'image' | 'video', src: string, caption: string) => {
    const mediaMarker = `inline-media-${Date.now()}`;
    const mediaHtml = buildInlineMediaHtml(kind, src, caption).replace('<figure ', `<figure data-inline-media-marker="${mediaMarker}" `);
    insertHtmlAtSelection(`${mediaHtml}<p><br></p>`);

    if (editorRef.current) {
      const insertedFigure = editorRef.current.querySelector(`[data-inline-media-marker="${mediaMarker}"]`);
      if (insertedFigure instanceof HTMLElement) {
        insertedFigure.removeAttribute('data-inline-media-marker');
        if (kind === 'image') {
          selectInlineImage(insertedFigure);
        }
        syncEditorValue();
      }
    }
  };

  const handleMediaFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setMediaModal((current) => ({ ...current, selectedFile: file, fileName: file.name }));
    event.target.value = '';
  };

  const handleInsertMedia = async () => {
    let src = mediaModal.sourceUrl.trim();

    if (!src && mediaModal.selectedFile) {
      if (onRegisterMedia) {
        setIsRegisteringMedia(true);

        try {
          const registeredMedia = await onRegisterMedia(mediaModal.kind ?? 'image', mediaModal.selectedFile, mediaModal.caption);
          src = registeredMedia.url;
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao enviar a mídia.');
          return;
        } finally {
          setIsRegisteringMedia(false);
        }
      } else {
        try {
          src = await fileToDataUrl(mediaModal.selectedFile);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao enviar a mídia.');
          return;
        }
      }
    }

    if (!src) {
      return;
    }

    insertMediaBlock(mediaModal.kind ?? 'image', src, mediaModal.caption);
    setMediaModal({ open: false, kind: null, caption: '', sourceUrl: '', selectedFile: null, fileName: '' });
  };

  const handleEditorInput = () => {
    syncEditorValue();
    saveSelection();
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      clearSelectedInlineImage();
      return;
    }

    selectInlineImage(target.closest('figure'));
  };

  const updateSelectedInlineImage = (updates: Partial<{ width: number; alignment: InlineImageAlignment }>) => {
    const figure = selectedInlineImageRef.current;
    if (!figure) {
      return;
    }

    const nextSettings = {
      width: updates.width ?? getInlineImageWidth(figure),
      alignment: updates.alignment ?? getInlineImageAlignment(figure),
    };

    applyInlineImageLayout(figure, nextSettings.width, nextSettings.alignment);
    setSelectedInlineImageSettings(nextSettings);
    syncEditorValue();
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    runEditorCommand('insertParagraph');
  };

  useEffect(() => {
    if (!replaceSelectionRequest) {
      return;
    }
    if (lastReplaceSelectionRequestIdRef.current === replaceSelectionRequest.id) {
      return;
    }
    lastReplaceSelectionRequestIdRef.current = replaceSelectionRequest.id;
    if (!prepareEditor() || !editorRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer) || range.collapsed) {
      return;
    }

    const nextText = replaceSelectionRequest.text;
    const safeHtml = nextText
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('');
    const htmlToInsert = safeHtml || `<p>${nextText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    insertHtmlAtSelection(htmlToInsert);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceSelectionRequest]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-2">
          <select
            value={selectedFontFamily}
            onChange={(event) => setSelectedFontFamily(event.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#87CEEB]"
          >
            {editorFontOptions.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={applyFontFamily} className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#87CEEB] hover:bg-[#EAF8FD] hover:text-[#256B84]">
            Aplicar fonte
          </button>
          <select
            value={selectedFontSize}
            onChange={(event) => setSelectedFontSize(event.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#87CEEB]"
          >
            {editorFontSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <button type="button" onClick={applyFontSize} className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#87CEEB] hover:bg-[#EAF8FD] hover:text-[#256B84]">
            Tamanho
          </button>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
            <PaintBucket className="h-4 w-4" />
            <input type="color" value={selectedTextColor} onChange={(event) => setSelectedTextColor(event.target.value)} className="h-8 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </label>
          <button type="button" onClick={applyTextColor} className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#87CEEB] hover:bg-[#EAF8FD] hover:text-[#256B84]">
            Cor
          </button>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700">
            <Highlighter className="h-4 w-4" />
            <input type="color" value={selectedHighlightColor} onChange={(event) => setSelectedHighlightColor(event.target.value)} className="h-8 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </label>
          <button type="button" onClick={applyHighlight} className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#87CEEB] hover:bg-[#EAF8FD] hover:text-[#256B84]">
            Marca-texto
          </button>
        </div>
        <ToolbarButton icon={Heading1} label="Titulo" onClick={() => insertBlock('h2')} />
        <ToolbarButton icon={Heading2} label="Subtitulo" onClick={() => insertBlock('h3')} />
        <ToolbarButton icon={Pilcrow} label="Paragrafo" onClick={() => insertBlock('p')} />
        <ToolbarButton icon={Bold} label="Negrito" onClick={() => runEditorCommand('bold')} />
        <ToolbarButton icon={Italic} label="Italico" onClick={() => runEditorCommand('italic')} />
        <ToolbarButton icon={Underline} label="Sublinhado" onClick={() => runEditorCommand('underline')} />
        <ToolbarButton icon={Strikethrough} label="Riscado" onClick={() => runEditorCommand('strikeThrough')} />
        <ToolbarButton icon={List} label="Lista" onClick={() => insertList('ul')} />
        <ToolbarButton icon={ListOrdered} label="Lista numerada" onClick={() => insertList('ol')} />
        <ToolbarButton icon={Quote} label="Citacao" onClick={() => insertBlock('blockquote')} />
        <ToolbarButton icon={AlignLeft} label="Esquerda" onClick={() => applyAlignment('left')} />
        <ToolbarButton icon={AlignCenter} label="Centro" onClick={() => applyAlignment('center')} />
        <ToolbarButton icon={AlignRight} label="Direita" onClick={() => applyAlignment('right')} />
        <ToolbarButton icon={Image} label="Imagem" onClick={() => setMediaModal({ open: true, kind: 'image', caption: '', sourceUrl: '', selectedFile: null, fileName: '' })} />
        <ToolbarButton icon={Video} label="Video" onClick={() => setMediaModal({ open: true, kind: 'video', caption: '', sourceUrl: '', selectedFile: null, fileName: '' })} />
        <ToolbarButton icon={Link2} label="Link" onClick={insertLink} />
        <ToolbarButton icon={Eraser} label="Limpar" onClick={clearFormatting} />
      </div>

      {selectedInlineImageSettings && (
        <div className="border-b border-gray-200 bg-[#FFF7F5] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Ajuste da imagem no texto</p>
              <p className="text-xs text-gray-500">Selecione largura e posição da imagem dentro da matéria.</p>
            </div>
            <div className="flex flex-1 flex-col gap-3 lg:max-w-2xl lg:flex-row lg:items-center lg:justify-end">
              <label className="flex items-center gap-3 text-sm text-gray-700">
                <span className="font-semibold">Largura</span>
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={selectedInlineImageSettings.width}
                  onChange={(event) => updateSelectedInlineImage({ width: Number.parseInt(event.target.value, 10) })}
                  className="w-40 accent-[#FF796C]"
                />
                <span className="min-w-12 text-right text-xs font-semibold text-gray-600">{selectedInlineImageSettings.width}%</span>
              </label>
              <div className="flex items-center gap-2">
                <ToolbarButton icon={AlignLeft} label="Esquerda" onClick={() => updateSelectedInlineImage({ alignment: 'left' })} />
                <ToolbarButton icon={AlignCenter} label="Centro" onClick={() => updateSelectedInlineImage({ alignment: 'center' })} />
                <ToolbarButton icon={AlignRight} label="Direita" onClick={() => updateSelectedInlineImage({ alignment: 'right' })} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-gray-200 lg:border-b-0 lg:border-r">
          <label htmlFor={editorId} className="block border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Editor da notícia
          </label>
          <div
            id={editorId}
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyDown={handleEditorKeyDown}
            onClick={handleEditorClick}
            onMouseUp={saveSelection}
            onKeyUp={saveSelection}
            onBlur={saveSelection}
            className="article-rich-content html-editor-surface min-h-0 w-full overflow-y-scroll overflow-x-hidden px-4 py-4 text-sm text-gray-900 outline-none"
            style={{ minHeight, maxHeight: 720 }}
            aria-label={placeholder}
          />
        </div>

        <div className="min-w-0">
          <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Pré-visualização
          </div>
          <div className="max-h-[720px] overflow-y-scroll overflow-x-hidden px-4 py-4 text-gray-900" style={{ minHeight }}>
            <ArticleBodyContent content={previewContent} className="px-0 py-0" images={libraryImages} videos={libraryVideos} />
          </div>
        </div>
      </div>

      {mediaModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Inserir {mediaModal.kind === 'video' ? 'vídeo' : 'imagem'} na matéria</h3>
                <p className="text-sm text-gray-500">Adicione o conteúdo diretamente no corpo da notícia com descrição opcional, sem poluir a edição.</p>
              </div>
              <button type="button" onClick={() => setMediaModal({ open: false, kind: null, caption: '', sourceUrl: '', selectedFile: null, fileName: '' })} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Arquivo local</label>
                <input ref={fileInputRef} type="file" accept={mediaModal.kind === 'video' ? 'video/*' : 'image/*'} onChange={handleMediaFileSelection} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                {mediaModal.fileName && <p className="mt-2 text-xs text-gray-500">Arquivo selecionado: {mediaModal.fileName}</p>}
                {mediaModal.selectedFile && onRegisterMedia && (
                  <p className="mt-1 text-xs text-emerald-700">O arquivo será salvo na mídia da matéria e inserido direto no editor.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Ou informe uma URL</label>
                <input
                  type="url"
                  value={mediaModal.sourceUrl}
                  onChange={(event) => setMediaModal((current) => ({ ...current, sourceUrl: event.target.value }))}
                  placeholder={mediaModal.kind === 'video' ? 'https://exemplo.com/video.mp4' : 'https://exemplo.com/imagem.jpg'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Descrição</label>
                <textarea
                  value={mediaModal.caption}
                  onChange={(event) => setMediaModal((current) => ({ ...current, caption: event.target.value }))}
                  rows={3}
                  placeholder="Descreva a imagem ou vídeo para o leitor"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#FF796C] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setMediaModal({ open: false, kind: null, caption: '', sourceUrl: '', selectedFile: null, fileName: '' })} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleInsertMedia()} disabled={isRegisteringMedia} className="rounded-lg bg-[#FF796C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#f35f50] disabled:cursor-not-allowed disabled:opacity-70">
                {isRegisteringMedia ? 'Inserindo...' : 'Inserir no texto'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .html-editor-surface:empty::before {
          content: attr(aria-label);
          color: #9ca3af;
        }

        .html-editor-surface :global(figure[data-editor-selected='true']) {
          outline: 2px solid #ff796c;
          outline-offset: 6px;
        }
      `}</style>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: typeof Bold;
  label: string;
  onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#87CEEB] hover:bg-[#EAF8FD] hover:text-[#256B84]"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
