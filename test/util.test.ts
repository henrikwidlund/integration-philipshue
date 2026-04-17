import test from "ava";
import {
  brightnessToPercent,
  colorTempToMirek,
  convertHSVtoXY,
  convertXYtoHSV,
  getHubUrl,
  isValidHttpUrl,
  mirekToColorTemp,
  normalizeBridgeId,
  percentToBrightness,
  getLightFeatures,
  getGroupFeatures,
  getMostCommonGamut,
  getMinMaxMirek,
  delay,
  convertImageToBase64,
  i18all,
  isDeepEqual
} from "../src/util.js";
import { LightFeatures } from "@unfoldedcircle/integration-api";
import { CombinedGroupResource, LightResource } from "../src/lib/hue-api/types.js";
import fs from "fs";
import i18n from "i18n";

// --- Brightness & Percent ---

test("brightnessToPercent converts 0-255 to 1-100", (t) => {
  t.is(brightnessToPercent(0), 1);
  t.is(brightnessToPercent(255), 100);
  t.is(brightnessToPercent(127), 50);
  t.is(brightnessToPercent(128), 50);
});

test("brightnessToPercent handles invalid values", (t) => {
  t.is(brightnessToPercent(-1), 1);
  t.is(brightnessToPercent(256), 100);
  t.is(brightnessToPercent(NaN), 1);
  t.is(brightnessToPercent(Infinity), 100);
});

test("percentToBrightness converts 1-100 to 1-255", (t) => {
  t.is(percentToBrightness(0), 1);
  t.is(percentToBrightness(1), 3);
  t.is(percentToBrightness(50), 128);
  t.is(percentToBrightness(100), 255);
});

test("percentToBrightness handles invalid values", (t) => {
  t.is(percentToBrightness(-1), 1);
  t.is(percentToBrightness(101), 255);
  t.is(percentToBrightness(NaN), 1);
  t.is(percentToBrightness(Infinity), 255);
});

// --- Color Temperature & Mirek ---

test("mirekToColorTemp converts 153-500 to 0-100", (t) => {
  t.is(mirekToColorTemp(153, 153, 500), 0);
  t.is(mirekToColorTemp(500, 153, 500), 100);
  t.is(Math.round(mirekToColorTemp(326.5, 153, 500)), 50);
});

test("mirekToColorTemp with custom range", (t) => {
  t.is(mirekToColorTemp(200, 200, 400), 0);
  t.is(mirekToColorTemp(400, 200, 400), 100);
  t.is(mirekToColorTemp(300, 200, 400), 50);
});

test("mirekToColorTemp handles invalid values", (t) => {
  t.is(mirekToColorTemp(152, 153, 500), 0);
  t.is(mirekToColorTemp(501, 153, 500), 100);
  t.is(mirekToColorTemp(NaN, 153, 500), 0);
  t.is(mirekToColorTemp(Infinity, 153, 500), 100);
});

test("colorTempToMirek converts 0-100 to 153-500", (t) => {
  t.is(colorTempToMirek(0, 153, 500), 153);
  t.is(colorTempToMirek(100, 153, 500), 500);
  t.is(colorTempToMirek(50, 153, 500), 327);
});

test("colorTempToMirek with custom range", (t) => {
  t.is(colorTempToMirek(0, 200, 400), 200);
  t.is(colorTempToMirek(100, 200, 400), 400);
  t.is(colorTempToMirek(50, 200, 400), 300);
});

test("colorTempToMirek handles invalid values", (t) => {
  t.is(colorTempToMirek(-1, 153, 500), 153);
  t.is(colorTempToMirek(101, 153, 500), 500);
  t.is(colorTempToMirek(NaN, 153, 500), 153);
  t.is(colorTempToMirek(Infinity, 153, 500), 500);
});

// --- HSV & XY Conversions ---

test("convertXYtoHSV handles zero values", (t) => {
  // make sure y = 0 doesn't cause division by zero
  t.notThrows(() => convertXYtoHSV(0.4, 0));
  const result = convertXYtoHSV(0.4, 0);
  t.is(typeof result.hue, "number");
  t.is(typeof result.sat, "number");
});

test("convertXYtoHSV handles black/zero lightness", (t) => {
  // make sure lightness = 0 doesn't cause division by zero
  const result = convertXYtoHSV(0.4, 0.4, 0);
  t.is(result.hue, 0);
  t.is(result.sat, 0);
});

