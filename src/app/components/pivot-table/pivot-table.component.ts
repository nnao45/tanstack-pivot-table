import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  createAngularTable,
  FlexRenderDirective,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  ColumnDef,
  createColumnHelper,
  ExpandedState,
  Header,
  Row,
  SortingState,
  ColumnSizingState,
} from '@tanstack/angular-table';
import { defaultRangeExtractor, injectVirtualizer, Range } from '@tanstack/angular-virtual';
import { ColumnNode, PivotConfig, PivotRow, SaleRecord } from '../../types';
import { PivotDataService, makeCellKey, makeRowTotalKey } from '../../services/pivot-data.service';
import { ALL_FIELDS } from '../../data/sales-data';

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const columnHelper = createColumnHelper<PivotRow>();
const FIELD_LABEL = new Map(ALL_FIELDS.map(field => [field.id, field.label]));

const ROW_LABEL_SIZE = 200;
const VALUE_COL_SIZE = 90;
const HEADER_ROW_HEIGHT = 34;
const ROW_HEIGHT = 29;
const GRAND_TOTAL_HEIGHT = 30;

@Component({
  selector: 'app-pivot-table',
  standalone: true,
  imports: [CommonModule, FlexRenderDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (config().valueFields.length === 0 || config().rowFields.length === 0) {
      <div class="flex items-center justify-center h-full text-gray-400 text-sm">
        左のパネルからRows・Valuesにフィールドを追加してください
      </div>
    } @else {
      <div #scrollHost class="overflow-auto h-full relative text-xs bg-white">
        <div
          class="relative"
          [style.width.px]="columnVirtualizer.getTotalSize()"
          [style.height.px]="virtualContentHeight()"
          [style.min-width]="'100%'"
        >
          <div
            class="sticky top-0 left-0"
            [style.height.px]="bodyTop"
            [style.width.px]="columnVirtualizer.getTotalSize()"
            [style.z-index]="50"
          >
            @for (headerGroup of visibleHeaderGroups(); track headerGroup.id; let headerDepth = $index) {
              @for (header of visibleHeaders(headerGroup.headers); track header.id) {
              @let expandNode = getExpandableNode(header.column.id);
              @let isPinned = header.column.getIsPinned();
              <div
                [style.top.px]="headerDepth * headerRowHeight"
                [style.left.px]="isPinned === 'left' ? header.column.getStart('left') : header.getStart()"
                [style.width.px]="header.getSize()"
                [style.height.px]="headerRowHeight"
                [style.position]="isPinned ? 'sticky' : 'absolute'"
                [style.z-index]="isPinned ? 50 : 40"
                [ngClass]="getHeaderClass(header.id, headerGroup.depth, isPinned !== false)"
                class="box-border border border-gray-300 px-2 py-2 whitespace-nowrap overflow-hidden"
                [class.cursor-pointer]="expandNode !== null"
                (click)="expandNode && toggleColExpand(expandNode.key)"
              >
                @if (!header.isPlaceholder) {
                  <div class="flex items-center gap-1 overflow-hidden"
                       [class.justify-center]="headerGroup.depth === 0 && header.id !== '__rowLabel' && header.id !== '__rowLabelGroup'"
                       [class.justify-start]="header.id === '__rowLabel' || header.id === '__rowLabelGroup'"
                       [class.justify-end]="headerGroup.depth > 0 && header.id !== '__rowLabel'">
                    @if (expandNode) {
                      <span class="text-white/70 text-xs flex-none">
                        {{ columnExpanded().has(expandNode.key) ? '▾' : '▸' }}
                      </span>
                    }
                    <span class="truncate">
                      <ng-container *flexRender="header.column.columnDef.header; props: header.getContext(); let value">
                        {{ value }}
                      </ng-container>
                    </span>
                    @if (header.column.id === '__rowLabelGroup') {
                      <span
                        (click)="$event.stopPropagation(); toggleRowLabelSort($event)"
                        class="ml-auto flex-none cursor-pointer text-white/50 hover:text-white select-none"
                      >
                        @switch (rowLabelSortState()) {
                          @case ('asc')  { <span>▲</span> }
                          @case ('desc') { <span>▼</span> }
                          @default       { <span>⇅</span> }
                        }
                      </span>
                    }
                    @if (sortableGroupMap().has(header.column.id)) {
                      <span
                        (click)="$event.stopPropagation(); toggleGroupLeafSort(header.column.id, $event)"
                        class="ml-auto flex-none cursor-pointer text-white/50 hover:text-white select-none"
                      >
                        @switch (getGroupLeafSort(header.column.id)) {
                          @case ('asc')  { <span>▲</span> }
                          @case ('desc') { <span>▼</span> }
                          @default       { <span>⇅</span> }
                        }
                      </span>
                    }
                    @if (header.column.getCanSort() && !sortableLeafSet().has(header.column.id)) {
                      <span
                        (click)="$event.stopPropagation(); header.column.getToggleSortingHandler()?.($event)"
                        class="ml-auto flex-none cursor-pointer text-white/50 hover:text-white select-none"
                      >
                        @switch (header.column.getIsSorted()) {
                          @case ('asc')  { <span>▲</span> }
                          @case ('desc') { <span>▼</span> }
                          @default       { <span>⇅</span> }
                        }
                      </span>
                    }
                  </div>
                }
                @if (header.column.getCanResize()) {
                  <div
                    (mousedown)="header.getResizeHandler()($event)"
                    (touchstart)="header.getResizeHandler()($event)"
                    class="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none z-10 opacity-0 hover:opacity-100"
                    [class.opacity-100]="header.column.getIsResizing()"
                    [class.bg-white]="header.column.getIsResizing()"
                    [class.bg-white\/40]="!header.column.getIsResizing()"
                  ></div>
                }
              </div>
              }
            }
          </div>

          @for (virtualRow of rowVirtualizer.getVirtualItems(); track virtualRow.key) {
            @let row = rowAt(virtualRow.index);
            @if (row) {
              <div
                [ngClass]="getRowClass(row)"
                class="absolute left-0 isolate"
                [style.top.px]="0"
                [style.transform]="translateY(bodyTop + virtualRow.start)"
                [style.height.px]="virtualRow.size"
                [style.width.px]="columnVirtualizer.getTotalSize()"
              >
                @for (virtualCol of columnVirtualizer.getVirtualItems(); track virtualCol.key) {
                  @let column = columnAt(virtualCol.index);
                  @if (column) {
                    @let isPinnedCell = column.getIsPinned();
                    @let cellValue = rowCellValue(row, column.id);
                    <div
                      [style.left.px]="isPinnedCell === 'left' ? column.getStart('left') : virtualCol.start"
                      [style.top.px]="0"
                      [style.width.px]="virtualCol.size"
                      [style.height.px]="virtualRow.size"
                      [style.position]="isPinnedCell ? 'sticky' : 'absolute'"
                      [style.z-index]="isPinnedCell ? 20 : 10"
                      [ngClass]="getCellClass(column.id, row, isPinnedCell !== false)"
                      class="box-border border border-gray-200 px-2 py-1.5 whitespace-nowrap overflow-hidden"
                    >
                      @if (column.id === '__rowLabel') {
                        <div class="flex items-center gap-1" [style.padding-left.px]="row.depth * 20">
                          @if (row.getCanExpand()) {
                            <button
                              (click)="row.getToggleExpandedHandler()()"
                              class="text-gray-500 hover:text-blue-600 w-4 text-center flex-none"
                            >{{ row.getIsExpanded() ? '▾' : '▸' }}</button>
                          } @else {
                            <span class="w-4 flex-none"></span>
                          }
                          <span class="truncate flex-1">{{ row.original.__label }}</span>
                          @let rk = row.original.__rowKeys.join('|||');
                          <span
                            class="flex-none cursor-pointer select-none text-xs px-0.5 text-gray-300 hover:text-blue-500"
                            [class.text-blue-500]="isActiveColumnSortRow(rk)"
                            (click)="$event.stopPropagation(); toggleColumnSortByRow(rk)"
                          >
                            @if (isActiveColumnSortRow(rk)) {
                              {{ columnSortByRow()!.direction === 'desc' ? '↓' : '↑' }}
                            } @else { ↕ }
                          </span>
                        </div>
                      } @else {
                        <span [ngClass]="isNullCell(cellValue) ? 'text-gray-300' : ''">
                          {{ formatCell(cellValue) }}
                        </span>
                      }
                    </div>
                  }
                }
              </div>
            }
          }

          <div
            class="bottom-0 left-0 bg-gray-800 text-white font-bold"
            [style.position]="'sticky'"
            [style.margin-top.px]="rowVirtualizer.getTotalSize()"
            [style.height.px]="grandTotalHeight"
            [style.width.px]="columnVirtualizer.getTotalSize()"
            [style.z-index]="60"
          >
            @for (virtualCol of columnVirtualizer.getVirtualItems(); track virtualCol.key) {
              @let cell = grandTotalCells()[virtualCol.index];
              @if (cell) {
                @let isPinnedGT = grandTotalPinned(cell.id);
                @let grandValue = grandTotalValue(cell.id);
                <div
                  [style.left.px]="isPinnedGT ? 0 : virtualCol.start"
                  [style.top.px]="0"
                  [style.width.px]="virtualCol.size"
                  [style.height.px]="grandTotalHeight"
                  [style.position]="isPinnedGT ? 'sticky' : 'absolute'"
                  [style.z-index]="isPinnedGT ? 70 : 60"
                  [ngClass]="getGrandTotalCellClass(cell.id)"
                  class="box-border border border-gray-600 px-2 py-1.5 whitespace-nowrap"
                >
                  @if (cell.id === '__rowLabel') {
                    <div class="pl-4 flex items-center gap-1">
                      <span class="flex-1">Grand Total</span>
                      <span
                        class="flex-none cursor-pointer select-none text-xs px-0.5"
                        [class.text-white]="isActiveColumnSortRow('__grandTotal__')"
                        [class.text-gray-500]="!isActiveColumnSortRow('__grandTotal__')"
                        (click)="toggleColumnSortByRow('__grandTotal__')"
                      >
                        @if (isActiveColumnSortRow('__grandTotal__')) {
                          {{ columnSortByRow()!.direction === 'desc' ? '↓' : '↑' }}
                        } @else { ↕ }
                      </span>
                    </div>
                  } @else {
                    <span [ngClass]="isNullCell(grandValue) ? 'text-gray-500' : ''">
                      {{ formatCell(grandValue) }}
                    </span>
                  }
                </div>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class PivotTableComponent {
  data = input.required<SaleRecord[]>();
  config = input.required<PivotConfig>();
  scrollHost = viewChild<ElementRef<HTMLDivElement>>('scrollHost');

  private pivotService = inject(PivotDataService);
  private readonly debugPivot = typeof location !== 'undefined' && location.search.includes('debugPivot=1');
  private lastDebugSignature = '';
  readonly headerRowHeight = HEADER_ROW_HEIGHT;
  readonly grandTotalHeight = GRAND_TOTAL_HEIGHT;

  get bodyTop(): number {
    return this.visibleHeaderGroups().length * this.headerRowHeight;
  }

  pivotData = computed(() => this.pivotService.compute(this.data(), this.config()));

  // Row expand state
  expanded = signal<ExpandedState>({});
  // Column expand state (custom — not TanStack)
  columnExpanded = signal<Set<string>>(new Set());
  // Sort state
  sorting = signal<SortingState>([]);
  // Column sizing state
  columnSizing = signal<ColumnSizingState>({});
  // Column sort triggered by a specific row. '__grandTotal__' = Grand Total row.
  columnSortByRow = signal<{ rowKeys: string; direction: 'asc' | 'desc' } | null>(null);

  // Flat map of ALL rows (root + children) for sort lookup
  private allRowsMap = computed<Map<string, PivotRow>>(() => {
    const map = new Map<string, PivotRow>();
    const pd = this.pivotData();
    for (const row of pd.rows) map.set(row.__rowKeys.join('|||'), row);
    for (const rows of pd.childrenMap.values()) {
      for (const row of rows) map.set(row.__rowKeys.join('|||'), row);
    }
    return map;
  });

  // Expandable column node map (colGroup__ ID → ColumnNode)
  nodeMap = computed<Map<string, ColumnNode>>(() => {
    const map = new Map<string, ColumnNode>();
    const traverse = (nodes: ColumnNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) map.set(`colGroup__${node.key}`, node);
        traverse(node.children);
      }
    };
    traverse(this.pivotData().columnNodes);
    return map;
  });

  // For single-value-field collapsed expandable nodes: group colId → leaf colId
  sortableGroupMap = computed<Map<string, string>>(() => {
    const cfg = this.config();
    if (cfg.valueFields.length !== 1) return new Map();
    const vf = cfg.valueFields[0];
    const expanded = this.columnExpanded();
    const map = new Map<string, string>();
    const pd = this.pivotData();
    const traverse = (nodes: ColumnNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0 && !expanded.has(node.key)) {
          map.set(`colGroup__${node.key}`, makeCellKey(node.key, vf.fieldId, vf.aggFn));
        }
        traverse(node.children);
      }
    };
    traverse(pd.columnNodes);
    // Row Total group exists when anyExpandable is true (needsGroupWrapper=true)
    const anyExpandable = pd.columnNodes.some(n => n.children.length > 0);
    if (anyExpandable && cfg.columnFields.length > 0) {
      map.set('__rowTotalGroup', makeRowTotalKey(vf.fieldId, vf.aggFn));
    }
    return map;
  });

  // Leaf IDs that are hidden sub-cols of collapsed groups (sort icon suppressed here)
  sortableLeafSet = computed<Set<string>>(() => new Set(this.sortableGroupMap().values()));

  columns = computed<ColumnDef<PivotRow>[]>(() => {
    const cfg = this.config();
    const pd = this.pivotData();
    const anyExpandable = pd.columnNodes.some(n => n.children.length > 0);
    const needsGroupWrapper = anyExpandable || cfg.valueFields.length > 1;

    const cols: ColumnDef<PivotRow>[] = [];

    // Row label (pinned left)
    const rowHeader = cfg.rowFields.map(f => FIELD_LABEL.get(f) ?? f).join(' / ');
    const rowLabelAccessorDef = (header: string) => columnHelper.accessor(
      (row: PivotRow) => row.__label,
      {
        id: '__rowLabel', header, cell: () => '',
        size: ROW_LABEL_SIZE, enableResizing: true,
        enableSorting: true,
        sortingFn: (a, b) => a.original.__label.localeCompare(b.original.__label),
      }
    ) as ColumnDef<PivotRow>;

    if (needsGroupWrapper) {
      cols.push(columnHelper.group({
        id: '__rowLabelGroup',
        header: rowHeader,
        columns: [rowLabelAccessorDef('')],
      }) as ColumnDef<PivotRow>);
    } else {
      cols.push(rowLabelAccessorDef(rowHeader));
    }

    // Column pivot
    for (const node of this.sortNodes(pd.columnNodes)) {
      cols.push(...this.generateColsFromNode(node));
    }

    // Row Total
    if (cfg.columnFields.length > 0) {
      if (needsGroupWrapper) {
        cols.push(columnHelper.group({
          id: '__rowTotalGroup',
          header: 'Row Total',
          columns: cfg.valueFields.map(vf => this.makeValueAccessor(
            makeRowTotalKey(vf.fieldId, vf.aggFn),
            (row) => row[makeRowTotalKey(vf.fieldId, vf.aggFn)],
            cfg.valueFields.length === 1 ? '' : this.aggLabel(vf),
            true
          )),
        }) as ColumnDef<PivotRow>);
      } else {
        const vf = cfg.valueFields[0];
        cols.push(this.makeValueAccessor(
          makeRowTotalKey(vf.fieldId, vf.aggFn),
          (row) => row[makeRowTotalKey(vf.fieldId, vf.aggFn)],
          'Row Total',
          true
        ));
      }
    }

    return cols;
  });

  private sortNodes(nodes: ColumnNode[]): ColumnNode[] {
    const sort = this.columnSortByRow();
    if (!sort) return nodes;
    const vf = this.config().valueFields[0];
    if (!vf) return nodes;
    const rowData = sort.rowKeys === '__grandTotal__'
      ? this.pivotData().grandTotal
      : this.allRowsMap().get(sort.rowKeys);
    if (!rowData) return nodes;
    return [...nodes].sort((a, b) => {
      const va = (rowData[makeCellKey(a.key, vf.fieldId, vf.aggFn)] as number) ?? -Infinity;
      const vb = (rowData[makeCellKey(b.key, vf.fieldId, vf.aggFn)] as number) ?? -Infinity;
      return sort.direction === 'asc' ? va - vb : vb - va;
    });
  }

  toggleColumnSortByRow(rowKeys: string) {
    this.columnSortByRow.update(cur => {
      if (!cur || cur.rowKeys !== rowKeys) return { rowKeys, direction: 'desc' };
      if (cur.direction === 'desc') return { rowKeys, direction: 'asc' };
      return null;
    });
  }

  isActiveColumnSortRow(rowKeys: string): boolean {
    return this.columnSortByRow()?.rowKeys === rowKeys;
  }

  private generateColsFromNode(node: ColumnNode): ColumnDef<PivotRow>[] {
    const cfg = this.config();
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && this.columnExpanded().has(node.key);

    if (!hasChildren) {
      if (cfg.valueFields.length === 1) {
        const vf = cfg.valueFields[0];
        return [this.makeValueAccessor(
          makeCellKey(node.key, vf.fieldId, vf.aggFn),
          (row) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          node.value, true
        )];
      }
      return [columnHelper.group({
        id: `colGroup__${node.key}`,
        header: node.value,
        columns: cfg.valueFields.map(vf => this.makeValueAccessor(
          makeCellKey(node.key, vf.fieldId, vf.aggFn),
          (row) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          this.aggLabel(vf), true
        )),
      }) as ColumnDef<PivotRow>];
    }

    if (!isExpanded) {
      return [columnHelper.group({
        id: `colGroup__${node.key}`,
        header: node.value,
        columns: cfg.valueFields.map(vf => this.makeValueAccessor(
          makeCellKey(node.key, vf.fieldId, vf.aggFn),
          (row) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          cfg.valueFields.length === 1 ? '' : this.aggLabel(vf),
          true
        )),
      }) as ColumnDef<PivotRow>];
    }

    // Expanded
    const subCols: ColumnDef<PivotRow>[] = this.sortNodes(node.children).flatMap(child => this.generateColsFromNode(child));
    // When children themselves have children, they render as groups (depth +1).
    // Wrap Subtotal in a group too so it appears in the same header row as siblings,
    // and its empty sub-col gets hidden by isHeaderGroupAllEmpty.
    const childrenHaveChildren = node.children.some(c => c.children.length > 0);
    if (cfg.valueFields.length === 1) {
      const vf = cfg.valueFields[0];
      const subtotalId = `subtotal__${node.key}__${vf.fieldId}__${vf.aggFn}`;
      const accessorFn = (row: PivotRow) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)];
      if (childrenHaveChildren) {
        subCols.push(columnHelper.group({
          id: `subtotalGroup__${node.key}`,
          header: 'Subtotal',
          columns: [this.makeValueAccessor(subtotalId, accessorFn, '', false)],
        }) as ColumnDef<PivotRow>);
      } else {
        subCols.push(this.makeValueAccessor(subtotalId, accessorFn, 'Subtotal', false));
      }
    } else {
      subCols.push(columnHelper.group({
        id: `subtotalGroup__${node.key}`,
        header: 'Subtotal',
        columns: cfg.valueFields.map(vf => this.makeValueAccessor(
          `subtotal__${node.key}__${vf.fieldId}__${vf.aggFn}`,
          (row) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          this.aggLabel(vf), false
        )),
      }) as ColumnDef<PivotRow>);
    }

    return [columnHelper.group({
      id: `colGroup__${node.key}`,
      header: node.value,
      columns: subCols,
    }) as ColumnDef<PivotRow>];
  }

  private readonly columnDefCache = new Map<string, ColumnDef<PivotRow>>();

  // Build a sortable, resizable value accessor column (cached by stable key)
  private makeValueAccessor(
    id: string,
    accessorFn: (row: PivotRow) => unknown,
    header: string,
    enableSorting: boolean
  ): ColumnDef<PivotRow> {
    const cacheKey = `${id}__${header}__${enableSorting}`;
    const cached = this.columnDefCache.get(cacheKey);
    if (cached) return cached;
    const def = columnHelper.accessor(accessorFn as (row: PivotRow) => number | null, {
      id,
      header,
      size: VALUE_COL_SIZE,
      enableResizing: true,
      enableSorting,
      sortingFn: (a, b, colId) => {
        const va = (a.original[colId] as number) ?? -Infinity;
        const vb = (b.original[colId] as number) ?? -Infinity;
        return va - vb;
      },
    }) as ColumnDef<PivotRow>;
    this.columnDefCache.set(cacheKey, def);
    return def;
  }

  table = createAngularTable(() => ({
    data: this.pivotData().rows,
    columns: this.columns(),
    getSubRows: (row: PivotRow) =>
      this.pivotData().childrenMap.get(row.__rowKeys.join('|||')) ?? [],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onEnd' as const,
    state: {
      expanded: this.expanded(),
      sorting: this.sorting(),
      columnSizing: this.columnSizing(),
      columnPinning: { left: ['__rowLabel'] },
    },
    onExpandedChange: (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      this.expanded.update(old => typeof updater === 'function' ? updater(old) : updater);
    },
    onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => {
      this.sorting.update(old => typeof updater === 'function' ? updater(old) : updater);
    },
    onColumnSizingChange: (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      this.columnSizing.update(old => typeof updater === 'function' ? updater(old) : updater);
    },
    autoResetExpanded: false,
  }));

  visibleHeaderGroups = computed(() =>
    this.table.getHeaderGroups().filter(group => !this.isHeaderGroupAllEmpty(group.headers))
  );
  leafColumns = computed(() => this.table.getVisibleLeafColumns());
  rowModelRows = computed(() => this.table.getRowModel().rows);
  grandTotalCells = computed(() => this.table.getAllLeafColumns().map(col => ({ id: col.id })));

  rowVirtualizer = injectVirtualizer<HTMLDivElement, HTMLDivElement>(() => ({
    scrollElement: this.scrollHost(),
    count: this.rowModelRows().length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  }));

  columnVirtualizer = injectVirtualizer<HTMLDivElement, HTMLDivElement>(() => ({
    scrollElement: this.scrollHost(),
    horizontal: true,
    count: this.leafColumns().length,
    estimateSize: index => this.leafColumns()[index]?.getSize() ?? VALUE_COL_SIZE,
    overscan: 4,
    rangeExtractor: range => pinFirstColumn(range),
  }));

  debugSnapshot = effect(() => {
    if (!this.debugPivot) return;

    const rows = this.rowModelRows();
    const cols = this.leafColumns();
    const virtualRows = this.rowVirtualizer.getVirtualItems();
    const virtualCols = this.columnVirtualizer.getVirtualItems();
    const firstRow = virtualRows.length > 0 ? rows[virtualRows[0].index] : undefined;
    const sample = firstRow ? virtualCols.slice(0, 8).map(virtualCol => {
      const col = cols[virtualCol.index];
      return {
        virtualIndex: virtualCol.index,
        start: virtualCol.start,
        size: virtualCol.size,
        columnId: col?.id,
        value: col ? this.rowCellValue(firstRow, col.id) : undefined,
      };
    }) : [];
    const signature = JSON.stringify({
      rowCount: rows.length,
      colCount: cols.length,
      firstVirtualRow: virtualRows[0]?.index,
      firstRowLabel: firstRow?.original.__label,
      virtualCols: virtualCols.slice(0, 8).map(col => col.index),
      sample,
    });

    if (signature === this.lastDebugSignature) return;
    this.lastDebugSignature = signature;
    console.table(sample);
    console.log('[pivot-debug]', JSON.parse(signature), {
      firstRowOriginalKeys: firstRow ? Object.keys(firstRow.original).slice(0, 30) : [],
      rowModelFirstRows: rows.slice(0, 5).map(row => ({
        id: row.id,
        label: row.original.__label,
        depth: row.depth,
        keys: row.original.__rowKeys,
      })),
      leafColumns: cols.slice(0, 12).map((col, index) => ({
        index,
        id: col.id,
        size: col.getSize(),
        start: col.getStart(),
        pinned: col.getIsPinned(),
      })),
    });
  });

  virtualContentHeight(): number {
    return this.bodyTop + this.rowVirtualizer.getTotalSize() + this.grandTotalHeight;
  }

  translateY(value: number): string {
    return `translateY(${value}px)`;
  }

  rowAt(index: number): Row<PivotRow> | undefined {
    return this.rowModelRows()[index];
  }

  columnAt(index: number) {
    return this.leafColumns()[index];
  }

  rowCellValue(row: Row<PivotRow>, columnId: string): unknown {
    if (columnId === '__rowLabel') return row.original.__label;
    if (columnId.startsWith('subtotal__')) {
      return row.original[columnId.replace('subtotal__', '__cell__')];
    }
    return row.original[columnId];
  }

  visibleHeaders(headers: Header<PivotRow, unknown>[]): Header<PivotRow, unknown>[] {
    const virtualItems = this.columnVirtualizer.getVirtualItems();
    if (virtualItems.length === 0) return [];
    const first = virtualItems[0].start;
    const lastItem = virtualItems[virtualItems.length - 1];
    const last = lastItem.start + lastItem.size;
    return headers.filter(header => {
      if (header.isPlaceholder) return false;
      const start = header.getStart();
      const end = start + header.getSize();
      return end >= first && start <= last;
    });
  }

  grandTotalValue(colId: string): unknown {
    if (colId.startsWith('subtotal__')) {
      return this.pivotData().grandTotal[colId.replace('subtotal__', '__cell__')];
    }
    return this.pivotData().grandTotal[colId];
  }

  grandTotalWidth(colId: string): number {
    return this.table.getColumn(colId)?.getSize() ?? VALUE_COL_SIZE;
  }

  grandTotalPinned(colId: string): boolean {
    return this.table.getColumn(colId)?.getIsPinned() === 'left';
  }

  isHeaderGroupAllEmpty(headers: Header<PivotRow, unknown>[]): boolean {
    return headers.every(h =>
      h.isPlaceholder ||
      h.column.id === '__rowLabel' ||
      (typeof h.column.columnDef.header === 'string' && h.column.columnDef.header === '')
    );
  }

  getExpandableNode(colId: string): ColumnNode | null {
    return this.nodeMap().get(colId) ?? null;
  }

  rowLabelSortState = computed(() =>
    this.table.getColumn('__rowLabel')?.getIsSorted() ?? false
  );

  toggleRowLabelSort(event: MouseEvent) {
    this.table.getColumn('__rowLabel')?.getToggleSortingHandler()?.(event);
  }

  getGroupLeafSort(groupId: string): false | 'asc' | 'desc' {
    const leafId = this.sortableGroupMap().get(groupId);
    if (!leafId) return false;
    return this.table.getColumn(leafId)?.getIsSorted() ?? false;
  }

  toggleGroupLeafSort(groupId: string, event: MouseEvent) {
    const leafId = this.sortableGroupMap().get(groupId);
    if (!leafId) return;
    this.table.getColumn(leafId)?.getToggleSortingHandler()?.(event);
  }

  toggleColExpand(nodeKey: string) {
    this.columnExpanded.update(set => {
      const next = new Set(set);
      next.has(nodeKey) ? next.delete(nodeKey) : next.add(nodeKey);
      return next;
    });
  }

  getHeaderClass(headerId: string, depth: number, pinned: boolean): string {
    const pinnedShadow = pinned ? 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]' : '';
    if (headerId === '__rowLabel' || headerId === '__rowLabelGroup')
      return `bg-gray-700 text-white text-left ${pinnedShadow}`;
    if (headerId === '__rowTotalGroup' || headerId.startsWith('__rowTotal'))
      return depth === 0 ? 'bg-blue-800 text-white text-center' : 'bg-blue-600 text-white';
    if (headerId.startsWith('subtotalGroup__')) return 'bg-amber-600 text-white text-center';
    if (headerId.startsWith('subtotal__')) return 'bg-amber-500 text-white text-right';
    if (depth === 0) return 'bg-blue-700 text-white text-center';
    return 'bg-blue-500 text-white text-right';
  }

  getRowClass(row: Row<PivotRow>): string {
    return row.original.__isGroup ? 'bg-gray-100 font-medium' : 'bg-white hover:bg-blue-50';
  }

  getCellClass(colId: string, row: Row<PivotRow>, pinned: boolean): string {
    const pinnedShadow = pinned ? 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : '';
    if (colId === '__rowLabel') return `${pinnedShadow} ${row.original.__isGroup ? 'bg-gray-100' : 'bg-white'}`;
    const base = 'text-right tabular-nums';
    if (colId.startsWith('__rowTotal')) return `${base} bg-blue-50 border-l-2 border-blue-200`;
    if (colId.startsWith('subtotal__')) return `${base} bg-amber-50 border-l border-amber-200`;
    if (row.original.__isGroup) return `${base} bg-gray-100 text-gray-700`;
    return `${base} bg-white`;
  }

  getGrandTotalCellClass(colId: string): string {
    if (colId.startsWith('__rowTotal')) return 'bg-blue-900 border-l-2 border-blue-600 text-right tabular-nums';
    if (colId.startsWith('subtotal__')) return 'bg-amber-800 border-l border-amber-600 text-right tabular-nums';
    if (colId !== '__rowLabel') return 'text-right tabular-nums';
    return '';
  }

  private readonly formatCache = new Map<number, string>();

  formatCell(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') {
      let s = this.formatCache.get(val);
      if (s === undefined) { s = fmt.format(val); this.formatCache.set(val, s); }
      return s;
    }
    return String(val);
  }

  isNullCell(val: unknown): boolean {
    return val === null || val === undefined;
  }

  private aggLabel(vf: { fieldId: string; aggFn: string }): string {
    return `${vf.aggFn}(${FIELD_LABEL.get(vf.fieldId) ?? vf.fieldId})`;
  }
}

function pinFirstColumn(range: Range): number[] {
  const indexes = defaultRangeExtractor(range);
  return indexes[0] === 0 ? indexes : [0, ...indexes];
}
