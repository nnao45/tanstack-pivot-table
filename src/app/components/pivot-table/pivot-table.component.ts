import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
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
import { ColumnNode, PivotConfig, PivotRow, SaleRecord } from '../../types';
import { PivotDataService, makeCellKey, makeRowTotalKey } from '../../services/pivot-data.service';
import { ALL_FIELDS } from '../../data/sales-data';

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const columnHelper = createColumnHelper<PivotRow>();

const ROW_LABEL_SIZE = 200;
const VALUE_COL_SIZE = 90;

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
      <div class="flex flex-col h-full">
      <div class="overflow-auto flex-1">
        <table class="border-collapse text-xs" style="width: max-content; min-width: 100%">
          <thead>
            @for (headerGroup of table.getHeaderGroups(); track headerGroup.id) {
              @if (!isHeaderGroupAllEmpty(headerGroup.headers)) {
              <tr>
                @for (header of headerGroup.headers; track header.id) {
                  @let expandNode = getExpandableNode(header.column.id);
                  @let isPinned = header.column.getIsPinned();
                  <th
                    [attr.colSpan]="header.colSpan"
                    [style.width.px]="header.getSize()"
                    [style.min-width.px]="header.getSize()"
                    [style.position]="isPinned ? 'sticky' : 'relative'"
                    [style.left.px]="isPinned === 'left' ? header.column.getStart('left') : null"
                    [style.z-index]="isPinned ? 30 : 10"
                    [class]="getHeaderClass(header.id, headerGroup.depth, isPinned !== false)"
                    class="border border-gray-300 px-2 py-2 whitespace-nowrap"
                    [class.cursor-pointer]="expandNode !== null"
                    (click)="expandNode && toggleColExpand(expandNode.key)"
                  >
                    @if (!header.isPlaceholder) {
                      <div class="flex items-center gap-1 overflow-hidden"
                           [class.justify-center]="headerGroup.depth === 0 && header.id !== '__rowLabel' && header.id !== '__rowLabelGroup'"
                           [class.justify-start]="header.id === '__rowLabel' || header.id === '__rowLabelGroup'"
                           [class.justify-end]="headerGroup.depth > 0 && header.id !== '__rowLabel'">
                        <!-- Column expand toggle -->
                        @if (expandNode) {
                          <span class="text-white/70 text-xs flex-none">
                            {{ columnExpanded().has(expandNode.key) ? '▾' : '▸' }}
                          </span>
                        }
                        <!-- Header text -->
                        <span class="truncate">
                          <ng-container *flexRender="header.column.columnDef.header; props: header.getContext(); let value">
                            {{ value }}
                          </ng-container>
                        </span>
                        <!-- Row label sort (needsGroupWrapper=true: ⇅ on __rowLabelGroup) -->
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
                        <!-- Row sort: only on collapsed single-value expandable columns & Row Total -->
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
                        <!-- Sort icon (leaf data columns, skip hidden sub-cols of collapsed groups) -->
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
                    <!-- Resize handle -->
                    @if (header.column.getCanResize()) {
                      <div
                        (mousedown)="header.getResizeHandler()($event)"
                        (touchstart)="header.getResizeHandler()($event)"
                        class="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none z-10
                               opacity-0 hover:opacity-100"
                        [class.opacity-100]="header.column.getIsResizing()"
                        [class.bg-white]="header.column.getIsResizing()"
                        [class.bg-white\/40]="!header.column.getIsResizing()"
                      ></div>
                    }
                  </th>
                }
              </tr>
              }
            }
          </thead>
          <tbody>
            @for (row of table.getRowModel().rows; track row.id) {
              <tr [class]="getRowClass(row)">
                @for (cell of row.getVisibleCells(); track cell.id) {
                  @let isPinnedCell = cell.column.getIsPinned();
                  <td
                    [style.width.px]="cell.column.getSize()"
                    [style.min-width.px]="cell.column.getSize()"
                    [style.position]="isPinnedCell ? 'sticky' : ''"
                    [style.left.px]="isPinnedCell === 'left' ? cell.column.getStart('left') : null"
                    [style.z-index]="isPinnedCell ? 2 : ''"
                    [class]="getCellClass(cell.column.id, row, isPinnedCell !== false)"
                    class="border border-gray-200 px-2 py-1.5 whitespace-nowrap overflow-hidden"
                  >
                    @if (cell.column.id === '__rowLabel') {
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
                      <span [class]="isNullCell(cell.getValue()) ? 'text-gray-300' : ''">
                        {{ formatCell(cell.getValue()) }}
                      </span>
                    }
                  </td>
                }
              </tr>
            }
            <!-- Grand Total -->
            <tr class="bg-gray-800 text-white font-bold sticky bottom-0">
              @for (cell of grandTotalCells(); track cell.id) {
                @let isPinnedGT = grandTotalPinned(cell.id);
                <td
                  [style.width.px]="grandTotalWidth(cell.id)"
                  [style.position]="isPinnedGT ? 'sticky' : ''"
                  [style.left.px]="isPinnedGT ? 0 : null"
                  [style.z-index]="isPinnedGT ? 3 : ''"
                  [class]="getGrandTotalCellClass(cell.id)"
                  class="border border-gray-600 px-2 py-1.5 whitespace-nowrap"
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
                    <span [class]="isNullCell(grandTotalValue(cell.id)) ? 'text-gray-500' : ''">
                      {{ formatCell(grandTotalValue(cell.id)) }}
                    </span>
                  }
                </td>
              }
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    }
  `,
})
export class PivotTableComponent {
  data = input.required<SaleRecord[]>();
  config = input.required<PivotConfig>();

  private pivotService = inject(PivotDataService);

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
    const rowHeader = cfg.rowFields.map(f => ALL_FIELDS.find(fd => fd.id === f)?.label ?? f).join(' / ');
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

  // Build a sortable, resizable value accessor column
  private makeValueAccessor(
    id: string,
    accessorFn: (row: PivotRow) => unknown,
    header: string,
    enableSorting: boolean
  ): ColumnDef<PivotRow> {
    return columnHelper.accessor(accessorFn as (row: PivotRow) => number | null, {
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
  }

  table = createAngularTable(() => ({
    data: this.pivotData().rows,
    columns: this.columns(),
    getSubRows: (row: PivotRow) =>
      this.pivotData().childrenMap.get(row.__rowKeys.join('|||')) ?? [],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange' as const,
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

  grandTotalCells = computed(() => this.table.getAllLeafColumns().map(col => ({ id: col.id })));

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
    if (row.original.__isGroup) return `${base} text-gray-700`;
    return base;
  }

  getGrandTotalCellClass(colId: string): string {
    if (colId.startsWith('__rowTotal')) return 'bg-blue-900 border-l-2 border-blue-600 text-right tabular-nums';
    if (colId.startsWith('subtotal__')) return 'bg-amber-800 border-l border-amber-600 text-right tabular-nums';
    if (colId !== '__rowLabel') return 'text-right tabular-nums';
    return '';
  }

  formatCell(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') return fmt.format(val);
    return String(val);
  }

  isNullCell(val: unknown): boolean {
    return val === null || val === undefined;
  }

  private aggLabel(vf: { fieldId: string; aggFn: string }): string {
    return `${vf.aggFn}(${ALL_FIELDS.find(f => f.id === vf.fieldId)?.label ?? vf.fieldId})`;
  }
}
