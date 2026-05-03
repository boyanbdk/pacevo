// VDOT lookup table and pace derivation.
// Source: Daniels' Running Formula, 4th ed., Appendix A.
// All paces in seconds per kilometre.

import { Paces, HrZones } from "./types";

interface VdotRow {
  E: [number, number];
  M: number;
  T: number;
  I: number;
  R: number;
}

const VDOT_TABLE: Record<number, VdotRow> = {
  30: { E: [462, 534], M: 420, T: 396, I: 372, R: 348 },
  31: { E: [450, 522], M: 408, T: 384, I: 360, R: 336 },
  32: { E: [438, 510], M: 396, T: 372, I: 348, R: 325 },
  33: { E: [426, 498], M: 384, T: 362, I: 338, R: 315 },
  34: { E: [415, 486], M: 374, T: 352, I: 328, R: 305 },
  35: { E: [404, 474], M: 364, T: 342, I: 318, R: 296 },
  36: { E: [394, 463], M: 354, T: 333, I: 309, R: 288 },
  37: { E: [384, 452], M: 345, T: 324, I: 300, R: 280 },
  38: { E: [374, 442], M: 336, T: 315, I: 292, R: 272 },
  39: { E: [365, 432], M: 327, T: 307, I: 284, R: 265 },
  40: { E: [356, 422], M: 319, T: 299, I: 276, R: 257 },
  41: { E: [348, 413], M: 311, T: 291, I: 269, R: 250 },
  42: { E: [340, 404], M: 303, T: 284, I: 262, R: 244 },
  43: { E: [332, 395], M: 296, T: 277, I: 255, R: 237 },
  44: { E: [324, 386], M: 289, T: 270, I: 249, R: 231 },
  45: { E: [317, 378], M: 282, T: 263, I: 243, R: 225 },
  46: { E: [310, 370], M: 275, T: 257, I: 237, R: 219 },
  47: { E: [303, 362], M: 269, T: 251, I: 231, R: 213 },
  48: { E: [297, 354], M: 263, T: 245, I: 226, R: 208 },
  49: { E: [290, 347], M: 257, T: 239, I: 221, R: 203 },
  50: { E: [284, 340], M: 251, T: 234, I: 215, R: 198 },
  51: { E: [278, 333], M: 246, T: 229, I: 210, R: 193 },
  52: { E: [273, 326], M: 241, T: 224, I: 205, R: 188 },
  53: { E: [267, 320], M: 236, T: 219, I: 201, R: 184 },
  54: { E: [262, 314], M: 231, T: 214, I: 196, R: 180 },
  55: { E: [257, 308], M: 226, T: 210, I: 192, R: 176 },
  56: { E: [252, 302], M: 222, T: 205, I: 188, R: 172 },
  57: { E: [247, 296], M: 217, T: 201, I: 184, R: 168 },
  58: { E: [243, 291], M: 213, T: 197, I: 180, R: 164 },
  59: { E: [238, 285], M: 209, T: 193, I: 177, R: 161 },
  60: { E: [234, 280], M: 205, T: 189, I: 173, R: 157 },
  61: { E: [230, 275], M: 201, T: 185, I: 170, R: 154 },
  62: { E: [226, 270], M: 197, T: 182, I: 166, R: 151 },
  63: { E: [222, 265], M: 194, T: 178, I: 163, R: 148 },
  64: { E: [218, 261], M: 190, T: 175, I: 160, R: 145 },
  65: { E: [215, 256], M: 187, T: 172, I: 157, R: 142 },
  66: { E: [211, 252], M: 183, T: 169, I: 154, R: 139 },
  67: { E: [208, 248], M: 180, T: 166, I: 151, R: 137 },
  68: { E: [204, 244], M: 177, T: 163, I: 148, R: 134 },
  69: { E: [201, 240], M: 174, T: 160, I: 146, R: 132 },
  70: { E: [198, 236], M: 171, T: 157, I: 143, R: 129 },
  71: { E: [195, 232], M: 168, T: 155, I: 141, R: 127 },
  72: { E: [192, 229], M: 165, T: 152, I: 138, R: 125 },
  73: { E: [189, 225], M: 163, T: 150, I: 136, R: 123 },
  74: { E: [186, 222], M: 160, T: 147, I: 134, R: 121 },
  75: { E: [184, 219], M: 158, T: 145, I: 131, R: 119 },
  76: { E: [181, 216], M: 155, T: 143, I: 129, R: 117 },
  77: { E: [179, 213], M: 153, T: 140, I: 127, R: 115 },
  78: { E: [176, 210], M: 151, T: 138, I: 125, R: 113 },
  79: { E: [174, 207], M: 148, T: 136, I: 123, R: 111 },
  80: { E: [172, 204], M: 146, T: 134, I: 121, R: 109 },
  81: { E: [169, 202], M: 144, T: 132, I: 119, R: 107 },
  82: { E: [167, 199], M: 142, T: 130, I: 117, R: 105 },
  83: { E: [165, 197], M: 140, T: 128, I: 115, R: 104 },
  84: { E: [163, 194], M: 138, T: 126, I: 114, R: 102 },
  85: { E: [161, 192], M: 136, T: 124, I: 112, R: 100 },
};

