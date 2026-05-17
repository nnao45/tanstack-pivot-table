import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  ColDef,
  ColGroupDef,
  CellStyle,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  PostSortRowsParams,
  RowClassParams,
  CellClickedEvent,
} from 'ag-grid-community';
import { ColumnNode, PivotConfig, PivotRow, SaleRecord } from '../../types';
import { PivotDataService, makeCellKey, makeRowTotalKey } from '../../services/pivot-data.service';
import {
  getColumnHeaderSortTarget,
  makeColumnGroupId,
  makeSubtotalColId,
  preservePivotRowHierarchy,
  sortTopLevelColumnNodesByRow,
} from '../../services/pivot-sort';
import { ALL_FIELDS } from '../../data/sales-data';
import {
  PivotCollapsedHeaderComponent,
  PivotCollapsedGroupHeaderComponent,
  PivotEmptyHeaderComponent,
  PivotExpandedGroupHeaderComponent,
  PivotSortableHeaderComponent,
} from './pivot-group-header.component';

ModuleRegistry.registerModules([AllCommunityModule]);

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const FIELD_LABEL = new Map(ALL_FIELDS.map(f => [f.id, f.label]));

@Component({
  selector: 'app-pivot-table',
  standalone: true,
  imports: [
    AgGridAngular,
    PivotExpandedGroupHeaderComponent,
    PivotCollapsedHeaderComponent,
    PivotCollapsedGroupHeaderComponent,
    PivotEmptyHeaderComponent,
    PivotSortableHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (config().valueFields.length === 0 || config().rowFields.length === 0) {
      <div class="flex items-center justify-center h-full text-gray-400 text-sm">
        左のパネルからRows・Valuesにフィールドを追加してください
      </div>
    } @else {
      <ag-grid-angular
        style="height: 100%; width: 100%"
        [theme]="theme"
        [rowData]="rowData()"
        [columnDefs]="columnDefs()"
        [defaultColDef]="defaultColDef"
        [pinnedBottomRowData]="pinnedBottomRowData()"
        [getRowStyle]="getRowStyle"
        [postSortRows]="postSortRows"
        [context]="gridContext"
        (gridReady)="onGridReady($event)"
      />
    }
  `,
})
export class PivotTableComponent {
  data = input.required<SaleRecord[]>();
  config = input.required<PivotConfig>();

  private pivotService = inject(PivotDataService);
  private gridApi?: GridApi;

  theme = themeQuartz.withParams({
    accentColor: '#3b82f6',
    headerBackgroundColor: '#1d4ed8',
    headerTextColor: '#ffffff',
    headerFontSize: 12,
    fontSize: 12,
    rowHeight: 28,
    headerHeight: 32,
    oddRowBackgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  });

  defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    minWidth: 60,
  };

  getRowStyle = (params: RowClassParams): Record<string, string> | undefined => {
    if (params.node.rowPinned === 'bottom') {
      return { backgroundColor: '#1f2937', color: '#ffffff', fontWeight: 'bold' };
    }
    if (params.data?.__isGroup) {
      return { backgroundColor: '#f1f5f9', fontWeight: '500' };
    }
    return undefined;
  };

  postSortRows = (params: PostSortRowsParams<PivotRow>): void => {
    const nodesByKey = new Map<string, (typeof params.nodes)[number]>();
    const sortedRows: PivotRow[] = [];

    for (const node of params.nodes) {
      const row = node.data;
      if (!row) continue;
      nodesByKey.set(row.__key, node);
      sortedRows.push(row);
    }

    const orderedRows = preservePivotRowHierarchy(
      sortedRows,
      sortedRows.map(row => row.__key)
    );
    const orderedNodes = orderedRows
      .map(row => nodesByKey.get(row.__key))
      .filter((node): node is (typeof params.nodes)[number] => !!node);

    params.nodes.splice(0, params.nodes.length, ...orderedNodes);
  };

  expanded = signal<Record<string, boolean>>({});
  columnExpanded = signal<Set<string>>(new Set());
  columnSortByRow = signal<{ rowKeys: string; direction: 'asc' | 'desc' } | null>(null);
  columnHeaderSort = signal<{ groupKey: string; direction: 'asc' | 'desc' } | null>(null);

  // カスタムヘッダーコンポーネントへ渡すコンテキスト
  gridContext = {
    toggleColExpand: (key: string) => this.toggleColExpand(key),
    isColExpanded: (key: string) => this.columnExpanded().has(key),
    isExpandable: (key: string) => this.pivotData().columnNodes.some(n => this.hasExpandableKey(n, key)),
    toggleColumnHeaderSort: (key: string) => this.toggleColumnHeaderSort(key),
    getColumnHeaderSort: (key: string) => this.getColumnHeaderSort(key),
    clearColumnHeaderSort: () => this.clearColumnHeaderSort(),
  };

  private hasExpandableKey(node: ColumnNode, key: string): boolean {
    if (`colGroup__${node.key}` === key && node.children.length > 0) return true;
    return node.children.some(c => this.hasExpandableKey(c, key));
  }

  toggleColExpand(key: string) {
    this.columnExpanded.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  pivotData = computed(() => this.pivotService.compute(this.data(), this.config()));

  // 参照リポジトリと同じ方式: 展開状態に応じてフラット配列を再生成
  rowData = computed(() => {
    const pd = this.pivotData();
    const exp = this.expanded();
    const result: PivotRow[] = [];
    const collect = (rows: PivotRow[]) => {
      for (const row of rows) {
        result.push(row);
        if (row.__isGroup && exp[row.__key]) {
          collect(pd.childrenMap.get(row.__key) ?? []);
        }
      }
    };
    collect(pd.rows);
    return result;
  });

  pinnedBottomRowData = computed(() => [this.pivotData().grandTotal]);

  // columnDefs・展開状態変化時に AG Grid へ強制反映
  // setGridOption('columnDefs') は既存列順を保持するため、
  // applyColumnState + applyOrder:true で明示的に列を並び替える
  private syncEffect = effect(() => {
    const defs = this.columnDefs();
    this.expanded(); // track: rowLabel 再描画のため
    if (!this.gridApi) return;

    this.gridApi.setGridOption('columnDefs', defs);

    // 列の並び替えを強制適用（setGridOption だけでは順序が変わらない）
    const leafIds = this.extractLeafColIds(defs).filter(id => id !== '__rowLabel');
    if (leafIds.length > 0) {
      this.gridApi.applyColumnState({
        state: leafIds.map(colId => ({ colId })),
        applyOrder: true,
      });
    }
    this.applyColumnHeaderSortState();

    this.gridApi.refreshCells({ columns: ['__rowLabel'], force: true });
  });

  columnDefs = computed<(ColDef | ColGroupDef)[]>(() => {
    const pd = this.pivotData();
    const cfg = this.config();
    const rowHeader = cfg.rowFields.map(f => FIELD_LABEL.get(f) ?? f).join(' / ');

    const rowLabelCol: ColDef = {
      colId: '__rowLabel',
      headerName: rowHeader,
      pinned: 'left',
      width: 220,
      resizable: true,
      sortable: false,
      cellRenderer: (params: ICellRendererParams) => this.rowLabelRenderer(params),
      onCellClicked: (params: CellClickedEvent) => {
        if (params.node.rowPinned) {
          // Grand Total 行のソートボタン
          const target = params.event?.target as HTMLElement;
          if (target?.closest('[data-action="sort"]')) {
            this.toggleColumnSortByRow('__grandTotal__');
          }
          return;
        }
        const row = params.data as PivotRow;
        const target = params.event?.target as HTMLElement;
        if (target?.closest('[data-action="sort"]')) {
          this.toggleColumnSortByRow(row.__rowKeys.join('|||'));
        } else if (pd.childrenMap.has(row.__key)) {
          this.expanded.update(e => ({ ...e, [row.__key]: !e[row.__key] }));
        }
      },
      cellStyle: (params): CellStyle => {
        if (params.node.rowPinned === 'bottom') return { backgroundColor: '#1f2937', color: '#fff' };
        return { backgroundColor: (params.data as PivotRow).__isGroup ? '#f1f5f9' : '#ffffff' };
      },
    };

    return [
      rowLabelCol,
      ...this.buildColDefs(
        this.sortTopLevelColumnNodes(pd.columnNodes),
        this.hasAnyExpandedColumn(pd.columnNodes),
        0
      ),
      ...(cfg.columnFields.length > 0 ? [this.buildRowTotalDef()] : []),
    ];
  });

  private rowLabelRenderer(params: ICellRendererParams): string {
    if (params.node.rowPinned === 'bottom') {
      const sortState = this.columnSortByRow();
      const isActive = sortState?.rowKeys === '__grandTotal__';
      const sortIcon = isActive
        ? (sortState!.direction === 'desc' ? '↓' : '↑')
        : '↕';
      const sortColor = isActive ? '#fff' : '#6b7280';
      return `<div style="display:flex;align-items:center;padding-left:16px;gap:4px;font-weight:bold;">
        <span style="flex:1;">Grand Total</span>
        <span data-action="sort" style="flex:none;cursor:pointer;color:${sortColor};font-size:11px;padding:0 2px;">${sortIcon}</span>
      </div>`;
    }

    const row = params.data as PivotRow;
    const indent = row.__depth * 16;
    const hasChildren = this.pivotData().childrenMap.has(row.__key);
    const sortState = this.columnSortByRow();
    const rowKey = row.__rowKeys.join('|||');
    const isActiveSortRow = sortState?.rowKeys === rowKey;
    const sortIcon = isActiveSortRow
      ? (sortState!.direction === 'desc' ? '↓' : '↑')
      : '↕';
    const sortColor = isActiveSortRow ? '#3b82f6' : '#9ca3af';

    if (hasChildren) {
      const isExpanded = !!this.expanded()[row.__key];
      const chevron = isExpanded ? '▾' : '▸';
      return `<div style="display:flex;align-items:center;padding-left:${indent}px;gap:4px;cursor:pointer;user-select:none;">
        <span data-action="expand" style="flex:none;font-size:10px;color:#6b7280;">${chevron}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.__label}</span>
        <span data-action="sort" style="flex:none;cursor:pointer;color:${sortColor};font-size:11px;padding:0 2px;">${sortIcon}</span>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;padding-left:${indent + 14}px;gap:4px;">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.__label}</span>
      <span data-action="sort" style="flex:none;cursor:pointer;color:${sortColor};font-size:11px;padding:0 2px;">${sortIcon}</span>
    </div>`;
  }

  private buildColDefs(
    nodes: ColumnNode[],
    alignCollapsedParentsToTop: boolean,
    depth: number
  ): (ColDef | ColGroupDef)[] {
    const cfg = this.config();
    return nodes.map(node => {
      const groupId = makeColumnGroupId(node.key);
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren && this.columnExpanded().has(groupId);

      // 展開中: ColGroupDef + PivotExpandedGroupHeaderComponent + 子列 + Subtotal
      // 子列はソートしない: ソートは最上位ノード間のみ適用し親グループの依存を維持
      if (isExpanded) {
        const subCols = this.buildColDefs(node.children, alignCollapsedParentsToTop, depth + 1);
        if (cfg.valueFields.length === 1) {
          const vf = cfg.valueFields[0];
          subCols.push(this.buildSubtotalDef(node.key, vf, subCols.some(def => this.isColGroupDef(def))));
        } else {
          subCols.push({
            headerName: 'Subtotal',
            marryChildren: true,
            children: cfg.valueFields.map(vf => ({
              ...this.makeLeafColDef(
                makeCellKey(node.key, vf.fieldId, vf.aggFn),
                this.aggLabel(vf),
                makeSubtotalColId(node.key, vf.fieldId, vf.aggFn)
              ),
              cellStyle: (params): CellStyle => {
                if (params.node.rowPinned === 'bottom') return this.grandTotalCellStyle();
                return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#fffbeb' };
              },
            })),
          } as ColGroupDef);
        }
        return {
          groupId,
          headerName: node.value,
          marryChildren: true,
          headerGroupComponent: PivotExpandedGroupHeaderComponent,
          children: subCols,
        } as ColGroupDef;
      }

      // 子なし・折畳み: 通常の葉ノード
      if (!hasChildren) {
        if (cfg.valueFields.length === 1) {
          const vf = cfg.valueFields[0];
          return this.makeLeafColDef(makeCellKey(node.key, vf.fieldId, vf.aggFn), node.value);
        }
        return {
          groupId,
          headerName: node.value,
          marryChildren: true,
          children: cfg.valueFields.map(vf =>
            this.makeLeafColDef(makeCellKey(node.key, vf.fieldId, vf.aggFn), this.aggLabel(vf))
          ),
        } as ColGroupDef;
      }

      // 子あり・折畳み: 上段に親ヘッダー、下段に空の実データ列を置く
      const vf = cfg.valueFields[0];
      if (!alignCollapsedParentsToTop || depth > 0) {
        return {
          colId: groupId,
          field: makeCellKey(node.key, vf.fieldId, vf.aggFn),
          headerName: node.value,
          headerComponent: PivotCollapsedHeaderComponent,
          headerComponentParams: { groupKey: groupId },
          width: 90,
          resizable: true,
          sortable: true,
          type: 'numericColumn',
          valueFormatter: (p) => this.formatCell(p.value),
          cellStyle: (params): CellStyle => {
            if (params.node.rowPinned === 'bottom') return this.grandTotalCellStyle();
            if ((params.data as PivotRow)?.__isGroup) return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#f1f5f9', color: '#374151' };
            return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#ffffff' };
          },
        } as ColDef;
      }
      return {
        groupId,
        headerName: node.value,
        marryChildren: true,
        headerGroupComponent: PivotCollapsedGroupHeaderComponent,
        children: [{
          colId: groupId,
          field: makeCellKey(node.key, vf.fieldId, vf.aggFn),
          headerName: '',
          headerComponent: PivotEmptyHeaderComponent,
          width: 90,
          resizable: true,
          sortable: true,
          type: 'numericColumn',
          valueFormatter: (p) => this.formatCell(p.value),
          cellStyle: (params): CellStyle => {
            if (params.node.rowPinned === 'bottom') return this.grandTotalCellStyle();
            if ((params.data as PivotRow)?.__isGroup) return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#f1f5f9', color: '#374151' };
            return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#ffffff' };
          },
        }],
      } as ColGroupDef;
    });
  }

  private buildSubtotalDef(
    nodeKey: string,
    vf: { fieldId: string; aggFn: 'sum' | 'count' | 'avg' | 'min' | 'max' },
    wrapInGroup: boolean
  ): ColDef | ColGroupDef {
    const leaf = {
      ...this.makeLeafColDef(
        makeCellKey(nodeKey, vf.fieldId, vf.aggFn),
        wrapInGroup ? '' : 'Subtotal',
        makeSubtotalColId(nodeKey, vf.fieldId, vf.aggFn)
      ),
      ...(wrapInGroup ? { headerComponent: PivotEmptyHeaderComponent } : {}),
      cellStyle: (params: { node: { rowPinned: string | null | undefined } }): CellStyle => {
        if (params.node.rowPinned === 'bottom') return this.grandTotalCellStyle();
        return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#fffbeb', borderLeft: '1px solid #fde68a' };
      },
    };

    if (!wrapInGroup) return leaf;

    return {
      headerName: 'Subtotal',
      marryChildren: true,
      children: [leaf],
    } as ColGroupDef;
  }

  private isColGroupDef(def: ColDef | ColGroupDef): def is ColGroupDef {
    return Array.isArray((def as ColGroupDef).children);
  }

  private hasAnyExpandedColumn(nodes: ColumnNode[]): boolean {
    const expanded = this.columnExpanded();
    for (const node of nodes) {
      if (node.children.length > 0 && expanded.has(makeColumnGroupId(node.key))) return true;
      if (this.hasAnyExpandedColumn(node.children)) return true;
    }
    return false;
  }

  private buildRowTotalDef(): ColDef | ColGroupDef {
    const cfg = this.config();
    if (cfg.valueFields.length === 1) {
      const vf = cfg.valueFields[0];
      return {
        ...this.makeLeafColDef(makeRowTotalKey(vf.fieldId, vf.aggFn), 'Row Total'),
        cellStyle: (params) => this.rowTotalCellStyle(params.node.rowPinned),
      };
    }
    return {
      headerName: 'Row Total',
      marryChildren: true,
      children: cfg.valueFields.map((vf, i) => ({
        ...this.makeLeafColDef(makeRowTotalKey(vf.fieldId, vf.aggFn), this.aggLabel(vf)),
        cellStyle: (params: { node: { rowPinned: string | null | undefined } }): CellStyle => {
          const base = this.rowTotalCellStyle(params.node.rowPinned);
          return i === 0 ? { ...base, borderLeft: '2px solid #bfdbfe' } : base;
        },
      })),
    } as ColGroupDef;
  }

  private makeLeafColDef(field: string, headerName: string, colId?: string): ColDef {
    return {
      colId,
      field,
      headerName,
      headerComponent: PivotSortableHeaderComponent,
      width: 90,
      resizable: true,
      sortable: true,
      type: 'numericColumn',
      valueFormatter: (p) => this.formatCell(p.value),
      cellStyle: (params): CellStyle => {
        if (params.node.rowPinned === 'bottom') return this.grandTotalCellStyle();
        if ((params.data as PivotRow)?.__isGroup) return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#f1f5f9', color: '#374151' };
        return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#ffffff' };
      },
    };
  }

  private rowTotalCellStyle(pinned: string | null | undefined): CellStyle {
    if (pinned === 'bottom') return this.grandTotalCellStyle();
    return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#eff6ff', borderLeft: '2px solid #bfdbfe' };
  }

  private grandTotalCellStyle(): CellStyle {
    return { textAlign: 'right', fontVariantNumeric: 'tabular-nums', backgroundColor: '#1f2937', color: '#ffffff' };
  }

  private sortTopLevelColumnNodes(nodes: ColumnNode[]): ColumnNode[] {
    const sort = this.columnSortByRow();
    if (!sort) return nodes;
    const vf = this.config().valueFields[0];
    if (!vf) return nodes;
    const pd = this.pivotData();
    const rowData = sort.rowKeys === '__grandTotal__'
      ? pd.grandTotal
      : this.findRow(sort.rowKeys);
    if (!rowData) return nodes;
    return sortTopLevelColumnNodesByRow(nodes, rowData, vf.fieldId, vf.aggFn, sort.direction);
  }

  private findRow(key: string): PivotRow | undefined {
    const pd = this.pivotData();
    for (const row of pd.rows) {
      if (row.__key === key) return row;
    }
    for (const rows of pd.childrenMap.values()) {
      for (const row of rows) {
        if (row.__key === key) return row;
      }
    }
    return undefined;
  }

  toggleColumnSortByRow(rowKeys: string) {
    this.columnSortByRow.update(cur => {
      if (!cur || cur.rowKeys !== rowKeys) return { rowKeys, direction: 'desc' };
      if (cur.direction === 'desc') return { rowKeys, direction: 'asc' };
      return null;
    });
  }

  private toggleColumnHeaderSort(groupKey: string): false | 'asc' | 'desc' {
    let nextDirection: false | 'asc' | 'desc' = false;
    this.columnHeaderSort.update(cur => {
      if (!cur || cur.groupKey !== groupKey) {
        nextDirection = 'desc';
        return { groupKey, direction: nextDirection };
      }
      if (cur.direction === 'desc') {
        nextDirection = 'asc';
        return { groupKey, direction: nextDirection };
      }
      nextDirection = false;
      return null;
    });
    this.applyColumnHeaderSortState();
    this.gridApi?.refreshHeader();
    return nextDirection;
  }

  private getColumnHeaderSort(groupKey: string): false | 'asc' | 'desc' {
    const sort = this.columnHeaderSort();
    return sort?.groupKey === groupKey ? sort.direction : false;
  }

  private clearColumnHeaderSort() {
    if (!this.columnHeaderSort()) return;
    this.columnHeaderSort.set(null);
    this.gridApi?.refreshHeader();
  }

  private applyColumnHeaderSortState() {
    if (!this.gridApi) return;
    const sort = this.columnHeaderSort();
    if (!sort) {
      this.gridApi.applyColumnState({ defaultState: { sort: null } });
      return;
    }

    const target = this.getColumnHeaderSortTarget(sort.groupKey);
    if (!target) return;
    this.gridApi.applyColumnState({
      defaultState: { sort: null },
      state: [{ colId: target, sort: sort.direction }],
    });
  }

  private getColumnHeaderSortTarget(groupKey: string): string | null {
    return getColumnHeaderSortTarget(
      groupKey,
      this.columnExpanded().has(groupKey),
      this.config().valueFields[0]
    );
  }

  // ColDef/ColGroupDef ツリーから leaf の colId を DFS 順で収集
  private extractLeafColIds(defs: (ColDef | ColGroupDef)[]): string[] {
    const ids: string[] = [];
    for (const def of defs) {
      const group = def as ColGroupDef;
      if (group.children?.length) {
        ids.push(...this.extractLeafColIds(group.children as (ColDef | ColGroupDef)[]));
      } else {
        const leaf = def as ColDef;
        const id = leaf.colId ?? leaf.field;
        if (id) ids.push(id);
      }
    }
    return ids;
  }

  onGridReady(params: GridReadyEvent) {
    this.gridApi = params.api;
  }

  formatCell(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') return fmt.format(val);
    return String(val);
  }

  private aggLabel(vf: { fieldId: string; aggFn: string }): string {
    return `${vf.aggFn}(${FIELD_LABEL.get(vf.fieldId) ?? vf.fieldId})`;
  }
}
