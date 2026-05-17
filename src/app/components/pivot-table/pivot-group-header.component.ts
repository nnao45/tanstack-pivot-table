import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IHeaderGroupAngularComp, IHeaderAngularComp } from 'ag-grid-angular';
import { IHeaderGroupParams, IHeaderParams } from 'ag-grid-community';

export interface PivotGroupContext {
  toggleColExpand: (key: string) => void;
  isColExpanded: (key: string) => boolean;
  isExpandable: (key: string) => boolean;
  toggleColumnHeaderSort: (key: string) => false | 'asc' | 'desc';
  getColumnHeaderSort: (key: string) => false | 'asc' | 'desc';
  clearColumnHeaderSort: () => void;
}

/** 展開中のグループヘッダー (ColGroupDef 用) */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="display:flex;align-items:center;gap:4px;width:100%;user-select:none;padding:0 4px;"
      (click)="$event.stopPropagation()"
    >
      <button
        type="button"
        title="Collapse"
        style="flex:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:10px;line-height:1;padding:0;"
        (click)="onToggle($event)"
      >▾</button>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ label }}</span>
      <button
        type="button"
        title="Sort by subtotal"
        [style.color]="sortState ? '#ffffff' : 'rgba(255,255,255,0.65)'"
        style="flex:none;border:0;background:transparent;cursor:pointer;font-size:11px;line-height:1;padding:0 2px;"
        (click)="onSort($event)"
      >{{ sortIcon }}</button>
    </div>
  `,
})
export class PivotExpandedGroupHeaderComponent implements IHeaderGroupAngularComp {
  label = '';
  sortState: false | 'asc' | 'desc' = false;
  private groupKey = '';
  private ctx!: PivotGroupContext;

  get sortIcon(): string {
    if (this.sortState === 'desc') return '↓';
    if (this.sortState === 'asc') return '↑';
    return '↕';
  }

  agInit(params: IHeaderGroupParams): void {
    this.label = params.displayName;
    this.groupKey = params.columnGroup.getGroupId();
    this.ctx = params.context as PivotGroupContext;
    this.sortState = this.ctx.getColumnHeaderSort(this.groupKey);
  }

  refresh(params: IHeaderGroupParams): boolean {
    this.label = params.displayName;
    this.groupKey = params.columnGroup.getGroupId();
    this.sortState = this.ctx.getColumnHeaderSort(this.groupKey);
    return true;
  }

  onToggle(event: MouseEvent) {
    event.stopPropagation();
    this.ctx.toggleColExpand(this.groupKey);
  }

  onSort(event: MouseEvent) {
    event.stopPropagation();
    this.sortState = this.ctx.toggleColumnHeaderSort(this.groupKey);
  }
}

/** 折畳み中のグループヘッダー (ColGroupDef 用) */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="display:flex;align-items:center;gap:4px;width:100%;user-select:none;padding:0 4px;"
      (click)="$event.stopPropagation()"
    >
      <button
        type="button"
        title="Expand"
        style="flex:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:10px;line-height:1;padding:0;"
        (click)="onToggle($event)"
      >▸</button>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ label }}</span>
      <button
        type="button"
        title="Sort by subtotal"
        [style.color]="sortState ? '#ffffff' : 'rgba(255,255,255,0.65)'"
        style="flex:none;border:0;background:transparent;cursor:pointer;font-size:11px;line-height:1;padding:0 2px;"
        (click)="onSort($event)"
      >{{ sortIcon }}</button>
    </div>
  `,
})
export class PivotCollapsedGroupHeaderComponent implements IHeaderGroupAngularComp {
  label = '';
  sortState: false | 'asc' | 'desc' = false;
  private groupKey = '';
  private ctx!: PivotGroupContext;

  get sortIcon(): string {
    if (this.sortState === 'desc') return '↓';
    if (this.sortState === 'asc') return '↑';
    return '↕';
  }

  agInit(params: IHeaderGroupParams): void {
    this.label = params.displayName;
    this.groupKey = params.columnGroup.getGroupId();
    this.ctx = params.context as PivotGroupContext;
    this.sortState = this.ctx.getColumnHeaderSort(this.groupKey);
  }

  refresh(params: IHeaderGroupParams): boolean {
    this.label = params.displayName;
    this.groupKey = params.columnGroup.getGroupId();
    this.sortState = this.ctx.getColumnHeaderSort(this.groupKey);
    return true;
  }

