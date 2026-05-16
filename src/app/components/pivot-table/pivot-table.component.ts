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
  ColumnDef,
  createColumnHelper,
  ExpandedState,
  Row,
} from '@tanstack/angular-table';
import { ColumnNode, PivotConfig, PivotRow, SaleRecord } from '../../types';
import { PivotDataService, makeCellKey, makeRowTotalKey } from '../../services/pivot-data.service';
import { ALL_FIELDS } from '../../data/sales-data';

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const columnHelper = createColumnHelper<PivotRow>();

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
      <div class="overflow-auto h-full">
        <table class="border-collapse text-xs w-max min-w-full">
          <thead>
            @for (headerGroup of table.getHeaderGroups(); track headerGroup.id) {
              <tr>
                @for (header of headerGroup.headers; track header.id) {
                  @let expandNode = getExpandableNode(header.column.id);
                  <th
                    [attr.colSpan]="header.colSpan"
                    [class]="getHeaderClass(header.id, headerGroup.depth)"
                    class="border border-gray-300 px-3 py-2 whitespace-nowrap sticky top-0 z-10"
                    [class.cursor-pointer]="expandNode !== null"
                    (click)="expandNode && toggleColExpand(expandNode.key)"
                  >
                    @if (!header.isPlaceholder) {
                      <div class="flex items-center gap-1"
                           [class.justify-center]="headerGroup.depth === 0 && header.id !== '__rowLabel'"
                           [class.justify-start]="header.id === '__rowLabel' || header.id === '__rowLabelGroup'"
                           [class.justify-end]="headerGroup.depth > 0 && header.id !== '__rowLabel'">
                        @if (expandNode) {
                          <span class="text-white/70 text-xs">
                            {{ columnExpanded().has(expandNode.key) ? '▾' : '▸' }}
                          </span>
                        }
                        <ng-container *flexRender="header.column.columnDef.header; props: header.getContext(); let value">
                          {{ value }}
                        </ng-container>
                      </div>
                    }
                  </th>
                }
              </tr>
            }
          </thead>
          <tbody>
            @for (row of table.getRowModel().rows; track row.id) {
              <tr [class]="getRowClass(row)">
                @for (cell of row.getVisibleCells(); track cell.id) {
                  <td
                    [class]="getCellClass(cell.column.id, row)"
                    class="border border-gray-200 px-3 py-1.5 whitespace-nowrap"
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
                        <span>{{ row.original.__label }}</span>
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
                <td
                  [class]="getGrandTotalCellClass(cell.id)"
                  class="border border-gray-600 px-3 py-1.5 whitespace-nowrap"
                >
                  @if (cell.id === '__rowLabel') {
                    <div class="pl-4">Grand Total</div>
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
    }
  `,
})
export class PivotTableComponent {
  data = input.required<SaleRecord[]>();
  config = input.required<PivotConfig>();

  private pivotService = inject(PivotDataService);

  pivotData = computed(() => this.pivotService.compute(this.data(), this.config()));
  expanded = signal<ExpandedState>({});
  columnExpanded = signal<Set<string>>(new Set());

  // Only expandable nodes (those with children) → used for toggle button
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

  columns = computed<ColumnDef<PivotRow>[]>(() => {
    const cfg = this.config();
    const pd = this.pivotData();

    // When any top-level node is expandable, we need 2 header rows → wrap rowLabel & rowTotal in groups
    const anyExpandable = pd.columnNodes.some(n => n.children.length > 0);
    const needsGroupWrapper = anyExpandable || cfg.valueFields.length > 1;

    const cols: ColumnDef<PivotRow>[] = [];

    // Row label column
    const rowHeader = cfg.rowFields.map(f => ALL_FIELDS.find(fd => fd.id === f)?.label ?? f).join(' / ');
    if (needsGroupWrapper) {
      cols.push(columnHelper.group({
        id: '__rowLabelGroup',
        header: rowHeader,
        columns: [columnHelper.display({ id: '__rowLabel', header: '', cell: () => '' }) as ColumnDef<PivotRow>],
      }) as ColumnDef<PivotRow>);
    } else {
      cols.push(columnHelper.display({ id: '__rowLabel', header: rowHeader, cell: () => '' }) as ColumnDef<PivotRow>);
    }

    // Column pivot: recursively from tree
    for (const node of pd.columnNodes) {
      cols.push(...this.generateColsFromNode(node));
    }

    // Row Total
    if (cfg.columnFields.length > 0) {
      if (needsGroupWrapper) {
        cols.push(columnHelper.group({
          id: '__rowTotalGroup',
          header: 'Row Total',
          columns: cfg.valueFields.map(vf => columnHelper.accessor(
            (row: PivotRow) => row[makeRowTotalKey(vf.fieldId, vf.aggFn)],
            {
              id: makeRowTotalKey(vf.fieldId, vf.aggFn),
              header: cfg.valueFields.length === 1 ? '' : this.aggLabel(vf),
            }
          ) as ColumnDef<PivotRow>),
        }) as ColumnDef<PivotRow>);
      } else {
        const vf = cfg.valueFields[0];
        cols.push(columnHelper.accessor(
          (row: PivotRow) => row[makeRowTotalKey(vf.fieldId, vf.aggFn)],
          { id: makeRowTotalKey(vf.fieldId, vf.aggFn), header: 'Row Total' }
        ) as ColumnDef<PivotRow>);
      }
    }

    return cols;
  });

  private generateColsFromNode(node: ColumnNode): ColumnDef<PivotRow>[] {
    const cfg = this.config();
    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && this.columnExpanded().has(node.key);

    if (!hasChildren) {
      // True leaf: single accessor, or group for multiple value fields
      if (cfg.valueFields.length === 1) {
        const vf = cfg.valueFields[0];
        return [columnHelper.accessor(
          (row: PivotRow) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          { id: makeCellKey(node.key, vf.fieldId, vf.aggFn), header: node.value }
        ) as ColumnDef<PivotRow>];
      }
      return [columnHelper.group({
        id: `colGroup__${node.key}`,
        header: node.value,
        columns: cfg.valueFields.map(vf => columnHelper.accessor(
          (row: PivotRow) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          { id: makeCellKey(node.key, vf.fieldId, vf.aggFn), header: this.aggLabel(vf) }
        ) as ColumnDef<PivotRow>),
      }) as ColumnDef<PivotRow>];
    }

    // Expandable node: ALWAYS use columnHelper.group so it stays in the top header row.
    // Collapsed → single sub-column with empty header
    // Expanded  → sub-node columns + subtotal column
    if (!isExpanded) {
      return [columnHelper.group({
        id: `colGroup__${node.key}`,
        header: node.value,
        columns: cfg.valueFields.map(vf => columnHelper.accessor(
          (row: PivotRow) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          {
            id: makeCellKey(node.key, vf.fieldId, vf.aggFn),
            header: cfg.valueFields.length === 1 ? '' : this.aggLabel(vf),
          }
        ) as ColumnDef<PivotRow>),
      }) as ColumnDef<PivotRow>];
    }

    // Expanded: sub-columns + subtotal
    const subCols: ColumnDef<PivotRow>[] = node.children.flatMap(child => this.generateColsFromNode(child));

    // Subtotal uses `subtotal__` prefix for ID (so getCellClass can identify it),
    // grandTotalValue resolves it via the replace mapping below.
    if (cfg.valueFields.length === 1) {
      const vf = cfg.valueFields[0];
      subCols.push(columnHelper.accessor(
        (row: PivotRow) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
        { id: `subtotal__${node.key}__${vf.fieldId}__${vf.aggFn}`, header: 'Subtotal' }
      ) as ColumnDef<PivotRow>);
    } else {
      subCols.push(columnHelper.group({
        id: `subtotalGroup__${node.key}`,
        header: 'Subtotal',
        columns: cfg.valueFields.map(vf => columnHelper.accessor(
          (row: PivotRow) => row[makeCellKey(node.key, vf.fieldId, vf.aggFn)],
          { id: `subtotal__${node.key}__${vf.fieldId}__${vf.aggFn}`, header: this.aggLabel(vf) }
        ) as ColumnDef<PivotRow>),
      }) as ColumnDef<PivotRow>);
    }

    return [columnHelper.group({
      id: `colGroup__${node.key}`,
      header: node.value,
      columns: subCols,
    }) as ColumnDef<PivotRow>];
  }

  table = createAngularTable(() => ({
    data: this.pivotData().rows,
    columns: this.columns(),
    getSubRows: (row: PivotRow) =>
      this.pivotData().childrenMap.get(row.__rowKeys.join('|||')) ?? [],
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    state: { expanded: this.expanded() },
    onExpandedChange: (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      this.expanded.update(old => typeof updater === 'function' ? updater(old) : updater);
    },
    autoResetExpanded: false,
  }));

  grandTotalCells = computed(() => this.table.getAllLeafColumns().map(col => ({ id: col.id })));

  grandTotalValue(colId: string): unknown {
    // subtotal__ columns access the parent node's aggregated value via __cell__ key
    if (colId.startsWith('subtotal__')) {
      return this.pivotData().grandTotal[colId.replace('subtotal__', '__cell__')];
    }
    return this.pivotData().grandTotal[colId];
  }

  getExpandableNode(colId: string): ColumnNode | null {
    return this.nodeMap().get(colId) ?? null;
  }

  toggleColExpand(nodeKey: string) {
    this.columnExpanded.update(set => {
      const next = new Set(set);
      next.has(nodeKey) ? next.delete(nodeKey) : next.add(nodeKey);
      return next;
    });
  }

  getHeaderClass(headerId: string, depth: number): string {
    if (headerId === '__rowLabel' || headerId === '__rowLabelGroup') return 'bg-gray-700 text-white text-left';
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

  getCellClass(colId: string, row: Row<PivotRow>): string {
    const base = colId === '__rowLabel' ? '' : 'text-right tabular-nums';
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
