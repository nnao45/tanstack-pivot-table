import { Injectable } from '@angular/core';
import { AggFnName, ColumnNode, PivotConfig, PivotDataResult, PivotRow, SaleRecord } from '../types';

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SEP = '|||';
const TOTAL_KEY = '__total__';
const TOTAL_KEYS = [TOTAL_KEY];
const MONTH_RANK = new Map(MONTH_ORDER.map((month, index) => [month, index]));

interface MeasureStats {
  count: number;
  sum: number;
  min: number;
  max: number;
}

type BucketStats = Map<string, MeasureStats>;

interface MeasurePlanEntry {
  field: string;
  key: keyof SaleRecord;
  needsValueStats: boolean;
}

type MeasurePlan = MeasurePlanEntry[];

interface RowEntry {
  parts: string[];
  parentKey: string;
}

interface MutableColumnNode extends ColumnNode {
  childMap: Map<string, MutableColumnNode>;
  children: MutableColumnNode[];
}

interface ValueWritePlan {
  fieldId: string;
  aggFn: AggFnName;
  key: string;
}

interface CellWritePlan {
  colKey: string;
  values: ValueWritePlan[];
}

export function makeCellKey(colKey: string, fieldId: string, aggFn: AggFnName): string {
  return `__cell__${colKey}__${fieldId}__${aggFn}`;
}

export function makeRowTotalKey(fieldId: string, aggFn: AggFnName): string {
  return `__rowTotal__${fieldId}__${aggFn}`;
}

function aggregate(stats: BucketStats | undefined, fieldId: string, fn: AggFnName): number {
  const fieldStats = stats?.get(fieldId);
  if (!fieldStats || fieldStats.count === 0) return fn === 'count' ? 0 : 0;
  switch (fn) {
    case 'count': return fieldStats.count;
    case 'sum': return fieldStats.sum;
    case 'avg': return fieldStats.sum / fieldStats.count;
    case 'min': return fieldStats.min;
    case 'max': return fieldStats.max;
  }
}

function columnSortFn(fieldId: string) {
  return (a: string, b: string) => {
    if (fieldId === 'month') return (MONTH_RANK.get(a) ?? 99) - (MONTH_RANK.get(b) ?? 99);
    return a.localeCompare(b);
  };
}

function collectAllColKeys(nodes: ColumnNode[]): string[] {
  const keys: string[] = [];
  const stack = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    keys.push(node.key);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return keys;
}