test("convertXYtoHSV and convertHSVtoXY round-trip (approximate)", (t) => {
  const x = 0.4;
  const y = 0.4;
  const hsv = convertXYtoHSV(x, y);
  const xy = convertHSVtoXY(hsv.hue, hsv.sat, 1);

  t.true(Math.abs(xy.x - x) < 0.1, `x: ${xy.x} vs ${x}`);
  t.true(Math.abs(xy.y - y) < 0.1, `y: ${xy.y} vs ${y}`);
});

test("convertHSVtoXY handles black (sum=0)", (t) => {
  const xy = convertHSVtoXY(0, 0, 0);
  t.is(xy.x, 0.3);
  t.is(xy.y, 0.3);
});

// Gamut triangle fixtures from Philips Hue developer docs:
// https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/
const GAMUT_A = {
  red: { x: 0.704, y: 0.296 },
  green: { x: 0.2151, y: 0.7106 },
  blue: { x: 0.138, y: 0.08 }
};
const GAMUT_C = {
  red: { x: 0.6915, y: 0.3038 },
  green: { x: 0.17, y: 0.7 },
  blue: { x: 0.1532, y: 0.0475 }
};

test("convertHSVtoXY with no gamut returns unclipped xy", (t) => {
  // 4th arg omitted → existing behavior (no clip).
  const xy = convertHSVtoXY(0, 255, 1);
  // Saturated red under the Wide-RGB-D65 + gamma-decode pipeline sits outside
  // every Hue gamut triangle (near ≈0.7007, 0.2993).
  t.true(xy.x > 0.69);
  t.true(xy.y < 0.31);
});

test("convertHSVtoXY matches Hue dev-docs algorithm for a canonical input", (t) => {
  // Canonical regression guard: hue=30°, sat=255, value=0.5.
  // Algorithm per https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/
  //
  // HSV(30, 255, 0.5) → sRGB(0.5, 0.25, 0) after the standard HSV→RGB sextant math.
  // sRGB gamma decode (> 0.04045 branch) using ((c + 0.055) / 1.055)^2.4:
  //   r_lin = (0.555/1.055)^2.4 ≈ 0.21404
  //   g_lin = (0.305/1.055)^2.4 ≈ 0.05086
  //   b_lin = 0
  // Philips "Wide RGB D65" matrix:
  //   X = 0.21404·0.664511 + 0.05086·0.154324 + 0·0.162028 ≈ 0.15007
  //   Y = 0.21404·0.283881 + 0.05086·0.668433 + 0·0.047685 ≈ 0.09476
  //   Z = 0.21404·0.000088 + 0.05086·0.072310 + 0·0.986039 ≈ 0.00370
  // Normalize: x ≈ 0.6038, y ≈ 0.3813.
  // Tolerance ±0.005 catches partial reverts (gamma right / matrix wrong, or vice versa).
  const xy = convertHSVtoXY(30, 255, 0.5);
  t.true(Math.abs(xy.x - 0.6038) < 0.005, `x: ${xy.x} vs expected ≈0.6038`);
  t.true(Math.abs(xy.y - 0.3813) < 0.005, `y: ${xy.y} vs expected ≈0.3813`);
});

test("convertHSVtoXY in-gamut input passes through unchanged on Gamut C", (t) => {
  // HSV(0, 128, 1): a half-saturated red. Its xy sits well inside the Gamut C
  // triangle (≈0.525, 0.313), so clipping must be a no-op.
  const unclipped = convertHSVtoXY(0, 128, 1);
  const clipped = convertHSVtoXY(0, 128, 1, GAMUT_C);
  t.true(Math.abs(clipped.x - unclipped.x) < 1e-9);
  t.true(Math.abs(clipped.y - unclipped.y) < 1e-9);
});

test("convertHSVtoXY clips saturated red onto Gamut C red vertex", (t) => {
  // Fully saturated red (≈0.7007, 0.2993) lies just outside Gamut C's red vertex
  // (0.6915, 0.3038); it should clip to at or very near the red corner.
  const xy = convertHSVtoXY(0, 255, 1, GAMUT_C);
  t.true(Math.abs(xy.x - GAMUT_C.red.x) < 0.01, `x: ${xy.x} vs ${GAMUT_C.red.x}`);
  t.true(Math.abs(xy.y - GAMUT_C.red.y) < 0.01, `y: ${xy.y} vs ${GAMUT_C.red.y}`);
});

