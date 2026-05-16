export interface SaleRecord {
  region: string;
  category: string;
  product: string;
  channel: string;
  month: string;
  sales: number;
  quantity: number;
  profit: number;
  cost: number;
}

export type AggFnName = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface FieldDef {
  id: string;
  label: string;
  type: 'dimension' | 'measure';
}

export interface ValueFieldConfig {
  fieldId: string;
  aggFn: AggFnName;
  label: string;
}

export interface PivotConfig {
  rowFields: string[];
  columnFields: string[];   // 複数フィールドで階層ドリルダウン可能
  valueFields: ValueFieldConfig[];
}

export interface ColumnNode {
  value: string;
  field: string;
  key: string;            // 複合キー: "Electronics" or "Electronics|||Jan"
  depth: number;
  children: ColumnNode[];
}

export interface PivotRow {
  __rowKeys: string[];
  __depth: number;
  __isGroup: boolean;
  __label: string;
  [key: string]: unknown;
}

export interface PivotDataResult {
  rows: PivotRow[];
  columnNodes: ColumnNode[];    // トップレベルの列ノード群
  grandTotal: PivotRow;
  childrenMap: Map<string, PivotRow[]>;
}