  onToggle(event: MouseEvent) {
    event.stopPropagation();
    this.ctx.toggleColExpand(this.groupKey);
  }

  onSort(event: MouseEvent) {
    event.stopPropagation();
    this.sortState = this.ctx.toggleColumnHeaderSort(this.groupKey);
  }
}

/** 折畳み中の単列ヘッダー (ColDef 用) */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="display:flex;align-items:center;gap:4px;width:100%;user-select:none;padding:0 4px;"
      (click)="$event.stopPropagation()"
    >
      <button
        type="button"
        title="Expand"
        style="flex:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:10px;line-height:1;padding:0;"
        (click)="onToggle($event)"
      >▸</button>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ label }}</span>
      <button
        type="button"
        title="Sort by subtotal"
        [style.color]="sortState ? '#ffffff' : 'rgba(255,255,255,0.65)'"
        style="flex:none;border:0;background:transparent;cursor:pointer;font-size:11px;line-height:1;padding:0 2px;"
        (click)="onSort($event)"
      >{{ sortIcon }}</button>
    </div>
  `,
})
export class PivotCollapsedHeaderComponent implements IHeaderAngularComp {
  label = '';
  sortState: false | 'asc' | 'desc' = false;
  private groupKey = '';
  private ctx!: PivotGroupContext;

  get sortIcon(): string {
    if (this.sortState === 'desc') return '↓';
    if (this.sortState === 'asc') return '↑';
    return '↕';
  }

  agInit(params: IHeaderParams & { groupKey?: string }): void {
    this.label = params.displayName;
    this.groupKey = params.groupKey ?? params.column.getColId();
    this.ctx = params.context as PivotGroupContext;
    this.sortState = this.ctx.getColumnHeaderSort(this.groupKey);
  }

  refresh(params: IHeaderParams & { groupKey?: string }): boolean {
    this.label = params.displayName;
    this.groupKey = params.groupKey ?? params.column.getColId();
    this.sortState = this.ctx.getColumnHeaderSort(this.groupKey);
    return true;
  }

  onToggle(event: MouseEvent) {
    event.stopPropagation();
    this.ctx.toggleColExpand(this.groupKey);
  }

  onSort(event: MouseEvent) {
    event.stopPropagation();
    this.sortState = this.ctx.toggleColumnHeaderSort(this.groupKey);
  }
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span></span>`,
})
export class PivotEmptyHeaderComponent implements IHeaderAngularComp {
  agInit(): void {}
  refresh(): boolean {
    return true;
  }
}

/** 通常の葉列ヘッダー。ラベルクリックではソートせず、右端アイコンだけでソートする。 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="display:flex;align-items:center;gap:4px;width:100%;user-select:none;padding:0 4px;"
      (click)="$event.stopPropagation()"
    >
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ label }}</span>
      <button
        type="button"
        title="Sort"
        [style.color]="sortState ? '#ffffff' : 'rgba(255,255,255,0.65)'"
        style="flex:none;border:0;background:transparent;cursor:pointer;font-size:11px;line-height:1;padding:0 2px;"
        (click)="onSort($event)"
      >{{ sortIcon }}</button>
    </div>
  `,
})
export class PivotSortableHeaderComponent implements IHeaderAngularComp {
  label = '';
  sortState: false | 'asc' | 'desc' = false;
  private params!: IHeaderParams;
  private ctx!: PivotGroupContext;

  get sortIcon(): string {
    if (this.sortState === 'desc') return '↓';
    if (this.sortState === 'asc') return '↑';
    return '↕';
  }

  agInit(params: IHeaderParams): void {
    this.params = params;
    this.ctx = params.context as PivotGroupContext;
    this.label = params.displayName;
    this.sortState = params.column.getSort() ?? false;
  }

  refresh(params: IHeaderParams): boolean {
    this.params = params;
    this.ctx = params.context as PivotGroupContext;
    this.label = params.displayName;
    this.sortState = params.column.getSort() ?? false;
    return true;
  }

  onSort(event: MouseEvent) {
    event.stopPropagation();
    this.ctx.clearColumnHeaderSort();
    this.params.progressSort(false);
    this.sortState = this.params.column.getSort() ?? false;
  }
}