@Injectable({ providedIn: 'root' })
export class PivotDataService {
  compute(rawData: SaleRecord[], config: PivotConfig): PivotDataResult {
    const { rowFields, columnFields, valueFields } = config;

    if (rowFields.length === 0 || valueFields.length === 0) {
      return { rows: [], columnNodes: [], grandTotal: emptyRow('Grand Total', -1), childrenMap: new Map() };
    }

    if (valueFields.length === 1 && valueFields[0].aggFn === 'sum') {
      return computeSingleSum(rawData, rowFields, columnFields, valueFields[0].fieldId);
    }

    // Step 1: build aggregate buckets and the column tree in a single raw-data pass.
    const measurePlan = buildMeasurePlan(valueFields);
    const cellBuckets = new Map<string, Map<string, BucketStats>>();
    const rowTotalBuckets = new Map<string, BucketStats>();
    const colBuckets = new Map<string, BucketStats>();
    const grandStats = createBucketStats();
    const rowEntries = new Map<string, RowEntry>();
    const columnRoots: MutableColumnNode[] = [];
    const columnRootMap = new Map<string, MutableColumnNode>();

    for (const record of rawData) {
      addToBucket(grandStats, record, measurePlan);

      const rowValues = rowFields.map(field => String(record[field as keyof SaleRecord]));
      const rowKeys = buildNestedKeys(rowValues);
      const colKeys = columnFields.length === 0 ? TOTAL_KEYS : buildColumnKeys(record, columnFields, columnRoots, columnRootMap);

      for (let rowDepth = 1; rowDepth <= rowFields.length; rowDepth++) {
        const rowKey = rowKeys[rowDepth - 1];
        if (!rowEntries.has(rowKey)) {
          rowEntries.set(rowKey, {
            parts: rowValues.slice(0, rowDepth),
            parentKey: rowDepth > 1 ? rowKeys[rowDepth - 2] : '',
          });
        }
        addToStatsMap(rowTotalBuckets, rowKey, record, measurePlan);

        for (const colKey of colKeys) {
          addToCellStatsMap(cellBuckets, rowKey, colKey, record, measurePlan);
        }
      }

      for (const colKey of colKeys) {
        addToStatsMap(colBuckets, colKey, record, measurePlan);
      }
    }

    const columnNodes = columnFields.length > 0
      ? finalizeColumnNodes(columnRoots)
      : [{ value: 'Total', field: '', key: TOTAL_KEY, depth: 0, children: [] } as ColumnNode];
    const allColKeys = collectAllColKeys(columnNodes);
    const cellWritePlans: CellWritePlan[] = allColKeys.map(colKey => ({
      colKey,
      values: valueFields.map(vf => ({
        fieldId: vf.fieldId,
        aggFn: vf.aggFn,
        key: makeCellKey(colKey, vf.fieldId, vf.aggFn),
      })),
    }));
    const rowTotalWritePlans: ValueWritePlan[] = valueFields.map(vf => ({
      fieldId: vf.fieldId,
      aggFn: vf.aggFn,
      key: makeRowTotalKey(vf.fieldId, vf.aggFn),
    }));

    // Step 2: collect unique row group keys
    const allRowEntries = [...rowEntries.entries()];
    allRowEntries.sort((a, b) => {
      const da = a[1].parts.length;
      const db = b[1].parts.length;
      if (da !== db) return da - db;
      return a[0].localeCompare(b[0]);
    });

    // Step 3: build PivotRows and childrenMap in sorted order.
    const rootRows: PivotRow[] = [];
    const childrenMap = new Map<string, PivotRow[]>();
    for (const [rowKey, { parts, parentKey }] of allRowEntries) {
      const depth = parts.length - 1;
      const row: PivotRow = {
        __rowKeys: parts,
        __key: rowKey,
        __depth: depth,
        __isGroup: depth < rowFields.length - 1,
        __label: parts[parts.length - 1],
      };

      // Cell values for ALL column keys at all depths
      const rowCellBuckets = cellBuckets.get(rowKey);
      for (const cellPlan of cellWritePlans) {
        const bucket = rowCellBuckets?.get(cellPlan.colKey);
        for (const valuePlan of cellPlan.values) {
          row[valuePlan.key] = bucket
            ? aggregate(bucket, valuePlan.fieldId, valuePlan.aggFn)
            : null;
        }
      }

      // Row total: use pre-built bucket (no rawData re-scan)
      const rowTotalStats = rowTotalBuckets.get(rowKey);
      for (const valuePlan of rowTotalWritePlans) {
        row[valuePlan.key] = aggregate(rowTotalStats, valuePlan.fieldId, valuePlan.aggFn);
      }

      if (depth === 0) {
        rootRows.push(row);
      } else {
        let siblings = childrenMap.get(parentKey);
        if (!siblings) {
          siblings = [];
          childrenMap.set(parentKey, siblings);
        }
        siblings.push(row);
      }
    }

    // Step 4: grand total (use pre-built colBuckets, no rawData re-scan)
    const grandTotal: PivotRow = emptyRow('Grand Total', -1);
    for (const cellPlan of cellWritePlans) {
      const statsForCol = cellPlan.colKey === TOTAL_KEY ? grandStats : colBuckets.get(cellPlan.colKey);
      for (const valuePlan of cellPlan.values) {
        grandTotal[valuePlan.key] = aggregate(statsForCol, valuePlan.fieldId, valuePlan.aggFn);
      }
    }
    for (const valuePlan of rowTotalWritePlans) {
      grandTotal[valuePlan.key] = aggregate(grandStats, valuePlan.fieldId, valuePlan.aggFn);
    }

    return { rows: rootRows, columnNodes, grandTotal, childrenMap };
  }
}

