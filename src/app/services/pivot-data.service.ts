import { Injectable } from '@angular/core';
import { AggFnName, ColumnNode, PivotConfig, PivotDataResult, PivotRow, SaleRecord } from '../types';

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SEP = '|||';
const COL_SEP = '__COL__';
const TOTAL_KEY = '__total__';

export function makeCellKey(colKey: string, fieldId: string, aggFn: AggFnName): string {
  return `__cell__${colKey}__${fieldId}__${aggFn}`;
}

export function makeRowTotalKey(fieldId: string, aggFn: AggFnName): string {
  return `__rowTotal__${fieldId}__${aggFn}`;
}

function aggregate(records: SaleRecord[], fieldId: string, fn: AggFnName): number {
  if (fn === 'count') return records.length;
  if (records.length === 0) return 0;
  const key = fieldId as keyof SaleRecord;
  let sum = 0, min = Infinity, max = -Infinity;
  for (const r of records) {
    const v = Number(r[key]);
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  switch (fn) {
    case 'sum': return sum;
    case 'avg': return sum / records.length;
    case 'min': return min;
    case 'max': return max;
  }
}

function columnSortFn(fieldId: string) {
  return (a: string, b: string) => {
    if (fieldId === 'month') return MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b);
    return a.localeCompare(b);
  };
}

function buildColumnTree(
  data: SaleRecord[],
  fields: string[],
  depth: number,
  parentKey: string
): ColumnNode[] {
  if (fields.length === 0) return [];
  const [field, ...rest] = fields;
  const fkey = field as keyof SaleRecord;
  const grouped = new Map<string, SaleRecord[]>();
  for (const r of data) {
    const val = String(r[fkey]);
    const bucket = grouped.get(val);
    if (bucket) bucket.push(r);
    else grouped.set(val, [r]);
  }
  const uniqueVals = [...grouped.keys()].sort(columnSortFn(field));
  return uniqueVals.map(val => {
    const key = parentKey ? `${parentKey}${SEP}${val}` : val;
    return { value: val, field, key, depth, children: buildColumnTree(grouped.get(val)!, rest, depth + 1, key) };
  });
}

function collectAllColKeys(nodes: ColumnNode[]): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    keys.push(node.key);
    if (node.children.length > 0) keys.push(...collectAllColKeys(node.children));
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

    // Step 1: build column node tree
    const columnNodes = columnFields.length > 0
      ? buildColumnTree(rawData, columnFields, 0, '')
      : [{ value: 'Total', field: '', key: TOTAL_KEY, depth: 0, children: [] } as ColumnNode];

    const allColKeys = collectAllColKeys(columnNodes);

    // Step 2: build cell buckets at ALL column depths
    // key = rowGroupKey__COL__colKey
    const cellBuckets = new Map<string, SaleRecord[]>();
    const rowTotalBuckets = new Map<string, SaleRecord[]>();
    const colBuckets = new Map<string, SaleRecord[]>();

    for (const record of rawData) {
      for (let rowDepth = 1; rowDepth <= rowFields.length; rowDepth++) {
        const rowKey = rowFields.slice(0, rowDepth).map(f => String(record[f as keyof SaleRecord])).join(SEP);
        addToBucket(rowTotalBuckets, rowKey, record);

        if (columnFields.length === 0) {
          addToBucket(cellBuckets, `${rowKey}${COL_SEP}${TOTAL_KEY}`, record);
        } else {
          // Add to bucket at every column depth
          for (let colDepth = 1; colDepth <= columnFields.length; colDepth++) {
            const colKey = columnFields.slice(0, colDepth).map(f => String(record[f as keyof SaleRecord])).join(SEP);
            addToBucket(cellBuckets, `${rowKey}${COL_SEP}${colKey}`, record);
          }
        }
      }
      // Column-only buckets for grand total (counted once per record, outside rowDepth loop)
      for (let colDepth = 1; colDepth <= columnFields.length; colDepth++) {
        const colKey = columnFields.slice(0, colDepth).map(f => String(record[f as keyof SaleRecord])).join(SEP);
        addToBucket(colBuckets, colKey, record);
      }
    }

    // Step 3: collect unique row group keys
    const allRowKeyStrings = [...new Set([...cellBuckets.keys()].map(k => k.split(COL_SEP)[0]))];
    allRowKeyStrings.sort((a, b) => {
      const da = a.split(SEP).length;
      const db = b.split(SEP).length;
      if (da !== db) return da - db;
      return a.localeCompare(b);
    });

    // Step 4: build PivotRow for each row group key
    const allRows: PivotRow[] = allRowKeyStrings.map(rowKey => {
      const parts = rowKey.split(SEP);
      const depth = parts.length - 1;
      const row: PivotRow = {
        __rowKeys: parts,
        __depth: depth,
        __isGroup: depth < rowFields.length - 1,
        __label: parts[parts.length - 1],
      };

      // Cell values for ALL column keys at all depths
      for (const colKey of allColKeys) {
        for (const vf of valueFields) {
          const recs = cellBuckets.get(`${rowKey}${COL_SEP}${colKey}`) ?? [];
          row[makeCellKey(colKey, vf.fieldId, vf.aggFn)] = recs.length > 0
            ? aggregate(recs, vf.fieldId, vf.aggFn)
            : null;
        }
      }

      // Row total: use pre-built bucket (no rawData re-scan)
      const rowTotalRecs = rowTotalBuckets.get(rowKey) ?? [];
      for (const vf of valueFields) {
        row[makeRowTotalKey(vf.fieldId, vf.aggFn)] = aggregate(rowTotalRecs, vf.fieldId, vf.aggFn);
      }

      return row;
    });

    // Step 5: grand total (use pre-built colBuckets, no rawData re-scan)
    const grandTotal: PivotRow = emptyRow('Grand Total', -1);
    for (const colKey of allColKeys) {
      const recsForCol = colKey === TOTAL_KEY ? rawData : (colBuckets.get(colKey) ?? []);
      for (const vf of valueFields) {
        grandTotal[makeCellKey(colKey, vf.fieldId, vf.aggFn)] = aggregate(recsForCol, vf.fieldId, vf.aggFn);
      }
    }
    for (const vf of valueFields) {
      grandTotal[makeRowTotalKey(vf.fieldId, vf.aggFn)] = aggregate(rawData, vf.fieldId, vf.aggFn);
    }

    // Step 6: build childrenMap for row tree
    const childrenMap = new Map<string, PivotRow[]>();
    for (const row of allRows) {
      if (row.__depth === 0) continue;
      const parentKey = row.__rowKeys.slice(0, -1).join(SEP);
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
      childrenMap.get(parentKey)!.push(row);
    }

    const rootRows = allRows.filter(r => r.__depth === 0);
    return { rows: rootRows, columnNodes, grandTotal, childrenMap };
  }
}

function addToBucket(map: Map<string, SaleRecord[]>, key: string, record: SaleRecord) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(record);
}

function emptyRow(label: string, depth: number): PivotRow {
  return { __rowKeys: [label], __depth: depth, __isGroup: false, __label: label };
}
