import { AggFnName, ColumnNode, PivotRow } from '../types';
import { makeCellKey } from './pivot-data.service';

export type PivotSortDirection = 'asc' | 'desc';

export function sortTopLevelColumnNodesByRow(
  nodes: readonly ColumnNode[],
  rowData: Record<string, unknown>,
  fieldId: string,
  aggFn: AggFnName,
  direction: PivotSortDirection
): ColumnNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const va = numericSortValue(rowData[makeCellKey(a.node.key, fieldId, aggFn)]);
      const vb = numericSortValue(rowData[makeCellKey(b.node.key, fieldId, aggFn)]);
      const diff = direction === 'asc' ? va - vb : vb - va;
      return diff || a.index - b.index;
    })
    .map(({ node }) => node);
}

export function preservePivotRowHierarchy<T extends Pick<PivotRow, '__key' | '__rowKeys'>>(
  rows: readonly T[],
  sortedKeys: readonly string[]
): T[] {
  if (rows.length <= 1) return [...rows];

  const sourceIndex = new Map(rows.map((row, index) => [row.__key, index]));
  const rank = new Map(sortedKeys.map((key, index) => [key, index]));
  const rowByKey = new Map(rows.map(row => [row.__key, row]));
  const childrenByParent = new Map<string, T[]>();
  const roots: T[] = [];

  for (const row of rows) {
    const parentKey = getVisibleParentKey(row, rowByKey);
    if (!parentKey) {
      roots.push(row);
      continue;
    }
    let siblings = childrenByParent.get(parentKey);
    if (!siblings) {
      siblings = [];
      childrenByParent.set(parentKey, siblings);
    }
    siblings.push(row);
  }

  const bySortedRank = (a: T, b: T) => {
    const ra = rank.get(a.__key) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.__key) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || (sourceIndex.get(a.__key) ?? 0) - (sourceIndex.get(b.__key) ?? 0);
  };

  roots.sort(bySortedRank);
  for (const siblings of childrenByParent.values()) siblings.sort(bySortedRank);

  const result: T[] = [];
  const append = (row: T) => {
    result.push(row);
    for (const child of childrenByParent.get(row.__key) ?? []) append(child);
  };
  for (const root of roots) append(root);
  return result;
}

function numericSortValue(value: unknown): number {
  return typeof value === 'number' ? value : -Infinity;
}

function getVisibleParentKey<T extends Pick<PivotRow, '__rowKeys'>>(
  row: T,
  rowByKey: ReadonlyMap<string, T>
): string {
  for (let depth = row.__rowKeys.length - 1; depth > 0; depth--) {
    const key = row.__rowKeys.slice(0, depth).join('|||');
    if (rowByKey.has(key)) return key;
  }
  return '';
}