function computeSingleSum(
  rawData: SaleRecord[],
  rowFields: string[],
  columnFields: string[],
  fieldId: string
): PivotDataResult {
  const measureKey = fieldId as keyof SaleRecord;
  const cellBuckets = new Map<string, Map<string, number>>();
  const rowTotalBuckets = new Map<string, number>();
  const colBuckets = new Map<string, number>();
  const rowEntries = new Map<string, RowEntry>();
  const columnRoots: MutableColumnNode[] = [];
  const columnRootMap = new Map<string, MutableColumnNode>();
  let grandTotalValue = 0;

  for (const record of rawData) {
    const value = Number(record[measureKey]);
    grandTotalValue += value;

    const rowValues = rowFields.map(field => String(record[field as keyof SaleRecord]));
    const rowKeys = buildNestedKeys(rowValues);
    const colKeys = columnFields.length === 0 ? TOTAL_KEYS : buildColumnKeys(record, columnFields, columnRoots, columnRootMap);

    for (let rowDepth = 1; rowDepth <= rowFields.length; rowDepth++) {
      const rowKey = rowKeys[rowDepth - 1];
      if (!rowEntries.has(rowKey)) {
        rowEntries.set(rowKey, {
          parts: rowValues.slice(0, rowDepth),
          parentKey: rowDepth > 1 ? rowKeys[rowDepth - 2] : '',
        });
      }

      rowTotalBuckets.set(rowKey, (rowTotalBuckets.get(rowKey) ?? 0) + value);

      let rowBuckets = cellBuckets.get(rowKey);
      if (!rowBuckets) {
        rowBuckets = new Map<string, number>();
        cellBuckets.set(rowKey, rowBuckets);
      }
      for (const colKey of colKeys) {
        rowBuckets.set(colKey, (rowBuckets.get(colKey) ?? 0) + value);
      }
    }

    for (const colKey of colKeys) {
      colBuckets.set(colKey, (colBuckets.get(colKey) ?? 0) + value);
    }
  }

  const aggFn: AggFnName = 'sum';
  const columnNodes = columnFields.length > 0
    ? finalizeColumnNodes(columnRoots)
    : [{ value: 'Total', field: '', key: TOTAL_KEY, depth: 0, children: [] } as ColumnNode];
  const allColKeys = collectAllColKeys(columnNodes);
  const cellWritePlans = allColKeys.map(colKey => ({
    colKey,
    key: makeCellKey(colKey, fieldId, aggFn),
  }));
  const rowTotalKey = makeRowTotalKey(fieldId, aggFn);

  const allRowEntries = [...rowEntries.entries()];
  allRowEntries.sort((a, b) => {
    const da = a[1].parts.length;
    const db = b[1].parts.length;
    if (da !== db) return da - db;
    return a[0].localeCompare(b[0]);
  });

  const rootRows: PivotRow[] = [];
  const childrenMap = new Map<string, PivotRow[]>();
  for (const [rowKey, { parts, parentKey }] of allRowEntries) {
    const depth = parts.length - 1;
    const row: PivotRow = {
      __rowKeys: parts,
      __key: rowKey,
      __depth: depth,
      __isGroup: depth < rowFields.length - 1,
      __label: parts[parts.length - 1],
    };

    const rowCellBuckets = cellBuckets.get(rowKey);
    for (const cellPlan of cellWritePlans) {
      row[cellPlan.key] = rowCellBuckets?.get(cellPlan.colKey) ?? null;
    }
    row[rowTotalKey] = rowTotalBuckets.get(rowKey) ?? 0;

    if (depth === 0) {
      rootRows.push(row);
    } else {
      let siblings = childrenMap.get(parentKey);
      if (!siblings) {
        siblings = [];
        childrenMap.set(parentKey, siblings);
      }
      siblings.push(row);
    }
  }

  const grandTotal = emptyRow('Grand Total', -1);
  for (const cellPlan of cellWritePlans) {
    grandTotal[cellPlan.key] = cellPlan.colKey === TOTAL_KEY
      ? grandTotalValue
      : (colBuckets.get(cellPlan.colKey) ?? 0);
  }
  grandTotal[rowTotalKey] = grandTotalValue;

  return { rows: rootRows, columnNodes, grandTotal, childrenMap };
}

