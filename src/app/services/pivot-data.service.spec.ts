import { describe, expect, it } from 'vitest';
import { PivotConfig, SaleRecord } from '../types';
import { PivotDataService, makeCellKey, makeRowTotalKey } from './pivot-data.service';
import { SALES_DATA } from '../data/sales-data';

const DATA: SaleRecord[] = [
  { region: 'West', category: 'Hardware', product: 'Laptop', channel: 'Retail', month: 'Mar', sales: 100, cost: 70, profit: 30, quantity: 2 },
  { region: 'West', category: 'Hardware', product: 'Laptop', channel: 'Online', month: 'Jan', sales: 300, cost: 180, profit: 120, quantity: 4 },
  { region: 'West', category: 'Software', product: 'License', channel: 'Online', month: 'Feb', sales: 50, cost: 10, profit: 40, quantity: 1 },
  { region: 'East', category: 'Hardware', product: 'Tablet', channel: 'Retail', month: 'Jan', sales: 80, cost: 50, profit: 30, quantity: 3 },
  { region: 'East', category: 'Hardware', product: 'Tablet', channel: 'Online', month: 'Mar', sales: 120, cost: 80, profit: 40, quantity: 5 },
];

function compute(config: PivotConfig) {
  return new PivotDataService().compute(DATA, config);
}

