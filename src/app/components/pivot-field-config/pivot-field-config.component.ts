import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { AggFnName, FieldDef, PivotConfig, ValueFieldConfig } from '../../types';

@Component({
  selector: 'app-pivot-field-config',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 h-full overflow-y-auto" cdkDropListGroup>

      <!-- Available Fields -->
      <div>
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Available Fields</div>
        <div
          cdkDropList
          id="fieldList"
          [cdkDropListData]="availableFieldIds()"
          [cdkDropListConnectedTo]="['rows', 'columns']"
          (cdkDropListDropped)="onDrop($event, 'fieldList')"
          class="min-h-12 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-1.5 flex flex-col gap-1"
        >
          @for (fieldId of availableFieldIds(); track fieldId) {
            <div cdkDrag [cdkDragData]="fieldId"
              class="flex items-center gap-1.5 bg-white border border-gray-200 rounded px-2 py-1 text-xs cursor-grab shadow-sm hover:border-blue-300"
            >
              <span class="text-gray-400">⠿</span>
              {{ labelOf(fieldId) }}
            </div>
          }
        </div>
      </div>

      <!-- Rows -->
      <div>
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Rows</div>
        <div
          cdkDropList
          id="rows"
          [cdkDropListData]="rowFieldIds()"
          [cdkDropListConnectedTo]="['fieldList', 'columns']"
          (cdkDropListDropped)="onDrop($event, 'rows')"
          class="min-h-12 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-1.5 flex flex-col gap-1"
        >
          @for (fieldId of rowFieldIds(); track fieldId) {
            <div cdkDrag [cdkDragData]="fieldId"
              class="flex items-center justify-between bg-blue-100 border border-blue-300 rounded px-2 py-1 text-xs cursor-grab"
            >
              <span class="flex items-center gap-1.5">
                <span class="text-blue-400">⠿</span>
                {{ labelOf(fieldId) }}
              </span>
              <button (click)="removeFromRows(fieldId)" class="text-blue-400 hover:text-red-500 ml-1">✕</button>
            </div>
          }
        </div>
      </div>

      <!-- Columns (複数フィールドで階層ドリルダウン) -->
      <div>
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Columns
          @if (config().columnFields.length > 1) {
            <span class="ml-1 text-purple-500 font-normal normal-case">({{ config().columnFields.length }} levels)</span>
          }
        </div>
        <div
          cdkDropList
          id="columns"
          [cdkDropListData]="columnFieldIds()"
          [cdkDropListConnectedTo]="['fieldList', 'rows']"
          (cdkDropListDropped)="onDrop($event, 'columns')"
          class="min-h-12 rounded-lg border-2 border-dashed border-purple-200 bg-purple-50 p-1.5 flex flex-col gap-1"
        >
          @for (fieldId of columnFieldIds(); track fieldId; let i = $index) {
            <div cdkDrag [cdkDragData]="fieldId"
              class="flex items-center justify-between bg-purple-100 border border-purple-300 rounded px-2 py-1 text-xs cursor-grab"
            >
              <span class="flex items-center gap-1.5">
                @if (config().columnFields.length > 1) {
                  <span class="text-purple-300 font-mono">L{{ i + 1 }}</span>
                }
                <span class="text-purple-400">⠿</span>
                {{ labelOf(fieldId) }}
              </span>
              <button (click)="removeFromColumns(fieldId)" class="text-purple-400 hover:text-red-500 ml-1">✕</button>
            </div>
          }
          @if (columnFieldIds().length === 0) {
            <div class="text-xs text-gray-400 text-center py-2">フィールドをドラッグ (複数で階層化)</div>
          }
        </div>
      </div>

      <!-- Values -->
      <div class="flex-1">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Values</div>
        <div class="min-h-12 rounded-lg border-2 border-dashed border-green-200 bg-green-50 p-1.5 flex flex-col gap-1">
          @for (vf of config().valueFields; track vf.fieldId) {
            <div class="bg-green-100 border border-green-300 rounded px-2 py-1 text-xs flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <span class="flex items-center gap-1.5">
                  <span class="text-green-400">∑</span>
                  {{ labelOf(vf.fieldId) }}
                </span>
                <button (click)="removeFromValues(vf.fieldId)" class="text-green-400 hover:text-red-500">✕</button>
              </div>
              <select [value]="vf.aggFn" (change)="changeAggFn(vf.fieldId, $any($event.target).value)"
                class="text-xs bg-white border border-green-200 rounded px-1 py-0.5 w-full"
              >
                <option value="sum">Sum</option>
                <option value="count">Count</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          }
          @for (fieldId of availableMeasureIds(); track fieldId) {
            <button (click)="addToValues(fieldId)"
              class="text-left bg-white border border-dashed border-green-300 rounded px-2 py-1 text-xs text-green-700 hover:bg-green-100"
            >
              + {{ labelOf(fieldId) }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class PivotFieldConfigComponent {
  config = input.required<PivotConfig>();
  allFields = input.required<FieldDef[]>();
  configChange = output<PivotConfig>();

  rowFieldIds = computed(() => [...this.config().rowFields]);
  columnFieldIds = computed(() => [...this.config().columnFields]);

  availableFieldIds = computed(() => {
    const cfg = this.config();
    const used = new Set([...cfg.rowFields, ...cfg.columnFields]);
    return this.allFields().filter(f => f.type === 'dimension' && !used.has(f.id)).map(f => f.id);
  });

  availableMeasureIds = computed(() => {
    const usedMeasures = new Set(this.config().valueFields.map(v => v.fieldId));
    return this.allFields().filter(f => f.type === 'measure' && !usedMeasures.has(f.id)).map(f => f.id);
  });

  labelOf(fieldId: string): string {
    return this.allFields().find(f => f.id === fieldId)?.label ?? fieldId;
  }

  onDrop(event: CdkDragDrop<string[]>, targetZone: 'fieldList' | 'rows' | 'columns') {
    const cfg = this.config();
    const fieldId: string = event.item.data;

    // Same-container reorder
    if (event.previousContainer === event.container) {
      if (targetZone === 'rows') {
        const rows = [...cfg.rowFields];
        moveItemInArray(rows, event.previousIndex, event.currentIndex);
        this.emit({ ...cfg, rowFields: rows });
      } else if (targetZone === 'columns') {
        const cols = [...cfg.columnFields];
        moveItemInArray(cols, event.previousIndex, event.currentIndex);
        this.emit({ ...cfg, columnFields: cols });
      }
      return;
    }

    // Cross-zone move
    const fromZone = this.detectZone(event.previousContainer.id);
    let newCfg = { ...cfg, rowFields: [...cfg.rowFields], columnFields: [...cfg.columnFields] };

    // Remove from source zone
    if (fromZone === 'rows') {
      newCfg.rowFields = newCfg.rowFields.filter(f => f !== fieldId);
    } else if (fromZone === 'columns') {
      newCfg.columnFields = newCfg.columnFields.filter(f => f !== fieldId);
    }

    // Add to target zone
    if (targetZone === 'rows') {
      newCfg.rowFields.splice(event.currentIndex, 0, fieldId);
    } else if (targetZone === 'columns') {
      newCfg.columnFields.splice(event.currentIndex, 0, fieldId);
    }
    // targetZone === 'fieldList' means just removing

    this.emit(newCfg);
  }

  private detectZone(containerId: string): 'fieldList' | 'rows' | 'columns' {
    if (containerId === 'rows') return 'rows';
    if (containerId === 'columns') return 'columns';
    return 'fieldList';
  }

  removeFromRows(fieldId: string) {
    const cfg = this.config();
    this.emit({ ...cfg, rowFields: cfg.rowFields.filter(f => f !== fieldId) });
  }

  removeFromColumns(fieldId: string) {
    const cfg = this.config();
    this.emit({ ...cfg, columnFields: cfg.columnFields.filter(f => f !== fieldId) });
  }

  addToValues(fieldId: string) {
    const cfg = this.config();
    const vf: ValueFieldConfig = { fieldId, aggFn: 'sum', label: this.labelOf(fieldId) };
    this.emit({ ...cfg, valueFields: [...cfg.valueFields, vf] });
  }

  removeFromValues(fieldId: string) {
    const cfg = this.config();
    this.emit({ ...cfg, valueFields: cfg.valueFields.filter(v => v.fieldId !== fieldId) });
  }

  changeAggFn(fieldId: string, aggFn: AggFnName) {
    const cfg = this.config();
    this.emit({
      ...cfg,
      valueFields: cfg.valueFields.map(v => v.fieldId === fieldId ? { ...v, aggFn } : v),
    });
  }

  private emit(cfg: PivotConfig) {
    this.configChange.emit(cfg);
  }
}