test("convertHSVtoXY clips saturated red onto Gamut A red vertex", (t) => {
  // Gamut A is the tightest Hue triangle. Saturated red still sits outside its
  // red vertex (0.704, 0.296); clipping must land at or very near the corner.
  const xy = convertHSVtoXY(0, 255, 1, GAMUT_A);
  t.true(Math.abs(xy.x - GAMUT_A.red.x) < 0.01, `x: ${xy.x} vs ${GAMUT_A.red.x}`);
  t.true(Math.abs(xy.y - GAMUT_A.red.y) < 0.01, `y: ${xy.y} vs ${GAMUT_A.red.y}`);
});

test("convertHSVtoXY clips an outside-RG-edge point onto segment R-G (Gamut C)", (t) => {
  // HSV(80, 255, 1) under the new pipeline lands outside Gamut C's red-green edge
  // (far yellow-green region). After clipping, the result must lie ON segment R-G:
  // barycentric s ∈ [0,1] with t ≈ 0 in the (R + s·(G−R) + t·(B−R)) basis.
  const xy = convertHSVtoXY(80, 255, 1, GAMUT_C);
  const { red: r, green: g, blue: b } = GAMUT_C;
  const v1x = g.x - r.x,
    v1y = g.y - r.y;
  const v2x = b.x - r.x,
    v2y = b.y - r.y;
  const qx = xy.x - r.x,
    qy = xy.y - r.y;
  const v = v1x * v2y - v1y * v2x;
  const s = (qx * v2y - qy * v2x) / v;
  const tCoord = (v1x * qy - v1y * qx) / v;
  t.true(s >= -1e-6 && s <= 1 + 1e-6, `s: ${s}`);
  t.true(Math.abs(tCoord) < 1e-6, `t: ${tCoord}`);
});

test("convertHSVtoXY falls back to (0.3, 0.3) on a degenerate gamut triangle", (t) => {
  const degenerate = {
    red: { x: 0.3, y: 0.3 },
    green: { x: 0.4, y: 0.4 },
    blue: { x: 0.5, y: 0.5 }
  };
  const xy = convertHSVtoXY(0, 255, 1, degenerate);
  t.is(xy.x, 0.3);
  t.is(xy.y, 0.3);
});

test("convertXYtoHSV handles different sectors", (t) => {
  // Use known primary/secondary colors in RGB
  // We'll use the reverse conversion to get XY values that should map to these

  // Red (H=0, S=255, V=1) -> XY
  const xyRed = convertHSVtoXY(0, 255, 1);
  const hsvRed = convertXYtoHSV(xyRed.x, xyRed.y);
  t.true(hsvRed.hue === 0 || hsvRed.hue === 359 || hsvRed.hue === 360);
  t.is(hsvRed.sat, 255);

  // Green (H=120, S=255, V=1) -> XY
  const xyGreen = convertHSVtoXY(120, 255, 1);
  const hsvGreen = convertXYtoHSV(xyGreen.x, xyGreen.y);
  t.is(hsvGreen.hue, 120);
  t.is(hsvGreen.sat, 255);

  // Blue (H=240, S=255, V=1) -> XY
  const xyBlue = convertHSVtoXY(240, 255, 1);
  const hsvBlue = convertXYtoHSV(xyBlue.x, xyBlue.y);
  t.is(hsvBlue.hue, 240);
  t.is(hsvBlue.sat, 255);

  // Yellow (H=60, S=255, V=1) -> XY
  const xyYellow = convertHSVtoXY(60, 255, 1);
  const hsvYellow = convertXYtoHSV(xyYellow.x, xyYellow.y);
  t.is(hsvYellow.hue, 60);

  // Cyan (H=180, S=255, V=1) -> XY
  const xyCyan = convertHSVtoXY(180, 255, 1);
  const hsvCyan = convertXYtoHSV(xyCyan.x, xyCyan.y);
  t.is(hsvCyan.hue, 180);

  // Magenta (H=300, S=255, V=1) -> XY
  const xyMagenta = convertHSVtoXY(300, 255, 1);
  const hsvMagenta = convertXYtoHSV(xyMagenta.x, xyMagenta.y);
  t.is(hsvMagenta.hue, 300);
});