describe('PivotDataService', () => {
  it('returns an empty pivot when required axes are missing', () => {
    const result = compute({
      rowFields: [],
      columnFields: ['month'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    expect(result.rows).toEqual([]);
    expect(result.columnNodes).toEqual([]);
    expect(result.childrenMap.size).toBe(0);
    expect(result.grandTotal.__label).toBe('Grand Total');
  });

  it('builds a sorted row tree and preserves child lookup keys', () => {
    const result = compute({
      rowFields: ['region', 'category'],
      columnFields: ['month'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    expect(result.rows.map(row => row.__label)).toEqual(['East', 'West']);
    expect(result.rows.every(row => row.__isGroup)).toBe(true);
    expect(result.childrenMap.get('East')?.map(row => row.__label)).toEqual(['Hardware']);
    expect(result.childrenMap.get('West')?.map(row => row.__label)).toEqual(['Hardware', 'Software']);
  });

  it('sorts month columns by calendar order instead of lexical order', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: ['month'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    expect(result.columnNodes.map(node => node.value)).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('computes every aggregate from one bucket without losing row totals', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: ['channel'],
      valueFields: [
        { fieldId: 'sales', aggFn: 'sum', label: 'Sales' },
        { fieldId: 'sales', aggFn: 'avg', label: 'Avg Sales' },
        { fieldId: 'profit', aggFn: 'min', label: 'Min Profit' },
        { fieldId: 'profit', aggFn: 'max', label: 'Max Profit' },
        { fieldId: 'quantity', aggFn: 'count', label: 'Count' },
      ],
    });

    const west = result.rows.find(row => row.__label === 'West')!;
    expect(west[makeCellKey('Online', 'sales', 'sum')]).toBe(350);
    expect(west[makeCellKey('Online', 'sales', 'avg')]).toBe(175);
    expect(west[makeCellKey('Online', 'profit', 'min')]).toBe(40);
    expect(west[makeCellKey('Online', 'profit', 'max')]).toBe(120);
    expect(west[makeCellKey('Online', 'quantity', 'count')]).toBe(2);
    expect(west[makeRowTotalKey('sales', 'sum')]).toBe(450);
    expect(west[makeRowTotalKey('sales', 'avg')]).toBe(150);
  });

  it('counts dimension fields without requiring numeric conversion', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: ['channel'],
      valueFields: [{ fieldId: 'product', aggFn: 'count', label: 'Products' }],
    });

    const west = result.rows.find(row => row.__label === 'West')!;
    expect(west[makeCellKey('Online', 'product', 'count')]).toBe(2);
    expect(west[makeRowTotalKey('product', 'count')]).toBe(3);
    expect(result.grandTotal[makeRowTotalKey('product', 'count')]).toBe(5);
  });

  it('keeps missing row/column intersections as null while totals remain numeric', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: ['category'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    const east = result.rows.find(row => row.__label === 'East')!;
    const west = result.rows.find(row => row.__label === 'West')!;
    expect(east[makeCellKey('Software', 'sales', 'sum')]).toBeNull();
    expect(west[makeCellKey('Software', 'sales', 'sum')]).toBe(50);
    expect(east[makeRowTotalKey('sales', 'sum')]).toBe(200);
  });

  it('supports the no-column pivot using the synthetic total column', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    expect(result.columnNodes).toEqual([
      { value: 'Total', field: '', key: '__total__', depth: 0, children: [] },
    ]);
    expect(result.rows.find(row => row.__label === 'East')?.[makeCellKey('__total__', 'sales', 'sum')]).toBe(200);
    expect(result.grandTotal[makeCellKey('__total__', 'sales', 'sum')]).toBe(650);
    expect(result.grandTotal[makeRowTotalKey('sales', 'sum')]).toBe(650);
  });

  it('computes subtotal column buckets across nested column levels', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: ['channel', 'month'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    const west = result.rows.find(row => row.__label === 'West')!;
    expect(west[makeCellKey('Online', 'sales', 'sum')]).toBe(350);
    expect(west[makeCellKey('Online|||Jan', 'sales', 'sum')]).toBe(300);
    expect(west[makeCellKey('Online|||Feb', 'sales', 'sum')]).toBe(50);
    expect(result.grandTotal[makeCellKey('Retail', 'sales', 'sum')]).toBe(180);
  });

  it('builds nested column trees in sorted order while aggregating', () => {
    const result = compute({
      rowFields: ['region'],
      columnFields: ['channel', 'month'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    expect(result.columnNodes.map(node => node.value)).toEqual(['Online', 'Retail']);
    expect(result.columnNodes[0].children.map(node => node.value)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(result.columnNodes[1].children.map(node => node.value)).toEqual(['Jan', 'Mar']);
  });

  it('ships a large generated dataset with high-cardinality dimensions', () => {
    expect(SALES_DATA.length).toBe(25101);
    expect(new Set(SALES_DATA.map(record => record.customer).filter(Boolean)).size).toBeGreaterThan(700);
    expect(new Set(SALES_DATA.map(record => record.salesRep).filter(Boolean)).size).toBe(48);
    expect(SALES_DATA.slice(-100).every(record => record.segment && record.customer && record.salesRep)).toBe(true);
  });

  it('materializes row cell keys used by virtualized columns for the large dataset', () => {
    const result = new PivotDataService().compute(SALES_DATA, {
      rowFields: ['region', 'category'],
      columnFields: ['channel', 'month'],
      valueFields: [{ fieldId: 'sales', aggFn: 'sum', label: 'Sales' }],
    });

    const central = result.rows.find(row => row.__label === 'Central')!;
    const onlineKey = makeCellKey('Online', 'sales', 'sum');
    const retailKey = makeCellKey('Retail', 'sales', 'sum');
    const wholesaleKey = makeCellKey('Wholesale', 'sales', 'sum');
    const marketplaceKey = makeCellKey('Marketplace', 'sales', 'sum');
    const rowTotalKey = makeRowTotalKey('sales', 'sum');

    expect(central[marketplaceKey]).toBe(sumSales(record => record.region === 'Central' && record.channel === 'Marketplace'));
    expect(central[onlineKey]).toBe(sumSales(record => record.region === 'Central' && record.channel === 'Online'));
    expect(central[retailKey]).toBe(sumSales(record => record.region === 'Central' && record.channel === 'Retail'));
    expect(central[wholesaleKey]).toBe(sumSales(record => record.region === 'Central' && record.channel === 'Wholesale'));
    expect(central[rowTotalKey]).toBe(sumSales(record => record.region === 'Central'));
    expect(result.grandTotal[rowTotalKey]).toBe(
      sumSales(() => true)
    );
  });
});

function sumSales(predicate: (record: SaleRecord) => boolean): number {
  return SALES_DATA.reduce((sum, record) => predicate(record) ? sum + record.sales : sum, 0);
}
