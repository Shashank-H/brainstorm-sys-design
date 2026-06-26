import { exportToBlob } from '@excalidraw/excalidraw';
import type { DiagramExport, DiagramSnapshot } from '../types';
import { createDiagramSummary } from './diagramSummary';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function exportDiagramImage(
  snapshot: DiagramSnapshot,
  mimeType: 'image/png' | 'image/webp' = 'image/png',
): Promise<DiagramExport> {
  const elements = snapshot.elements.filter((element) => !element.isDeleted);
  const blob = await exportToBlob({
    elements,
    appState: {
      ...snapshot.appState,
      exportBackground: true,
      viewBackgroundColor: snapshot.appState.viewBackgroundColor ?? '#ffffff',
    },
    files: snapshot.files,
    mimeType,
    quality: 0.92,
    exportPadding: 24,
    maxWidthOrHeight: 1600,
  });

  return {
    base64: await blobToBase64(blob),
    mimeType,
    summary: createDiagramSummary(snapshot),
  };
}