test("convertXYtoHSV handles min max boundary values", (t) => {
  // x, y are usually between 0 and 1
  const hsv11 = convertXYtoHSV(1, 1);
  t.is(typeof hsv11.hue, "number");
  t.is(hsv11.sat, 255);

  const hsv01 = convertXYtoHSV(0, 1);
  t.is(typeof hsv01.hue, "number");
  t.is(hsv01.sat, 255);

  t.deepEqual(convertXYtoHSV(1, 0), { hue: 0, sat: 0 });
});

// --- Hub URL & Validation ---

test("isValidHttpUrl validates URLs", (t) => {
  t.true(isValidHttpUrl("http://192.168.1.1"));
  t.true(isValidHttpUrl("https://hue-bridge.local"));
  t.false(isValidHttpUrl("not-a-url"));
  t.false(isValidHttpUrl("ftp://192.168.1.1"));
});

test("getHubUrl formats IP/hostname to HTTPS URL", (t) => {
  t.is(getHubUrl("192.168.1.1"), "https://192.168.1.1");
  t.is(getHubUrl("HUE-BRIDGE"), "https://hue-bridge");
  t.is(getHubUrl("http://192.168.1.1"), "https://192.168.1.1");
  t.is(getHubUrl("https://192.168.1.1/api"), "https://192.168.1.1");
});

test("getHubUrl throws on invalid input", (t) => {
  // The current implementation is very lenient because URL constructor can handle many things
  // But something completely broken should still fail if it's not a valid URL
  // Actually, getHubUrl prepends https://, so "!!!" becomes "https://!!!" which URL() might accept in some environments
  // Let's find something that truly fails isValidHttpUrl
  t.throws(() => getHubUrl("   "));
});

// --- Normalize Bridge ID ---

test("normalizeBridgeId handles various formats", (t) => {
  // Zeroconf format
  t.is(normalizeBridgeId("00:11:22:33:44:55"), "001122334455");
  // nupnp format
  t.is(normalizeBridgeId("001122fffe334455"), "001122334455");
  // Standard format
  t.is(normalizeBridgeId("001122334455"), "001122334455");
  // Unexpected format (returns as is, lowercased)
  t.is(normalizeBridgeId("SHORT"), "short");
});

// --- Light & Group Features ---

test("getLightFeatures detects features", (t) => {
  const light = {
    on: { on: true },
    dimming: { brightness: 100 },
    color_temperature: { mirek_schema: { mirek_minimum: 153, mirek_maximum: 500 } },
    color: { xy: { x: 0.1, y: 0.1 } }
  } as unknown as LightResource;
  const features = getLightFeatures(light);
  t.true(features.includes(LightFeatures.OnOff));
  t.true(features.includes(LightFeatures.Dim));
  t.true(features.includes(LightFeatures.ColorTemperature));
  t.true(features.includes(LightFeatures.Color));

  const basicLight = { on: { on: true } } as unknown as LightResource;
  const basicFeatures = getLightFeatures(basicLight);
  t.deepEqual(basicFeatures, [LightFeatures.OnOff, LightFeatures.Toggle]);
});

test("getGroupFeatures detects features from lights and grouped_lights", (t) => {
  const group = {
    lights: [{ dimming: {} }, { color_temperature: { mirek_schema: {} } }],
    grouped_lights: [{ color: { xy: {} } }]
  } as unknown as CombinedGroupResource;
  const features = getGroupFeatures(group);
  t.true(features.includes(LightFeatures.OnOff));
  t.true(features.includes(LightFeatures.Dim));
  t.true(features.includes(LightFeatures.ColorTemperature));
  t.true(features.includes(LightFeatures.Color));
});

// --- Gamut & Mirek range ---

test("getMostCommonGamut returns most frequent gamut", (t) => {
  const group = {
    lights: [{ color: { gamut_type: "A" } }, { color: { gamut_type: "B" } }, { color: { gamut_type: "B" } }]
  } as unknown as CombinedGroupResource;
  t.is(getMostCommonGamut(group), "B");
});

test("getMostCommonGamut returns undefined if no gamut", (t) => {
  const group = {
    lights: [{}]
  } as unknown as CombinedGroupResource;
  t.is(getMostCommonGamut(group), undefined);
});

