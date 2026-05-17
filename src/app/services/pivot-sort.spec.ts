import { describe, expect, it } from 'vitest';
import { PivotConfig, SaleRecord } from '../types';
import { PivotDataService, makeCellKey } from './pivot-data.service';
import { preservePivotRowHierarchy, sortTopLevelColumnNodesByRow } from './pivot-sort';

const DATA: SaleRecord[] = [
  // Channel: Online,  Month: Jan
  { region: 'West', category: 'Hardware', product: 'Laptop',  channel: 'Online', month: 'Jan', sales: 300, cost: 180, profit: 120, quantity: 4 },
  // Channel: Online,  Month: Feb
  { region: 'West', category: 'Software', product: 'License', channel: 'Online', month: 'Feb', sales:  50, cost:  10, profit:  40, quantity: 1 },
  // Channel: Retail,  Month: Mar
  { region: 'West', category: 'Hardware', product: 'Laptop',  channel: 'Retail', month: 'Mar', sales: 100, cost:  70, profit:  30, quantity: 2 },
  // Channel: Retail,  Month: Jan
  { region: 'East', category: 'Hardware', product: 'Tablet',  channel: 'Retail', month: 'Jan', sales:  80, cost:  50, profit:  30, quantity: 3 },
  // Channel: Online,  Month: Mar
  { region: 'East', category: 'Hardware', product: 'Tablet',  channel: 'Online', month: 'Mar', sales: 120, cost:  80, profit:  40, quantity: 5 },
];

// Channel → Month 2階層のピボット
const CONFIG: PivotConfig = {
  rowFields: ['region'],
  columnFields: ['channel', 'month'],
  valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
};

function compute() {
  return new PivotDataService().compute(DATA, CONFIG);
}

