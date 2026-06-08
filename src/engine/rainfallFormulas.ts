export interface GuangzhouSingleP {
  A: number;
  b: number;
  n: number;
}

export interface CityFormula {
  region: string;
  city: string;
  district?: string;
  label: string;
  standard: string;
  A1: number | null;
  C: number | null;
  b: number | null;
  n: number | null;
  P_range: string;
  t_range: string;
  applicable: string;
  peak_r: number;
  gz_single_P?: Record<number, GuangzhouSingleP>;
  note?: string;
}

export const REGION_LIST = ['华南', '华东', '华中', '华北', '东北', '西南', '西北', '自定义'];

export const RAINFALL_FORMULAS: Record<string, CityFormula> = {
  // ══ 华南地区 ══════════════════════════════════════════════
  "深圳西部": {
    region: "华南", city: "深圳", district: "西部",
    label: "深圳市 · 西部区域",
    standard: "深圳市暴雨强度公式（2024版）",
    A1: 2698.815, C: 0.593, b: 11.03, n: 0.648,
    P_range: "1~100", t_range: "5~1440",
    applicable: "宝安区、南山区、福田区、罗湖区",
    peak_r: 0.40
  },
  "深圳中部": {
    region: "华南", city: "深圳", district: "中部",
    label: "深圳市 · 中部区域",
    standard: "深圳市暴雨强度公式（2024版）",
    A1: 2747.221, C: 0.588, b: 10.92, n: 0.651,
    P_range: "1~100", t_range: "5~1440",
    applicable: "龙华区、龙岗区西部、坪山区西部",
    peak_r: 0.40
  },
  "深圳东部": {
    region: "华南", city: "深圳", district: "东部",
    label: "深圳市 · 东部区域",
    standard: "深圳市暴雨强度公式（2024版）",
    A1: 2856.334, C: 0.579, b: 10.25, n: 0.660,
    P_range: "1~100", t_range: "5~1440",
    applicable: "盐田区、大鹏新区、龙岗区东部",
    peak_r: 0.40
  },
  "广州": {
    region: "华南", city: "广州",
    label: "广州市（2023版）",
    standard: "广州市水务局暴雨强度公式（2023年3月修订）",
    A1: 3618.427, C: 0.533, b: 11.259, n: 0.750,
    P_range: "0.25~100", t_range: "5~180",
    applicable: "广州市中心城区",
    peak_r: 0.40,
    gz_single_P: {
      0.25: { A: 6976.425, b: 17.660, n: 0.972 },
      0.33: { A: 6737.448, b: 17.269, n: 0.945 },
      0.5:  { A: 6561.430, b: 16.812, n: 0.911 },
      1:    { A: 6366.875, b: 16.190, n: 0.863 },
      2:    { A: 5920.317, b: 14.646, n: 0.815 },
      3:    { A: 5688.521, b: 13.841, n: 0.789 },
      5:    { A: 5411.802, b: 12.874, n: 0.758 },
      10:   { A: 5050.414, b: 11.610, n: 0.717 },
      20:   { A: 4161.139, b: 8.406,  n: 0.653 },
      50:   { A: 3623.399, b: 6.274,  n: 0.598 },
      100:  { A: 3293.741, b: 4.951,  n: 0.562 }
    },
    note: "广州2023版为单一重现期公式，系统将自动选取最近P值精确计算"
  },
  "海口": {
    region: "华南", city: "海口",
    label: "海口市",
    standard: "海口市暴雨强度公式（2018版）",
    A1: 3337.090, C: 0.420, b: 8.50, n: 0.690,
    P_range: "1~100", t_range: "5~120",
    applicable: "海口市中心城区",
    peak_r: 0.40
  },

  // ══ 华东地区 ══════════════════════════════════════════════
  "上海": {
    region: "华东", city: "上海",
    label: "上海市",
    standard: "DG/TJ 08-2051-2016《上海市暴雨强度公式》",
    A1: 1600.129, C: 0.846, b: 7.000, n: 0.630,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "上海市全市域",
    peak_r: 0.40,
    note: "2016年修订版，采用年最大值法"
  },
  "杭州": {
    region: "华东", city: "杭州",
    label: "杭州市",
    standard: "杭州市暴雨强度公式（2018版）",
    A1: 2852.900, C: 0.670, b: 12.600, n: 0.728,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "杭州市主城区",
    peak_r: 0.40
  },
  "南京": {
    region: "华东", city: "南京",
    label: "南京市",
    standard: "南京市暴雨强度公式（2019版）",
    A1: 1271.000, C: 0.670, b: 5.700, n: 0.587,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "南京市主城区及江宁、江北新区",
    peak_r: 0.40
  },
  "合肥": {
    region: "华东", city: "合肥",
    label: "合肥市",
    standard: "合肥市暴雨强度公式（2016版）",
    A1: 1539.811, C: 0.640, b: 8.740, n: 0.644,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "合肥市中心城区",
    peak_r: 0.40
  },
  "济南": {
    region: "华东", city: "济南",
    label: "济南市",
    standard: "济南市暴雨强度公式（2018版）",
    A1: 1929.000, C: 0.750, b: 9.00, n: 0.680,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "济南市主城区",
    peak_r: 0.40
  },
  "福州": {
    region: "华东", city: "福州",
    label: "福州市",
    standard: "福州市暴雨强度公式（2017版）",
    A1: 2624.530, C: 0.610, b: 10.550, n: 0.680,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "福州市主城区",
    peak_r: 0.40
  },
  "南昌": {
    region: "华东", city: "南昌",
    label: "南昌市",
    standard: "南昌市暴雨强度公式（2016版）",
    A1: 2105.840, C: 0.620, b: 9.180, n: 0.660,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "南昌市主城区",
    peak_r: 0.40
  },

  // ══ 华中地区 ══════════════════════════════════════════════
  "武汉": {
    region: "华中", city: "武汉",
    label: "武汉市",
    standard: "武汉市暴雨强度公式（2016版）",
    A1: 983.928, C: 0.520, b: 3.000, n: 0.535,
    P_range: "1~100", t_range: "5~120",
    applicable: "武汉市中心城区",
    peak_r: 0.40
  },
  "长沙": {
    region: "华中", city: "长沙",
    label: "长沙市",
    standard: "长沙市暴雨强度公式（2018版）",
    A1: 1839.620, C: 0.560, b: 8.500, n: 0.631,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "长沙市主城区",
    peak_r: 0.40
  },
  "郑州": {
    region: "华中", city: "郑州",
    label: "郑州市",
    standard: "郑州市暴雨强度公式（2021版）",
    A1: 2679.226, C: 0.775, b: 14.138, n: 0.751,
    P_range: "0.5~100", t_range: "5~180",
    applicable: "郑州市中心城区",
    peak_r: 0.40,
    note: "2021年7月特大暴雨后修订，重现期适用范围扩展至100年"
  },

  // ══ 华北地区 ══════════════════════════════════════════════
  "北京I区": {
    region: "华北", city: "北京", district: "中心城区(I区)",
    label: "北京市 · I区（中心城区）",
    standard: "DB11/T 969-2016《北京市城镇雨水系统规划设计暴雨径流计算标准》",
    A1: 2747.0, C: 0.640, b: 13.00, n: 0.712,
    P_range: "1~100", t_range: "5~180",
    applicable: "北京市中心城区（五环以内及周边地区）",
    peak_r: 0.40,
    note: "年最大值法，2017年2月实施"
  },
  "北京II区": {
    region: "华北", city: "北京", district: "外围新城(II区)",
    label: "北京市 · II区（外围新城）",
    standard: "DB11/T 969-2016《北京市城镇雨水系统规划设计暴雨径流计算标准》",
    A1: 2399.0, C: 0.640, b: 12.00, n: 0.710,
    P_range: "1~100", t_range: "5~180",
    applicable: "通州、顺义、大兴、房山、昌平等新城地区",
    peak_r: 0.40
  },
  "太原": {
    region: "华北", city: "太原",
    label: "太原市",
    standard: "太原市暴雨强度公式（2017版）",
    A1: 1272.940, C: 0.830, b: 6.550, n: 0.632,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "太原市中心城区",
    peak_r: 0.42
  },
  "石家庄": {
    region: "华北", city: "石家庄",
    label: "石家庄市",
    standard: "石家庄市暴雨强度公式（2016版）",
    A1: 1803.120, C: 0.820, b: 11.600, n: 0.720,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "石家庄市主城区",
    peak_r: 0.45
  },
  "呼和浩特": {
    region: "华北", city: "呼和浩特",
    label: "呼和浩特市",
    standard: "呼和浩特市暴雨强度公式（2016版）",
    A1: 901.600, C: 0.870, b: 5.200, n: 0.630,
    P_range: "0.5~50", t_range: "5~120",
    applicable: "呼和浩特市主城区",
    peak_r: 0.45
  },

  // ══ 东北地区 ══════════════════════════════════════════════
  "沈阳": {
    region: "东北", city: "沈阳",
    label: "沈阳市",
    standard: "沈阳市暴雨强度公式（2018版）",
    A1: 1522.580, C: 0.760, b: 9.300, n: 0.670,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "沈阳市中心城区",
    peak_r: 0.40
  },
  "长春": {
    region: "东北", city: "长春",
    label: "长春市",
    standard: "长春市暴雨强度公式（2017版）",
    A1: 1199.500, C: 0.790, b: 5.400, n: 0.590,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "长春市主城区",
    peak_r: 0.40
  },
  "哈尔滨": {
    region: "东北", city: "哈尔滨",
    label: "哈尔滨市",
    standard: "哈尔滨市暴雨强度公式（2018版）",
    A1: 1010.080, C: 0.750, b: 4.800, n: 0.560,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "哈尔滨市主城区",
    peak_r: 0.40
  },

  // ══ 西南地区 ══════════════════════════════════════════════
  "成都": {
    region: "西南", city: "成都",
    label: "成都市",
    standard: "成都市暴雨强度公式（2016版）",
    A1: 1038.186, C: 0.830, b: 6.000, n: 0.584,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "成都市绕城高速以内中心城区",
    peak_r: 0.40
  },
  "贵阳": {
    region: "西南", city: "贵阳",
    label: "贵阳市",
    standard: "贵阳市暴雨强度公式（2017版）",
    A1: 1250.060, C: 0.640, b: 5.800, n: 0.582,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "贵阳市中心城区",
    peak_r: 0.40
  },
  "昆明": {
    region: "西南", city: "昆明",
    label: "昆明市",
    standard: "昆明市暴雨强度公式（2018版）",
    A1: 1020.600, C: 0.570, b: 4.500, n: 0.560,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "昆明市主城区",
    peak_r: 0.40
  },
  "南宁": {
    region: "西南", city: "南宁",
    label: "南宁市",
    standard: "南宁市暴雨强度公式（2019版）",
    A1: 2702.140, C: 0.530, b: 10.340, n: 0.690,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "南宁市主城区",
    peak_r: 0.40
  },

  // ══ 西北地区 ══════════════════════════════════════════════
  "西安": {
    region: "西北", city: "西安",
    label: "西安市",
    standard: "西安市暴雨强度公式（2018版）",
    A1: 1193.060, C: 0.760, b: 5.350, n: 0.591,
    P_range: "0.5~100", t_range: "5~120",
    applicable: "西安市主城区",
    peak_r: 0.42
  },
  "兰州": {
    region: "西北", city: "兰州",
    label: "兰州市",
    standard: "兰州市暴雨强度公式（2016版）",
    A1: 672.000, C: 0.700, b: 2.500, n: 0.580,
    P_range: "0.5~50", t_range: "5~120",
    applicable: "兰州市主城区",
    peak_r: 0.45
  },
  "西宁": {
    region: "西北", city: "西宁",
    label: "西宁市",
    standard: "西宁市暴雨强度公式（2017版）",
    A1: 588.400, C: 0.670, b: 2.200, n: 0.560,
    P_range: "0.5~50", t_range: "5~120",
    applicable: "西宁市主城区",
    peak_r: 0.45
  },
  "银川": {
    region: "西北", city: "银川",
    label: "银川市",
    standard: "银川市暴雨强度公式（2016版）",
    A1: 620.000, C: 0.680, b: 2.800, n: 0.560,
    P_range: "0.5~50", t_range: "5~120",
    applicable: "银川市主城区",
    peak_r: 0.45
  },
  "乌鲁木齐": {
    region: "西北", city: "乌鲁木齐",
    label: "乌鲁木齐市",
    standard: "乌鲁木齐市暴雨强度公式（2018版）",
    A1: 532.000, C: 0.710, b: 2.500, n: 0.570,
    P_range: "0.5~50", t_range: "5~120",
    applicable: "乌鲁木齐市主城区",
    peak_r: 0.50
  },

  // ══ 自定义 ════════════════════════════════════════════════
  "自定义": {
    region: "自定义", city: "自定义",
    label: "自定义城市",
    standard: "用户自定义参数",
    A1: 2000, C: 0.6, b: 10, n: 0.6, // Default values
    P_range: "-", t_range: "-",
    applicable: "用户自行确定",
    peak_r: 0.40,
    note: "请参照当地《暴雨强度公式》官方文件填写参数"
  }
};

/**
 * 广州专用计算
 */
function calcGZ(P: number, t: number): number {
  const table = RAINFALL_FORMULAS["广州"].gz_single_P!;
  const keys = Object.keys(table).map(Number).sort((a,b) => a - b);
  const nearest = keys.reduce((prev, curr) =>
    Math.abs(curr - P) < Math.abs(prev - P) ? curr : prev
  );
  const f = table[nearest];
  return f.A / Math.pow(t + f.b, f.n);
}

export function calcRainfallIntensity(cityKey: string | null, _districtKey: string | null, P: number, t_min: number): number {
  const f = RAINFALL_FORMULAS[cityKey || "深圳西部"];
  if (!f) return 0;
  
  if (cityKey === "广州" || f.city === "广州") {
    return calcGZ(P, t_min);
  }
  
  if (f.A1 == null || f.C == null || f.b == null || f.n == null) return 0;
  return (f.A1 * (1 + f.C * Math.log10(P))) / Math.pow(t_min + f.b, f.n);
}

