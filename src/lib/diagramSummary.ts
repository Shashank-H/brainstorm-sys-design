import type { DiagramSnapshot, DiagramSummary } from '../types';

function isDeleted(element: { isDeleted?: boolean }) {
  return Boolean(element.isDeleted);
}

export function createDiagramSummary(snapshot: DiagramSnapshot): DiagramSummary {
  const liveElements = snapshot.elements.filter((element) => !isDeleted(element));
  const textLabels = liveElements
    .filter((element) => element.type === 'text')
    .map((element) => ('text' in element && typeof element.text === 'string' ? element.text.trim() : ''))
    .filter(Boolean)
    .slice(0, 80);

  const groups: Record<string, number> = {};
  for (const element of liveElements) {
    for (const groupId of element.groupIds ?? []) {
      groups[groupId] = (groups[groupId] ?? 0) + 1;
    }
  }

  const arrows = liveElements
    .filter((element) => element.type === 'arrow')
    .map((element) => ({
      id: element.id,
      text: 'text' in element && typeof element.text === 'string' ? element.text : undefined,
      startBoundElementId:
        'startBinding' in element ? element.startBinding?.elementId ?? null : null,
      endBoundElementId: 'endBinding' in element ? element.endBinding?.elementId ?? null : null,
    }));

  const shapeTypes = ['rectangle', 'diamond', 'ellipse', 'image', 'frame', 'embeddable'];
  const unlabeled = liveElements.filter((element) =>
    shapeTypes.includes(element.type) &&
    !('text' in element && typeof element.text === 'string' && element.text.trim())
  );

  return {
    elementCount: liveElements.length,
    textLabels,
    arrows,
    groups,
    unlabeledElementCount: unlabeled.length,
    obviousUnlabeledComponents: unlabeled.slice(0, 20).map((element) => `${element.type}:${element.id}`),
    imageGeneratedAt: Date.now(),
  };
}

export function formatDiagramSummary(summary: DiagramSummary): string {
  return JSON.stringify(summary, null, 2);
}

export function meaningfulSceneSignature(snapshot: DiagramSnapshot): string {
  const liveElements = snapshot.elements
    .filter((element) => !isDeleted(element))
    .map((element) => ({
      id: element.id,
      type: element.type,
      x: Math.round(element.x),
      y: Math.round(element.y),
      w: Math.round(element.width),
      h: Math.round(element.height),
      version: element.version,
      text: 'text' in element ? element.text : undefined,
    }));
  return JSON.stringify(liveElements);
}
