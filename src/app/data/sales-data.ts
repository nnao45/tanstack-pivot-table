import { FieldDef, SaleRecord } from '../types';

export const ALL_FIELDS: FieldDef[] = [
  { id: 'region',   label: 'Region',   type: 'dimension' },
  { id: 'category', label: 'Category', type: 'dimension' },
  { id: 'channel',  label: 'Channel',  type: 'dimension' },
  { id: 'product',  label: 'Product',  type: 'dimension' },
  { id: 'month',    label: 'Month',    type: 'dimension' },
  { id: 'segment',  label: 'Segment',  type: 'dimension' },
  { id: 'customer', label: 'Customer', type: 'dimension' },
  { id: 'salesRep', label: 'Sales Rep', type: 'dimension' },
  { id: 'sales',    label: 'Sales',    type: 'measure'   },
  { id: 'cost',     label: 'Cost',     type: 'measure'   },
  { id: 'profit',   label: 'Profit',   type: 'measure'   },
  { id: 'quantity', label: 'Quantity', type: 'measure'   },
];

// region × category × channel × month (4×3×3×6 = 216 combinations, ~180 records)
const BASE_SALES_DATA: SaleRecord[] = [
  // === East / Electronics ===
  { region:'East', category:'Electronics', channel:'Online',  product:'Laptop', month:'Jan', sales:1200, cost:800,  profit:400, quantity:3  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Phone',  month:'Jan', sales:800,  cost:520,  profit:280, quantity:5  },
  { region:'East', category:'Electronics', channel:'Retail',  product:'Laptop', month:'Jan', sales:1350, cost:890,  profit:460, quantity:4  },
  { region:'East', category:'Electronics', channel:'Retail',  product:'Tablet', month:'Jan', sales:650,  cost:420,  profit:230, quantity:4  },
  { region:'East', category:'Electronics', channel:'Wholesale',product:'Laptop', month:'Jan', sales:980,  cost:680,  profit:300, quantity:2  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Laptop', month:'Feb', sales:1350, cost:880,  profit:470, quantity:4  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Phone',  month:'Feb', sales:900,  cost:590,  profit:310, quantity:6  },
  { region:'East', category:'Electronics', channel:'Retail',  product:'Laptop', month:'Feb', sales:1500, cost:980,  profit:520, quantity:4  },
  { region:'East', category:'Electronics', channel:'Wholesale',product:'Tablet', month:'Feb', sales:720,  cost:470,  profit:250, quantity:5  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Laptop', month:'Mar', sales:1500, cost:970,  profit:530, quantity:4  },
  { region:'East', category:'Electronics', channel:'Retail',  product:'Phone',  month:'Mar', sales:950,  cost:615,  profit:335, quantity:7  },
  { region:'East', category:'Electronics', channel:'Wholesale',product:'Laptop', month:'Mar', sales:1100, cost:730,  profit:370, quantity:3  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Laptop', month:'Apr', sales:1400, cost:910,  profit:490, quantity:3  },
  { region:'East', category:'Electronics', channel:'Retail',  product:'Tablet', month:'Apr', sales:700,  cost:455,  profit:245, quantity:5  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Phone',  month:'May', sales:1000, cost:650,  profit:350, quantity:7  },
  { region:'East', category:'Electronics', channel:'Retail',  product:'Laptop', month:'May', sales:1600, cost:1050, profit:550, quantity:4  },
  { region:'East', category:'Electronics', channel:'Wholesale',product:'Phone',  month:'Jun', sales:850,  cost:560,  profit:290, quantity:5  },
  { region:'East', category:'Electronics', channel:'Online',  product:'Laptop', month:'Jun', sales:1700, cost:1110, profit:590, quantity:5  },

  // === East / Clothing ===
  { region:'East', category:'Clothing', channel:'Online',  product:'Jacket', month:'Jan', sales:450,  cost:270,  profit:180, quantity:9  },
  { region:'East', category:'Clothing', channel:'Retail',  product:'Shoes',  month:'Jan', sales:320,  cost:195,  profit:125, quantity:8  },
  { region:'East', category:'Clothing', channel:'Wholesale',product:'Jacket', month:'Jan', sales:390,  cost:240,  profit:150, quantity:7  },
  { region:'East', category:'Clothing', channel:'Online',  product:'Jacket', month:'Feb', sales:480,  cost:290,  profit:190, quantity:10 },
  { region:'East', category:'Clothing', channel:'Retail',  product:'Shoes',  month:'Feb', sales:350,  cost:215,  profit:135, quantity:9  },
  { region:'East', category:'Clothing', channel:'Online',  product:'Jacket', month:'Mar', sales:420,  cost:255,  profit:165, quantity:8  },
  { region:'East', category:'Clothing', channel:'Wholesale',product:'Shoes',  month:'Mar', sales:370,  cost:225,  profit:145, quantity:10 },
  { region:'East', category:'Clothing', channel:'Retail',  product:'Jacket', month:'Apr', sales:460,  cost:280,  profit:180, quantity:9  },
  { region:'East', category:'Clothing', channel:'Online',  product:'Shoes',  month:'May', sales:400,  cost:245,  profit:155, quantity:9  },
  { region:'East', category:'Clothing', channel:'Retail',  product:'Jacket', month:'Jun', sales:440,  cost:265,  profit:175, quantity:8  },

  // === East / Food ===
  { region:'East', category:'Food', channel:'Online',  product:'Coffee', month:'Jan', sales:180, cost:90,  profit:90,  quantity:20 },
  { region:'East', category:'Food', channel:'Retail',  product:'Coffee', month:'Jan', sales:210, cost:105, profit:105, quantity:24 },
  { region:'East', category:'Food', channel:'Wholesale',product:'Coffee', month:'Jan', sales:240, cost:120, profit:120, quantity:30 },
  { region:'East', category:'Food', channel:'Online',  product:'Tea',    month:'Feb', sales:150, cost:75,  profit:75,  quantity:18 },
  { region:'East', category:'Food', channel:'Retail',  product:'Coffee', month:'Feb', sales:220, cost:110, profit:110, quantity:25 },
  { region:'East', category:'Food', channel:'Online',  product:'Coffee', month:'Mar', sales:210, cost:105, profit:105, quantity:23 },
  { region:'East', category:'Food', channel:'Wholesale',product:'Tea',    month:'Apr', sales:170, cost:85,  profit:85,  quantity:20 },
  { region:'East', category:'Food', channel:'Retail',  product:'Coffee', month:'May', sales:230, cost:115, profit:115, quantity:26 },
  { region:'East', category:'Food', channel:'Online',  product:'Coffee', month:'Jun', sales:200, cost:100, profit:100, quantity:22 },

  // === West / Electronics ===
  { region:'West', category:'Electronics', channel:'Online',  product:'Laptop', month:'Jan', sales:1100, cost:720, profit:380, quantity:2  },
  { region:'West', category:'Electronics', channel:'Retail',  product:'Phone',  month:'Jan', sales:750,  cost:490, profit:260, quantity:6  },
  { region:'West', category:'Electronics', channel:'Wholesale',product:'Laptop', month:'Jan', sales:900,  cost:600, profit:300, quantity:2  },
  { region:'West', category:'Electronics', channel:'Online',  product:'Laptop', month:'Feb', sales:1200, cost:790, profit:410, quantity:3  },
  { region:'West', category:'Electronics', channel:'Retail',  product:'Tablet', month:'Feb', sales:680,  cost:445, profit:235, quantity:5  },
  { region:'West', category:'Electronics', channel:'Wholesale',product:'Phone',  month:'Mar', sales:820,  cost:540, profit:280, quantity:5  },
  { region:'West', category:'Electronics', channel:'Online',  product:'Laptop', month:'Mar', sales:1300, cost:850, profit:450, quantity:3  },
  { region:'West', category:'Electronics', channel:'Retail',  product:'Laptop', month:'Apr', sales:1250, cost:820, profit:430, quantity:3  },
  { region:'West', category:'Electronics', channel:'Online',  product:'Phone',  month:'May', sales:880,  cost:575, profit:305, quantity:7  },
  { region:'West', category:'Electronics', channel:'Wholesale',product:'Laptop', month:'May', sales:1400, cost:920, profit:480, quantity:4  },
  { region:'West', category:'Electronics', channel:'Retail',  product:'Laptop', month:'Jun', sales:1500, cost:980, profit:520, quantity:4  },

  // === West / Clothing ===
  { region:'West', category:'Clothing', channel:'Online',   product:'Jacket', month:'Jan', sales:500,  cost:305, profit:195, quantity:10 },
  { region:'West', category:'Clothing', channel:'Retail',   product:'Shoes',  month:'Jan', sales:420,  cost:255, profit:165, quantity:9  },
  { region:'West', category:'Clothing', channel:'Wholesale', product:'Jacket', month:'Feb', sales:530,  cost:325, profit:205, quantity:11 },
  { region:'West', category:'Clothing', channel:'Online',   product:'Shoes',  month:'Mar', sales:460,  cost:280, profit:180, quantity:10 },
  { region:'West', category:'Clothing', channel:'Retail',   product:'Jacket', month:'Apr', sales:510,  cost:310, profit:200, quantity:10 },
  { region:'West', category:'Clothing', channel:'Online',   product:'Shoes',  month:'May', sales:430,  cost:265, profit:165, quantity:9  },
  { region:'West', category:'Clothing', channel:'Wholesale', product:'Jacket', month:'Jun', sales:490,  cost:300, profit:190, quantity:10 },

  // === West / Food ===
  { region:'West', category:'Food', channel:'Online',   product:'Coffee', month:'Jan', sales:200, cost:100, profit:100, quantity:22 },
  { region:'West', category:'Food', channel:'Retail',   product:'Tea',    month:'Jan', sales:160, cost:80,  profit:80,  quantity:19 },
  { region:'West', category:'Food', channel:'Wholesale', product:'Coffee', month:'Feb', sales:260, cost:130, profit:130, quantity:32 },
  { region:'West', category:'Food', channel:'Online',   product:'Coffee', month:'Mar', sales:240, cost:120, profit:120, quantity:28 },
  { region:'West', category:'Food', channel:'Retail',   product:'Tea',    month:'Apr', sales:180, cost:90,  profit:90,  quantity:21 },
  { region:'West', category:'Food', channel:'Online',   product:'Coffee', month:'May', sales:230, cost:115, profit:115, quantity:26 },
  { region:'West', category:'Food', channel:'Wholesale', product:'Tea',    month:'Jun', sales:210, cost:105, profit:105, quantity:25 },

  // === North / Electronics ===
  { region:'North', category:'Electronics', channel:'Online',   product:'Laptop', month:'Jan', sales:900,  cost:590, profit:310, quantity:2  },
  { region:'North', category:'Electronics', channel:'Retail',   product:'Phone',  month:'Jan', sales:650,  cost:425, profit:225, quantity:4  },
  { region:'North', category:'Electronics', channel:'Online',   product:'Laptop', month:'Feb', sales:980,  cost:640, profit:340, quantity:2  },
  { region:'North', category:'Electronics', channel:'Wholesale', product:'Tablet', month:'Feb', sales:580,  cost:380, profit:200, quantity:4  },
  { region:'North', category:'Electronics', channel:'Retail',   product:'Laptop', month:'Mar', sales:1050, cost:690, profit:360, quantity:3  },
  { region:'North', category:'Electronics', channel:'Online',   product:'Phone',  month:'Apr', sales:720,  cost:470, profit:250, quantity:5  },
  { region:'North', category:'Electronics', channel:'Wholesale', product:'Laptop', month:'May', sales:1100, cost:720, profit:380, quantity:3  },
  { region:'North', category:'Electronics', channel:'Retail',   product:'Laptop', month:'Jun', sales:1200, cost:785, profit:415, quantity:3  },

  // === North / Clothing ===
  { region:'North', category:'Clothing', channel:'Online',   product:'Jacket', month:'Jan', sales:380,  cost:230, profit:150, quantity:7  },
  { region:'North', category:'Clothing', channel:'Retail',   product:'Shoes',  month:'Feb', sales:310,  cost:190, profit:120, quantity:7  },
  { region:'North', category:'Clothing', channel:'Wholesale', product:'Jacket', month:'Mar', sales:420,  cost:255, profit:165, quantity:9  },
  { region:'North', category:'Clothing', channel:'Online',   product:'Shoes',  month:'Apr', sales:340,  cost:208, profit:132, quantity:8  },
  { region:'North', category:'Clothing', channel:'Retail',   product:'Jacket', month:'May', sales:400,  cost:244, profit:156, quantity:8  },
  { region:'North', category:'Clothing', channel:'Online',   product:'Jacket', month:'Jun', sales:360,  cost:220, profit:140, quantity:7  },

  // === North / Food ===
  { region:'North', category:'Food', channel:'Online',   product:'Coffee', month:'Jan', sales:150, cost:75, profit:75, quantity:18 },
  { region:'North', category:'Food', channel:'Retail',   product:'Tea',    month:'Feb', sales:140, cost:70, profit:70, quantity:17 },
  { region:'North', category:'Food', channel:'Wholesale', product:'Coffee', month:'Mar', sales:190, cost:95, profit:95, quantity:23 },
  { region:'North', category:'Food', channel:'Online',   product:'Coffee', month:'Apr', sales:160, cost:80, profit:80, quantity:19 },
  { region:'North', category:'Food', channel:'Retail',   product:'Tea',    month:'May', sales:155, cost:78, profit:78, quantity:18 },
  { region:'North', category:'Food', channel:'Online',   product:'Coffee', month:'Jun', sales:175, cost:88, profit:88, quantity:21 },

  // === South / Electronics ===
  { region:'South', category:'Electronics', channel:'Online',   product:'Phone',  month:'Jan', sales:700,  cost:460, profit:240, quantity:4  },
  { region:'South', category:'Electronics', channel:'Retail',   product:'Laptop', month:'Jan', sales:1050, cost:690, profit:360, quantity:3  },
  { region:'South', category:'Electronics', channel:'Wholesale', product:'Phone',  month:'Feb', sales:780,  cost:510, profit:270, quantity:5  },
  { region:'South', category:'Electronics', channel:'Online',   product:'Laptop', month:'Mar', sales:1150, cost:755, profit:395, quantity:3  },
  { region:'South', category:'Electronics', channel:'Retail',   product:'Tablet', month:'Apr', sales:680,  cost:445, profit:235, quantity:5  },
  { region:'South', category:'Electronics', channel:'Wholesale', product:'Laptop', month:'May', sales:1200, cost:790, profit:410, quantity:3  },
  { region:'South', category:'Electronics', channel:'Online',   product:'Phone',  month:'Jun', sales:900,  cost:590, profit:310, quantity:6  },

  // === South / Clothing ===
  { region:'South', category:'Clothing', channel:'Online',   product:'Shoes',  month:'Jan', sales:280,  cost:170, profit:110, quantity:6  },
  { region:'South', category:'Clothing', channel:'Retail',   product:'Jacket', month:'Feb', sales:350,  cost:215, profit:135, quantity:7  },
  { region:'South', category:'Clothing', channel:'Wholesale', product:'Shoes',  month:'Mar', sales:340,  cost:208, profit:132, quantity:8  },
  { region:'South', category:'Clothing', channel:'Online',   product:'Jacket', month:'Apr', sales:390,  cost:238, profit:152, quantity:8  },
  { region:'South', category:'Clothing', channel:'Retail',   product:'Shoes',  month:'May', sales:360,  cost:220, profit:140, quantity:8  },
  { region:'South', category:'Clothing', channel:'Online',   product:'Jacket', month:'Jun', sales:380,  cost:232, profit:148, quantity:8  },

  // === South / Food ===
  { region:'South', category:'Food', channel:'Online',   product:'Coffee', month:'Jan', sales:160, cost:80, profit:80,  quantity:19 },
  { region:'South', category:'Food', channel:'Retail',   product:'Tea',    month:'Feb', sales:145, cost:73, profit:72,  quantity:17 },
  { region:'South', category:'Food', channel:'Wholesale', product:'Coffee', month:'Mar', sales:195, cost:98, profit:97,  quantity:24 },
  { region:'South', category:'Food', channel:'Online',   product:'Tea',    month:'Apr', sales:155, cost:78, profit:77,  quantity:18 },
  { region:'South', category:'Food', channel:'Retail',   product:'Coffee', month:'May', sales:180, cost:90, profit:90,  quantity:21 },
  { region:'South', category:'Food', channel:'Online',   product:'Coffee', month:'Jun', sales:170, cost:85, profit:85,  quantity:20 },
];

const REGIONS = ['East', 'West', 'North', 'South', 'Central', 'International'];
const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Home', 'Sports', 'Beauty'];
const CHANNELS = ['Online', 'Retail', 'Wholesale', 'Marketplace'];
const PRODUCTS = ['Laptop', 'Phone', 'Tablet', 'Jacket', 'Shoes', 'Coffee', 'Tea', 'Desk', 'Bike', 'Serum'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEGMENTS = ['Consumer', 'Corporate', 'Enterprise', 'SMB'];
const SALES_REPS = Array.from({ length: 48 }, (_, i) => `Rep ${String(i + 1).padStart(2, '0')}`);
const CUSTOMERS = Array.from({ length: 750 }, (_, i) => `Customer ${String(i + 1).padStart(4, '0')}`);

function generateLargeSalesData(count = 25000): SaleRecord[] {
  const records: SaleRecord[] = [];
  for (let i = 0; i < count; i++) {
    const region = REGIONS[i % REGIONS.length];
    const category = CATEGORIES[Math.floor(i / 3) % CATEGORIES.length];
    const channel = CHANNELS[Math.floor(i / 7) % CHANNELS.length];
    const product = PRODUCTS[Math.floor(i / 11) % PRODUCTS.length];
    const month = MONTHS[Math.floor(i / 13) % MONTHS.length];
    const segment = SEGMENTS[Math.floor(i / 17) % SEGMENTS.length];
    const customer = CUSTOMERS[(i * 37) % CUSTOMERS.length];
    const salesRep = SALES_REPS[(i * 19) % SALES_REPS.length];
    const quantity = 1 + ((i * 5) % 24);
    const base = 80 + ((i * 97) % 2400);
    const sales = base + quantity * 12;
    const cost = Math.round(sales * (0.52 + ((i % 19) / 100)));
    const profit = sales - cost;

    records.push({ region, category, product, channel, month, segment, customer, salesRep, sales, cost, profit, quantity });
  }
  return records;
}

export const SALES_DATA: SaleRecord[] = [...BASE_SALES_DATA, ...generateLargeSalesData()];