describe('columnNode sort logic', () => {
  it('top-level nodes have the aggregate key that exists in each row', () => {
    const pd = compute();
    // トップレベルノード: Online, Retail
    // それぞれのキーで行データにアクセスできること
    const west = pd.rows.find(r => r.__label === 'West')!;
    const online = pd.columnNodes.find(n => n.value === 'Online')!;
    const retail = pd.columnNodes.find(n => n.value === 'Retail')!;

    const onlineVal = west[makeCellKey(online.key, 'sales', 'sum')];
    const retailVal = west[makeCellKey(retail.key, 'sales', 'sum')];

    // West の Online 合計: 300 + 50 = 350, Retail 合計: 100
    expect(onlineVal).toBe(350);
    expect(retailVal).toBe(100);
  });

  it('sorts top-level nodes desc by West row → Online first', () => {
    const pd = compute();
    const west = pd.rows.find(r => r.__label === 'West')!;

    const sorted = sortTopLevelColumnNodesByRow(pd.columnNodes, west, 'sales', 'sum', 'desc');
    expect(sorted.map(n => n.value)).toEqual(['Online', 'Retail']); // 350 > 100
  });

  it('sorts top-level nodes asc by West row → Retail first', () => {
    const pd = compute();
    const west = pd.rows.find(r => r.__label === 'West')!;

    const sorted = sortTopLevelColumnNodesByRow(pd.columnNodes, west, 'sales', 'sum', 'asc');
    expect(sorted.map(n => n.value)).toEqual(['Retail', 'Online']); // 100 < 350
  });

  it('expanded parent node (Online) still sorts by its own subtotal key, not child keys', () => {
    const pd = compute();
    const west = pd.rows.find(r => r.__label === 'West')!;
    const online = pd.columnNodes.find(n => n.value === 'Online')!;

    // Online が展開されていてもトップレベルの node.key ("Online") を使う
    // → 子の個別キー ("Online|||Jan" 等) ではなく親の subtotal で比較する
    const sortKeyUsedForOnline = makeCellKey(online.key, 'sales', 'sum');
    expect(sortKeyUsedForOnline).toBe('__cell__Online__sales__sum');
    expect(west[sortKeyUsedForOnline]).toBe(350);

    // 子キーのうち最大値 (Online|||Jan = 300) と比較: subtotal (350) の方が大きい
    const childKey = makeCellKey('Online|||Jan', 'sales', 'sum');
    expect(west[childKey]).toBe(300);
    expect((west[sortKeyUsedForOnline] as number)).toBeGreaterThan(west[childKey] as number);
  });

  it('child nodes inside expanded group have their own keys in row data', () => {
    const pd = compute();
    const west = pd.rows.find(r => r.__label === 'West')!;
    const online = pd.columnNodes.find(n => n.value === 'Online')!;

    // 展開中の子ノードのキー
    const children = online.children;
    expect(children.map(c => c.value)).toContain('Jan');
    expect(children.map(c => c.value)).toContain('Feb');

    const janNode = children.find(c => c.value === 'Jan')!;
    const febNode = children.find(c => c.value === 'Feb')!;

    // West での子ノードの値
    expect(west[makeCellKey(janNode.key, 'sales', 'sum')]).toBe(300); // Online|||Jan
    expect(west[makeCellKey(febNode.key, 'sales', 'sum')]).toBe(50);  // Online|||Feb

    // 子ノードをトップレベルソート関数にかけると個別値でソートされてしまう。
    // コンポーネント側では子リストには適用しない。
    const sortedChildren = sortTopLevelColumnNodesByRow(
      online.children,
      west,
      'sales', 'sum', 'asc'
    );
    // asc: Mar(null→-Infinity) → Feb(50) → Jan(300) ← 子が独立ソートされている
    // West に Online|||Mar のデータがないので -Infinity 扱いで先頭
    expect(sortedChildren.map(c => c.value)).toEqual(['Mar', 'Feb', 'Jan']);

    // 自然順は Jan → Feb (月順)
    expect(online.children.map(c => c.value)).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('children of expanded nodes should stay in natural order regardless of row sort', () => {
    const pd = compute();
    const online = pd.columnNodes.find(n => n.value === 'Online')!;
    const west = pd.rows.find(r => r.__label === 'West')!;

    // 自然順 (月順)
    const naturalOrder = online.children.map(c => c.value);
    expect(naturalOrder).toEqual(['Jan', 'Feb', 'Mar']);

    // トップレベル用ソートを子に適用すると自然順が崩れる → buildColDefs では適用してはいけない
    const wronglySorted = sortTopLevelColumnNodesByRow(online.children, west, 'sales', 'sum', 'asc');
    expect(wronglySorted.map(c => c.value)).not.toEqual(naturalOrder);
  });

  it('expanded child leaf order remains attached to the sorted parent group', () => {
    const pd = compute();
    const west = pd.rows.find(r => r.__label === 'West')!;

    const sortedParents = sortTopLevelColumnNodesByRow(pd.columnNodes, west, 'sales', 'sum', 'asc');
    const visibleLeaves = sortedParents.flatMap(parent => {
      if (parent.value === 'Online') {
        return [...parent.children.map(child => child.key), `subtotal__${parent.key}__sales__sum`];
      }
      return [parent.key];
    });

    expect(visibleLeaves).toEqual([
      'Retail',
      'Online|||Jan',
      'Online|||Feb',
      'Online|||Mar',
      'subtotal__Online__sales__sum',
    ]);
  });

  it('setGridOption does not reorder: need applyColumnState for explicit ordering', () => {
    // AG Grid の setGridOption('columnDefs', newDefs) は既存列の順序を保持する仕様。
    // 列の並び替えには applyColumnState + applyOrder:true が必要。
    // このテストはその事実を仕様として記述する（AG Grid API の直接テストは不可能なため、
    // 期待する leaf column order を pure function で検証する）。
    const pd = compute();
    const west = pd.rows.find(r => r.__label === 'West')!;

    // desc sort: Online(350) > Retail(100) → Online first
    const descSorted = sortTopLevelColumnNodesByRow(pd.columnNodes, west, 'sales', 'sum', 'desc');
    expect(descSorted.map(n => n.value)).toEqual(['Online', 'Retail']);

    // asc sort: Retail(100) < Online(350) → Retail first
    const ascSorted = sortTopLevelColumnNodesByRow(pd.columnNodes, west, 'sales', 'sum', 'asc');
    expect(ascSorted.map(n => n.value)).toEqual(['Retail', 'Online']);

    // applyColumnState に渡す leaf colId の期待順序 (asc 時)
    // Retail の leaf: __cell__Retail__sales__sum
    // Online の leaves (expanded の場合): Online|||Jan, Online|||Feb, Online|||Mar, subtotal__Online
    // この順序を applyColumnState({ state: [...], applyOrder: true }) で渡すことで列を並び替える
    const retailLeafKey = makeCellKey('Retail', 'sales', 'sum');
    const onlineJanKey = makeCellKey('Online|||Jan', 'sales', 'sum');
    expect(retailLeafKey).toBe('__cell__Retail__sales__sum');
    expect(onlineJanKey).toBe('__cell__Online|||Jan__sales__sum');
  });

  it('grand total row can also be used as sort key', () => {
    const pd = compute();
    const grandTotal = pd.grandTotal;

    const sorted = sortTopLevelColumnNodesByRow(pd.columnNodes, grandTotal, 'sales', 'sum', 'desc');
    // Grand Total: Online = 470 (300+50+120), Retail = 180 (100+80)
    expect(sorted[0].value).toBe('Online');
    expect(sorted[1].value).toBe('Retail');
  });
});

describe('row sort hierarchy preservation', () => {
  it('keeps child rows under their parent after AG Grid flat sorting', () => {
    const pd = new PivotDataService().compute(DATA, {
      rowFields: ['region', 'category'],
      columnFields: ['channel'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });
    const west = pd.rows.find(r => r.__label === 'West')!;
    const east = pd.rows.find(r => r.__label === 'East')!;
    const westChildren = pd.childrenMap.get(west.__key)!;
    const eastChildren = pd.childrenMap.get(east.__key)!;
    const visibleRows = [west, ...westChildren, east, ...eastChildren];

    const flatSortedKeys = [
      'West|||Software',
      'East|||Hardware',
      'West',
      'West|||Hardware',
      'East',
    ];

    expect(preservePivotRowHierarchy(visibleRows, flatSortedKeys).map(row => row.__key)).toEqual([
      'West',
      'West|||Software',
      'West|||Hardware',
      'East',
      'East|||Hardware',
    ]);
  });

  it('sorts each visible sibling group independently', () => {
    const pd = new PivotDataService().compute(DATA, {
      rowFields: ['region', 'category'],
      columnFields: ['channel'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });
    const west = pd.rows.find(r => r.__label === 'West')!;
    const east = pd.rows.find(r => r.__label === 'East')!;
    const visibleRows = [
      east,
      ...(pd.childrenMap.get(east.__key) ?? []),
      west,
      ...(pd.childrenMap.get(west.__key) ?? []),
    ];

    const flatSortedKeys = [
      'West|||Software',
      'West|||Hardware',
      'East',
      'West',
      'East|||Hardware',
    ];

    expect(preservePivotRowHierarchy(visibleRows, flatSortedKeys).map(row => row.__key)).toEqual([
      'East',
      'East|||Hardware',
      'West',
      'West|||Software',
      'West|||Hardware',
    ]);
  });
});