// (distance_m, time_s, vdot) tuples for common race distances.
// Source: Daniels VDOT tables.
const RACE_VDOT: Array<[number, number, number]> = [
  // 5 km
  [5000,1800,30],[5000,1728,32],[5000,1659,34],[5000,1594,36],
  [5000,1533,38],[5000,1474,40],[5000,1418,42],[5000,1364,44],
  [5000,1313,46],[5000,1265,48],[5000,1218,50],[5000,1174,52],
  [5000,1132,54],[5000,1091,56],[5000,1053,58],[5000,1016,60],
  [5000,981,62],[5000,948,64],[5000,915,66],[5000,884,68],
  [5000,855,70],[5000,827,72],[5000,800,74],[5000,774,76],
  [5000,749,78],[5000,725,80],[5000,702,82],[5000,680,84],
  // 10 km
  [10000,3720,30],[10000,3570,32],[10000,3427,34],[10000,3293,36],
  [10000,3165,38],[10000,3044,40],[10000,2929,42],[10000,2820,44],
  [10000,2716,46],[10000,2617,48],[10000,2524,50],[10000,2434,52],
  [10000,2350,54],[10000,2269,56],[10000,2192,58],[10000,2118,60],
  [10000,2048,62],[10000,1981,64],[10000,1917,66],[10000,1856,68],
  [10000,1798,70],[10000,1742,72],[10000,1689,74],[10000,1638,76],
  [10000,1589,78],[10000,1542,80],[10000,1497,82],[10000,1454,84],
  // half marathon
  [21098,8100,30],[21098,7762,32],[21098,7442,34],[21098,7140,36],
  [21098,6855,38],[21098,6585,40],[21098,6329,42],[21098,6086,44],
  [21098,5856,46],[21098,5636,48],[21098,5428,50],[21098,5230,52],
  [21098,5041,54],[21098,4861,56],[21098,4690,58],[21098,4526,60],
  [21098,4370,62],[21098,4221,64],[21098,4079,66],[21098,3943,68],
  [21098,3813,70],[21098,3689,72],[21098,3570,74],[21098,3456,76],
  [21098,3347,78],[21098,3243,80],[21098,3143,82],[21098,3047,84],
  // marathon
  [42195,16800,30],[42195,16080,32],[42195,15394,34],[42195,14742,36],
  [42195,14121,38],[42195,13531,40],[42195,12969,42],[42195,12435,44],
  [42195,11926,46],[42195,11442,48],[42195,10980,50],[42195,10540,52],
  [42195,10121,54],[42195,9722,56],[42195,9341,58],[42195,8978,60],
  [42195,8631,62],[42195,8300,64],[42195,7984,66],[42195,7681,68],
  [42195,7392,70],[42195,7115,72],[42195,6850,74],[42195,6596,76],
  [42195,6353,78],[42195,6120,80],[42195,5897,82],[42195,5683,84],
];

export function riegelPredict(fromDistanceM: number, fromTimeS: number, toDistanceM: number): number {
  // Source: Riegel 1981, American Scientist.
  return Math.round(fromTimeS * Math.pow(toDistanceM / fromDistanceM, 1.06));
}

export function vdotFromRace(distanceM: number, timeS: number): number {
  const candidates = RACE_VDOT.filter(([d]) => d === distanceM);
  let lookupTime = timeS;
  let lookupCandidates = candidates;

  if (candidates.length === 0) {
    const distances = [...new Set(RACE_VDOT.map(([d]) => d))];
    const nearestDist = distances.reduce((a, b) =>
      Math.abs(b - distanceM) < Math.abs(a - distanceM) ? b : a
    );
    lookupTime = riegelPredict(distanceM, timeS, nearestDist);
    lookupCandidates = RACE_VDOT.filter(([d]) => d === nearestDist);
  }

  // Sort descending by time (slower = lower VDOT)
  const sorted = [...lookupCandidates].sort((a, b) => b[1] - a[1]);

  for (let i = 0; i < sorted.length; i++) {
    const [, t, v] = sorted[i];
    if (lookupTime >= t) {
      if (i === 0) return v;
      const [, upperT, upperV] = sorted[i - 1];
      const [, lowerT, lowerV] = sorted[i];
      const frac = (lookupTime - lowerT) / (upperT - lowerT);
      return Math.round(lowerV + frac * (upperV - lowerV));
    }
  }
  return sorted[sorted.length - 1][2];
}

export function pacesFromVdot(vdot: number): Paces {
  const clamped = Math.max(30, Math.min(85, Math.round(vdot)));
  const row = VDOT_TABLE[clamped];
  return {
    E_low: row.E[0],
    E_high: row.E[1],
    M: row.M,
    T: row.T,
    I: row.I,
    R: row.R,
  };
}

export function tanakaHrmax(age: number): number {
  // Source: Tanaka H., JACC 37:153 (2001).
  return Math.round(208 - 0.7 * age);
}

export function hrZones(hrmax: number): HrZones {
  return {
    Z1: [Math.round(hrmax * 0.50), Math.round(hrmax * 0.60)],
    Z2: [Math.round(hrmax * 0.60), Math.round(hrmax * 0.70)],
    Z3: [Math.round(hrmax * 0.70), Math.round(hrmax * 0.80)],
    Z4: [Math.round(hrmax * 0.80), Math.round(hrmax * 0.90)],
    Z5: [Math.round(hrmax * 0.90), hrmax],
  };
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, "0")} /km`;
}
