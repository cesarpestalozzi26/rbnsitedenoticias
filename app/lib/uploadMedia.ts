const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Envia direto ao Supabase Storage via URL assinada, sem passar pelo corpo
// de uma função da Vercel (que retorna HTTP 413 acima de ~4,5 MB).
export async function uploadMedia(file: Blob, fileName: string): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Arquivo maior que 50 MB. Comprima o arquivo ou use um link de vídeo.');
  }

  const signResponse = await fetch('/api/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ fileName, contentType: file.type, size: file.size }),
  });
  const signed = (await signResponse.json().catch(() => ({}))) as { uploadUrl?: string; publicUrl?: string; error?: string };
  if (!signResponse.ok || !signed.uploadUrl || !signed.publicUrl) {
    throw new Error(signed.error || `Falha ao preparar o envio (${signResponse.status}).`);
  }

  const form = new FormData();
  form.append('cacheControl', '31536000');
  form.append('', file);
  const uploadResponse = await fetch(signed.uploadUrl, { method: 'PUT', body: form });
  if (!uploadResponse.ok) {
    throw new Error(`Falha ao enviar o arquivo (${uploadResponse.status}).`);
  }

  return signed.publicUrl;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload = ''] = dataUrl.split(',');
  const mime = /^data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

// Envia uma imagem (data URL) ao Storage; se falhar e ela for pequena, mantém
// o data URL para não perder a edição.
export async function uploadDataUrlOrKeep(dataUrl: string, fileName: string) {
  try {
    return await uploadMedia(dataUrlToBlob(dataUrl), fileName);
  } catch (error) {
    if (dataUrl.length < 1_500_000) return dataUrl;
    throw error;
  }
}