test("getMinMaxMirek returns min/max from all lights", (t) => {
  const group = {
    lights: [
      { color_temperature: { mirek_schema: { mirek_minimum: 150, mirek_maximum: 300 } } },
      { color_temperature: { mirek_schema: { mirek_minimum: 200, mirek_maximum: 500 } } }
    ]
  } as unknown as CombinedGroupResource;
  const range = getMinMaxMirek(group);
  t.is(range?.mirek_minimum, 150);
  t.is(range?.mirek_maximum, 500);
});

// --- Utilities ---

test("delay waits for specified time", async (t) => {
  const start = Date.now();
  await delay(100);
  const duration = Date.now() - start;
  t.true(duration >= 90); // Allow some jitter
});

test("convertImageToBase64 reads file as base64", (t) => {
  const mockFile = "test-image.txt";
  const content = "Hello World";
  fs.writeFileSync(mockFile, content);

  try {
    const base64 = convertImageToBase64(mockFile);
    t.is(base64, Buffer.from(content).toString("base64"));
  } finally {
    fs.unlinkSync(mockFile);
  }
});

test("convertImageToBase64 returns undefined on error", (t) => {
  const base64 = convertImageToBase64("non-existent-file.jpg");
  t.is(base64, undefined);
});

// --- i18n ---

test("i18all returns translations", (t) => {
  const originalH = i18n.__h;
  // Mock i18n.__h
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  i18n.__h = (key: string): any => {
    if (key === "test_key") {
      return [{ en: "Test" }, { de: "Test DE" }, { fr: "test_key" }];
    }
    return [];
  };

  try {
    const result = i18all("test_key");
    t.is(result.en, "Test");
    t.is(result.de, "Test DE");
    t.false("fr" in result); // Skipped because untranslated

    const emptyResult = i18all("unknown");
    t.is(emptyResult.en, "unknown");
  } finally {
    i18n.__h = originalH;
  }
});

// --- isDeepEqual ---

test("isDeepEqual compares primitives", (t) => {
  t.true(isDeepEqual(1, 1));
  t.true(isDeepEqual("a", "a"));
  t.true(isDeepEqual(true, true));
  t.true(isDeepEqual(null, null));
  t.true(isDeepEqual(undefined, undefined));
  t.true(isDeepEqual(NaN, NaN));

  t.false(isDeepEqual(1, 2));
  t.false(isDeepEqual("a", "b"));
  t.false(isDeepEqual(true, false));
  t.false(isDeepEqual(null, undefined));
});

test("isDeepEqual compares objects", (t) => {
  t.true(isDeepEqual({ a: 1 }, { a: 1 }));
  t.true(isDeepEqual({ a: { b: 2 } }, { a: { b: 2 } }));
  t.false(isDeepEqual({ a: 1 }, { a: 2 }));
  t.false(isDeepEqual({ a: 1 }, { b: 1 }));
  t.false(isDeepEqual({ a: 1 }, { a: 1, b: 2 }));
});

test("isDeepEqual compares arrays", (t) => {
  t.true(isDeepEqual([1, 2], [1, 2]));
  t.true(isDeepEqual([{ a: 1 }], [{ a: 1 }]));
  t.false(isDeepEqual([1, 2], [1, 3]));
  t.false(isDeepEqual([1, 2], [1, 2, 3]));
});

test("isDeepEqual compares complex objects", (t) => {
  const obj1 = {
    name: "Light 1",
    features: [1, 2],
    mirek_schema: { min: 153, max: 500 }
  };
  const obj2 = {
    name: "Light 1",
    features: [1, 2],
    mirek_schema: { min: 153, max: 500 }
  };
  const obj3 = {
    name: "Light 1",
    features: [1, 3],
    mirek_schema: { min: 153, max: 500 }
  };

  t.true(isDeepEqual(obj1, obj2));
  t.false(isDeepEqual(obj1, obj3));
});

test("isDeepEqual handles undefined as non-existing", (t) => {
  t.true(isDeepEqual({ a: 1 }, { a: 1, b: undefined }));
  t.true(isDeepEqual({ a: 1, b: undefined }, { a: 1 }));
  t.true(isDeepEqual({ a: 1, b: undefined }, { a: 1, c: undefined }));
  t.false(isDeepEqual({ a: 1 }, { a: 1, b: null }));
});
