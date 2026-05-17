import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IHeaderGroupAngularComp, IHeaderAngularComp } from 'ag-grid-angular';
import { IHeaderGroupParams, IHeaderParams } from 'ag-grid-community';

export interface PivotGroupContext {
  toggleColExpand: (key: string) => void;
  isColExpanded: (key: string) => boolean;
  isExpandable: (key: string) => boolean;
}

/** 展開中のグループヘッダー (ColGroupDef 用) */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="display:flex;align-items:center;gap:4px;width:100%;cursor:pointer;user-select:none;padding:0 4px;"
      (click)="onToggle()"
    >
      <span style="font-size:10px;flex:none;">▾</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ label }}</span>
    </div>
  `,
})
export class PivotExpandedGroupHeaderComponent implements IHeaderGroupAngularComp {
  label = '';
  private groupKey = '';
  private ctx!: PivotGroupContext;

  agInit(params: IHeaderGroupParams): void {
    this.label = params.displayName;
    this.groupKey = params.columnGroup.getGroupId();
    this.ctx = params.context as PivotGroupContext;
  }

  refresh(params: IHeaderGroupParams): boolean {
    this.label = params.displayName;
    this.groupKey = params.columnGroup.getGroupId();
    return true;
  }

  onToggle() {
    this.ctx.toggleColExpand(this.groupKey);
  }
}

/** 折畳み中の単列ヘッダー (ColDef 用、子ありノード) */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      style="display:flex;align-items:center;gap:4px;width:100%;cursor:pointer;user-select:none;padding:0 4px;"
      (click)="onToggle()"
    >
      <span style="font-size:10px;flex:none;">▸</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ label }}</span>
    </div>
  `,
})
export class PivotCollapsedHeaderComponent implements IHeaderAngularComp {
  label = '';
  private groupKey = '';
  private ctx!: PivotGroupContext;

  agInit(params: IHeaderParams & { groupKey?: string }): void {
    this.label = params.displayName;
    this.groupKey = params.groupKey ?? params.column.getColId();
    this.ctx = params.context as PivotGroupContext;
  }

  refresh(params: IHeaderParams & { groupKey?: string }): boolean {
    this.label = params.displayName;
    this.groupKey = params.groupKey ?? params.column.getColId();
    return true;
  }

  onToggle() {
    this.ctx.toggleColExpand(this.groupKey);
  }
}
