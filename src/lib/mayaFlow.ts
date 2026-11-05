import type {
  MayaContent,
  MayaDestination,
  MayaNode,
  MayaOption,
  MayaOptionTo,
} from '../constants/maya/discover';

export type MayaStep = MayaDestination | { type: 'stay' };

export type MayaAnswers = Record<string, string | string[] | number>;

export function nodeById(content: MayaContent, id: string): MayaNode | null {
  return content.nodes.find((node) => node.id === id) ?? null;
}

export function startHistory(content: MayaContent): string[] {
  return [content.startId];
}

/** The node before the current one on the path actually taken. */
export function previousNode(content: MayaContent, history: readonly string[]): MayaNode | null {
  if (history.length < 2) {
    return null;
  }
  const id = history[history.length - 2];
  return id ? nodeById(content, id) : null;
}

export function historyBack(history: readonly string[]): string[] {
  if (history.length < 2) {
    return [...history];
  }
  return history.slice(0, -1);
}

export function historyForward(history: readonly string[], id: string): string[] {
  return [...history, id];
}

export function visibleOptions(
  content: MayaContent,
  node: MayaNode,
  answers: MayaAnswers,
): MayaOption[] {
  if (!node.optionsFrom) {
    return node.options ?? [];
  }
  const source = nodeById(content, node.optionsFrom);
  const selected = answers[node.optionsFrom];
  const ids = Array.isArray(selected) ? selected : [];
  return (source?.options ?? []).filter((option) => ids.includes(option.id));
}

export function isAnswered(node: MayaNode, answers: MayaAnswers): boolean {
  const value = answers[node.id];
  if (node.kind === 'multi') {
    return Array.isArray(value) && value.length > 0;
  }
  if (node.kind === 'text') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  if (node.kind === 'scale') {
    return typeof value === 'number';
  }
  if (node.kind === 'single' || node.kind === 'message' || node.kind === 'playback') {
    return typeof value === 'string' && value.length > 0;
  }
  return false;
}

/** Next, Skip when the question can be passed unanswered, or null when buttons advance. */
export function advanceLabel(node: MayaNode, answers: MayaAnswers): 'Next' | 'Skip' | null {
  if (node.kind === 'message' || node.kind === 'playback') {
    return null;
  }
  if (node.skippable && !isAnswered(node, answers)) {
    return 'Skip';
  }
  return 'Next';
}

export function advanceEnabled(node: MayaNode, answers: MayaAnswers): boolean {
  const label = advanceLabel(node, answers);
  if (label === 'Skip') {
    return true;
  }
  if (label === 'Next') {
    return isAnswered(node, answers);
  }
  return false;
}

export function resolveNext(
  content: MayaContent,
  node: MayaNode,
  answers: MayaAnswers,
): MayaStep {
  return expand(content, answers, stepFor(content, node, answers));
}

export function renderNodeText(
  content: MayaContent,
  node: MayaNode,
  answers: MayaAnswers,
  vars: { name: string; now: Date },
): string {
  const month = monthName(addMonths(vars.now, 3));
  const phrase = hardPhrase(content, answers);
  const because = phrase ? `, mostly because ${phrase}` : '';
  const better = textAnswer(answers, content.betterId);
  return fill(node.text, {
    name: vars.name.trim(),
    month,
    area: areaLabel(content, answers),
    because,
    better,
  });
}

