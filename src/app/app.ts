import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PivotConfig } from './types';
import { ALL_FIELDS, SALES_DATA } from './data/sales-data';
import { PivotTableComponent } from './components/pivot-table/pivot-table.component';
import { PivotFieldConfigComponent } from './components/pivot-field-config/pivot-field-config.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PivotTableComponent, PivotFieldConfigComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-screen bg-gray-50">
      <header class="bg-blue-700 text-white px-4 py-2.5 flex items-center gap-3 shadow-md flex-none">
        <span class="text-lg font-bold tracking-tight">TanStack Pivot Table</span>
        <span class="text-blue-300 text-xs">Angular + TanStack Table v8</span>
      </header>

      <main class="flex flex-1 overflow-hidden">
        <!-- Field Configuration Panel -->
        <aside class="w-56 flex-none bg-white border-r border-gray-200 p-3 overflow-y-auto">
          <app-pivot-field-config
            [config]="pivotConfig()"
            [allFields]="allFields"
            (configChange)="pivotConfig.set($event)"
          />
        </aside>

        <!-- Pivot Table Area -->
        <section class="flex-1 overflow-hidden p-3 flex flex-col">
          <div class="mb-2 flex items-center gap-2">
            <span class="text-xs text-gray-500">
              Rows: <strong>{{ rowLabel() }}</strong>
              &nbsp;|&nbsp; Columns: <strong>{{ colLabel() }}</strong>
              &nbsp;|&nbsp; Values: <strong>{{ valueLabel() }}</strong>
            </span>
          </div>
          <div class="flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <app-pivot-table
              [data]="salesData"
              [config]="pivotConfig()"
            />
          </div>
        </section>
      </main>
    </div>
  `,
})
export class App {
  readonly salesData = SALES_DATA;
  readonly allFields = ALL_FIELDS;

  pivotConfig = signal<PivotConfig>({
    rowFields: ['region', 'category'],
    columnFields: ['channel', 'month'],
    valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
  });

  rowLabel() {
    const cfg = this.pivotConfig();
    return cfg.rowFields.length > 0
      ? cfg.rowFields.map(f => ALL_FIELDS.find(fd => fd.id === f)?.label ?? f).join(', ')
      : '(none)';
  }

  colLabel() {
    const cfg = this.pivotConfig();
    return cfg.columnFields.length > 0
      ? cfg.columnFields.map(f => ALL_FIELDS.find(fd => fd.id === f)?.label ?? f).join(' > ')
      : '(none)';
  }

  valueLabel() {
    const cfg = this.pivotConfig();
    return cfg.valueFields.length > 0
      ? cfg.valueFields.map(v => `${v.aggFn}(${ALL_FIELDS.find(f => f.id === v.fieldId)?.label ?? v.fieldId})`).join(', ')
      : '(none)';
  }
}