function buildNestedKeys(values: string[]): string[] {
  const keys: string[] = [];
  let key = '';
  for (const value of values) {
    key = key ? `${key}${SEP}${value}` : value;
    keys.push(key);
  }
  return keys;
}

function buildColumnKeys(
  record: SaleRecord,
  fields: string[],
  roots: MutableColumnNode[],
  rootMap: Map<string, MutableColumnNode>
): string[] {
  const keys: string[] = [];
  let key = '';
  let siblings = roots;
  let siblingMap = rootMap;

  for (let depth = 0; depth < fields.length; depth++) {
    const field = fields[depth];
    const value = String(record[field as keyof SaleRecord]);
    key = key ? `${key}${SEP}${value}` : value;
    keys.push(key);

    let node = siblingMap.get(value);
    if (!node) {
      node = { value, field, key, depth, children: [], childMap: new Map() };
      siblingMap.set(value, node);
      siblings.push(node);
    }
    siblings = node.children;
    siblingMap = node.childMap;
  }

  return keys;
}

function finalizeColumnNodes(nodes: MutableColumnNode[]): ColumnNode[] {
  nodes.sort((a, b) => columnSortFn(a.field)(a.value, b.value));
  return nodes.map(({ childMap: _childMap, children, ...node }) => ({
    ...node,
    children: finalizeColumnNodes(children),
  }));
}

function createBucketStats(): BucketStats {
  return new Map<string, MeasureStats>();
}

function buildMeasurePlan(valueFields: { fieldId: string; aggFn: AggFnName }[]): MeasurePlan {
  const needsValueStatsByField = new Map<string, boolean>();
  for (const { fieldId, aggFn } of valueFields) {
    needsValueStatsByField.set(fieldId, (needsValueStatsByField.get(fieldId) ?? false) || aggFn !== 'count');
  }
  return [...needsValueStatsByField].map(([field, needsValueStats]) => ({
    field,
    key: field as keyof SaleRecord,
    needsValueStats,
  }));
}

function addToStatsMap(map: Map<string, BucketStats>, key: string, record: SaleRecord, measurePlan: MeasurePlan) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = createBucketStats();
    map.set(key, bucket);
  }
  addToBucket(bucket, record, measurePlan);
}

function addToCellStatsMap(
  map: Map<string, Map<string, BucketStats>>,
  rowKey: string,
  colKey: string,
  record: SaleRecord,
  measurePlan: MeasurePlan
) {
  let rowBuckets = map.get(rowKey);
  if (!rowBuckets) {
    rowBuckets = new Map<string, BucketStats>();
    map.set(rowKey, rowBuckets);
  }
  addToStatsMap(rowBuckets, colKey, record, measurePlan);
}

function addToBucket(bucket: BucketStats, record: SaleRecord, measurePlan: MeasurePlan) {
  for (const { field, key, needsValueStats } of measurePlan) {
    let stats = bucket.get(field);
    if (!stats) {
      stats = { count: 0, sum: 0, min: Infinity, max: -Infinity };
      bucket.set(field, stats);
    }
    stats.count++;
    if (!needsValueStats) continue;
    const value = Number(record[key]);
    stats.sum += value;
    if (value < stats.min) stats.min = value;
    if (value > stats.max) stats.max = value;
  }
}

function emptyRow(label: string, depth: number): PivotRow {
  return { __rowKeys: [label], __key: label, __depth: depth, __isGroup: false, __label: label };
}