function stepFor(content: MayaContent, node: MayaNode, answers: MayaAnswers): MayaOptionTo | null {
  const rule = node.next;
  if (rule.type === 'goto') {
    return { type: 'node', id: rule.id };
  }
  if (rule.type === 'choice') {
    const chosen = answers[node.id];
    if (typeof chosen !== 'string') {
      return null;
    }
    return visibleOptions(content, node, answers).find((option) => option.id === chosen)?.to ?? null;
  }
  if (rule.type === 'areas') {
    const selected = stringList(answers[node.id]);
    if (selected.length >= 2) {
      return { type: 'node', id: content.pickId };
    }
    if (selected.length === 1) {
      return { type: 'node', id: branchId(content, selected[0]) };
    }
    return null;
  }
  if (rule.type === 'branch') {
    const picked = answers[node.id];
    if (typeof picked !== 'string' || !picked) {
      return null;
    }
    return { type: 'node', id: branchId(content, picked) };
  }
  if (rule.type === 'scale') {
    const value = answers[node.id];
    if (typeof value !== 'number') {
      return null;
    }
    return { type: 'node', id: value >= rule.minHigh ? rule.high : rule.low };
  }
  if (rule.type === 'fix') {
    return { type: 'fix' };
  }
  return null;
}

function expand(content: MayaContent, answers: MayaAnswers, to: MayaOptionTo | null): MayaStep {
  if (!to) {
    return { type: 'stay' };
  }
  if (to.type === 'fix') {
    const areaId = focusedAreaId(content, answers);
    return { type: 'node', id: areaId ? branchId(content, areaId) : content.betterId };
  }
  return to;
}

function branchId(content: MayaContent, areaId: string): string {
  const option = optionOn(content, content.areaId, areaId);
  return option?.branch ?? content.betterId;
}

export function focusedArea(
  content: MayaContent,
  answers: MayaAnswers,
): { id: string | null; label: string } {
  const id = focusedAreaId(content, answers);
  if (!id) {
    return { id: null, label: '' };
  }
  return { id, label: optionOn(content, content.areaId, id)?.label ?? '' };
}

function focusedAreaId(content: MayaContent, answers: MayaAnswers): string | null {
  const selected = stringList(answers[content.areaId]);
  const pick = answers[content.pickId];
  if (selected.length >= 2 && typeof pick === 'string' && selected.includes(pick)) {
    return pick;
  }
  if (selected.length === 1) {
    return selected[0] ?? null;
  }
  return null;
}

function hardPhrase(content: MayaContent, answers: MayaAnswers): string | null {
  const areaId = focusedAreaId(content, answers);
  if (!areaId) {
    return null;
  }
  const area = optionOn(content, content.areaId, areaId);
  if (!area) {
    return null;
  }
  if (area.phraseNode) {
    return phraseFromNode(content, area.phraseNode, answers);
  }
  if (!area.branch) {
    return null;
  }
  const chosen = answers[area.branch];
  if (typeof chosen !== 'string') {
    return null;
  }
  const follow = optionOn(content, area.branch, chosen);
  if (follow?.to?.type === 'node') {
    return phraseFromNode(content, follow.to.id, answers);
  }
  return null;
}

function phraseFromNode(content: MayaContent, nodeId: string, answers: MayaAnswers): string | null {
  const node = nodeById(content, nodeId);
  if (!node?.playsPhrase) {
    return null;
  }
  const chosen = answers[nodeId];
  if (typeof chosen !== 'string') {
    return null;
  }
  const phrase = node.options?.find((option) => option.id === chosen)?.phrase;
  return phrase?.trim() ? phrase : null;
}

function areaLabel(content: MayaContent, answers: MayaAnswers): string {
  const areaId = focusedAreaId(content, answers);
  if (!areaId) {
    return 'This';
  }
  return optionOn(content, content.areaId, areaId)?.label ?? 'This';
}

function optionOn(content: MayaContent, nodeId: string, optionId: string): MayaOption | null {
  return nodeById(content, nodeId)?.options?.find((option) => option.id === optionId) ?? null;
}

function textAnswer(answers: MayaAnswers, nodeId: string): string {
  const value = answers[nodeId];
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: MayaAnswers[string] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function fill(template: string, vars: Record<string, string>): string {
  let text = template;
  if (!vars.name) {
    text = text.replace('Hey [name], ', 'Hey, ');
  }
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`[${key}]`).join(value);
  }
  return text;
}

function addMonths(from: Date, count: number): Date {
  return new Date(from.getFullYear(), from.getMonth() + count, 1);
}

function monthName(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long' });
}
