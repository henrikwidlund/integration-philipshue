/**
 * Utility functions.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import { LightFeatures } from "@unfoldedcircle/integration-api";
import fs from "fs";
import { CombinedGroupResource, GamutTriangle, GamutType, GroupType, LightResource } from "./lib/hue-api/types.js";
import i18n from "i18n";
import log from "./log.js";
import Config, { GroupConfig, LightConfig } from "./config.js";

export function convertImageToBase64(file: string) {
  let data;

  try {
    data = fs.readFileSync(file, "base64");
  } catch (e: unknown) {
    log.error("Failed to read image file %s: %s", file, e instanceof Error ? e.message : e);
  }
  return data;
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function addAvailableLights(lights: LightResource[], config: Config) {
  lights.forEach((light) => {
    if (config.getLight(light.id)) {
      log.info("Light with id %s already exists in config, skipping", light.id);
      return;
    }
    const features = getLightFeatures(light);
    config.addLight(light.id, {
      id_v1: light.id_v1,
      name: light.metadata.name,
      features,
      gamut_type: light.color?.gamut_type,
      gamut: light.color?.gamut,
      mirek_schema: light.color_temperature?.mirek_schema
    } as LightConfig);
  });
}

export function addAvailableGroups(groups: CombinedGroupResource[], groupType: GroupType, config: Config) {
  groups.forEach((group) => {
    if (config.getLight(group.id)) {
      log.info("Group with id %s already exists in config, skipping", group.id);
      return;
    }
    const features = getGroupFeatures(group);
    config.addLight(group.id, {
      name: group.metadata.name,
      features,
      groupedLightIds: group.grouped_lights.map((gl) => gl.id),
      childLightIds: group.lights.map((light) => light.id),
      groupType,
      gamut_type: getMostCommonGamut(group),
      gamut: getRepresentativeGamutTriangle(group),
      mirek_schema: getMinMaxMirek(group)
    } as GroupConfig);
  });
}

export function getLightFeatures(light: LightResource): LightFeatures[] {
  const features: LightFeatures[] = [LightFeatures.OnOff, LightFeatures.Toggle];
  if (light.dimming) {
    features.push(LightFeatures.Dim);
  }
  if (light.color_temperature?.mirek_schema) {
    features.push(LightFeatures.ColorTemperature);
  }
  if (light.color?.xy) {
    features.push(LightFeatures.Color);
  }
  return features;
}

export function getGroupFeatures(group: CombinedGroupResource): LightFeatures[] {
  const features: LightFeatures[] = [LightFeatures.OnOff, LightFeatures.Toggle];
  let hasDim = false;
  let hasColorTemperature = false;
  let hasColor = false;

  for (const groupLight of group.grouped_lights) {
    if (!hasDim && groupLight.dimming) {
      hasDim = true;
    }
    if (!hasColorTemperature && groupLight.color_temperature?.mirek_schema) {
      hasColorTemperature = true;
    }
    if (!hasColor && groupLight.color?.xy) {
      hasColor = true;
    }
    if (hasDim && hasColorTemperature && hasColor) {
      break;
    }
  }

  if (!(hasDim && hasColorTemperature && hasColor)) {
    for (const childLight of group.lights) {
      if (!hasDim && childLight.dimming) {
        hasDim = true;
      }
      if (!hasColorTemperature && childLight.color_temperature?.mirek_schema) {
        hasColorTemperature = true;
      }
      if (!hasColor && childLight.color?.xy) {
        hasColor = true;
      }
      if (hasDim && hasColorTemperature && hasColor) {
        break;
      }
    }
  }
  if (hasDim) {
    features.push(LightFeatures.Dim);
  }
  if (hasColorTemperature) {
    features.push(LightFeatures.ColorTemperature);
  }
  if (hasColor) {
    features.push(LightFeatures.Color);
  }

  return features;
}

export function getMostCommonGamut(group: CombinedGroupResource): GamutType | undefined {
  const gamutTypes = group.lights
    .map((light) => light.color?.gamut_type)
    .filter((gamut): gamut is GamutType => gamut !== undefined);

  if (!gamutTypes) return undefined;

  const gamutCounts = gamutTypes.reduce(
    (acc, gamut) => {
      acc[gamut] = (acc[gamut] || 0) + 1;
      return acc;
    },
    {} as Record<GamutType, number>
  );
  return Object.entries(gamutCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as GamutType | undefined;
}

/**
 * Pick a representative gamut triangle for a mixed group by choosing the triangle
 * from a bulb whose gamut_type matches the most-common one in the group.
 *
 * A true per-group triangle intersection would be an irregular polygon; same-generation
 * bulbs report near-identical triangles so the representative-bulb approach is an
 * acceptable substitute.
 */
export function getRepresentativeGamutTriangle(group: CombinedGroupResource): GamutTriangle | undefined {
  const mostCommon = getMostCommonGamut(group);
  if (!mostCommon) return undefined;
  return group.lights.find((l) => l.color?.gamut_type === mostCommon)?.color?.gamut;
}

export function getMinMaxMirek(
  group: CombinedGroupResource
): { mirek_minimum: number; mirek_maximum: number } | undefined {
  const mirekSchemas = group.lights
    .map((light) => light.color_temperature?.mirek_schema)
    .filter((schema): schema is { mirek_minimum: number; mirek_maximum: number } => schema !== undefined);
  return mirekSchemas.length > 0
    ? {
        mirek_minimum: Math.min(...mirekSchemas.map((s) => s.mirek_minimum)),
        mirek_maximum: Math.max(...mirekSchemas.map((s) => s.mirek_maximum))
      }
    : undefined;
}

export function convertXYtoHSV(x: number, y: number, lightness = 1) {
  if (y === 0 || lightness <= 0) {
    return { hue: 0, sat: 0 };
  }
  const Y = lightness;
  const X = (x / y) * Y;
  const Z = ((1 - x - y) / y) * Y;

  // Inverse of Philips's "Wide RGB D65" matrix (per Hue developer docs).
  // Symmetric with the matrix used in convertHSVtoXY.
  let R = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let G = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let B = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

  // Clamp negatives: xy outside the Hue gamut can produce negative linear RGB.
  R = Math.max(0, R);
  G = Math.max(0, G);
  B = Math.max(0, B);

  // Normalize so max channel = 1 before gamma encode (HSV hue/sat are
  // scale-invariant, so throwing away brightness here is fine).
  const maxLin = Math.max(R, G, B);
  if (maxLin <= 0) {
    return { hue: 0, sat: 0 };
  }
  R /= maxLin;
  G /= maxLin;
  B /= maxLin;

  // sRGB gamma encode (linear → gamma-encoded sRGB). Symmetric with the
  // decode step in convertHSVtoXY; required so round-tripping a color through
  // HSV → xy → HSV preserves hue exactly.
  R = R > 0.0031308 ? 1.055 * Math.pow(R, 1 / 2.4) - 0.055 : 12.92 * R;
  G = G > 0.0031308 ? 1.055 * Math.pow(G, 1 / 2.4) - 0.055 : 12.92 * G;
  B = B > 0.0031308 ? 1.055 * Math.pow(B, 1 / 2.4) - 0.055 : 12.92 * B;

  const V = Math.max(R, G, B);
  if (V <= 0) {
    return { hue: 0, sat: 0 };
  }

  const minRGB = Math.min(R, G, B);
  const S = (V - minRGB) / V;

  let H = 0;
  if (V === minRGB) {
    H = 0;
  } else if (V === R && G >= B) {
    H = 60 * ((G - B) / (V - minRGB));
  } else if (V === R && G < B) {
    H = 60 * ((G - B) / (V - minRGB)) + 360;
  } else if (V === G) {
    H = 60 * ((B - R) / (V - minRGB)) + 120;
  } else if (V === B) {
    H = 60 * ((R - G) / (V - minRGB)) + 240;
  }

  const ScaledS = Math.round(S * 255);

  return {
    hue: Math.round(H) % 360,
    sat: Math.max(0, Math.min(ScaledS, 255))
  };
}

type XY = { x: number; y: number };

function closestPointOnSegment(p: XY, a: XY, b: XY): XY {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom === 0) return { x: a.x, y: a.y };
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

function clipToGamut(p: XY, gamut: GamutTriangle): XY {
  const { red: r, green: g, blue: b } = gamut;
  // Barycentric containment test.
  const v1x = g.x - r.x;
  const v1y = g.y - r.y;
  const v2x = b.x - r.x;
  const v2y = b.y - r.y;
  const qx = p.x - r.x;
  const qy = p.y - r.y;
  const v = v1x * v2y - v1y * v2x;
  // Degenerate triangle: fall back to the same default convertHSVtoXY uses when XYZ
  // sums to 0, so the bridge always receives a valid chromaticity.
  if (v === 0) return { x: 0.3, y: 0.3 };
  const s = (qx * v2y - qy * v2x) / v;
  const t = (v1x * qy - v1y * qx) / v;
  if (s >= 0 && t >= 0 && s + t <= 1) return p;

  // Project onto each edge and return the nearest clamp point.
  const pRG = closestPointOnSegment(p, r, g);
  const pGB = closestPointOnSegment(p, g, b);
  const pBR = closestPointOnSegment(p, b, r);
  const dist2 = (a1: XY, b1: XY) => (a1.x - b1.x) * (a1.x - b1.x) + (a1.y - b1.y) * (a1.y - b1.y);
  const dRG = dist2(p, pRG);
  const dGB = dist2(p, pGB);
  const dBR = dist2(p, pBR);
  if (dRG <= dGB && dRG <= dBR) return pRG;
  if (dGB <= dBR) return pGB;
  return pBR;
}

/**
 * Convert HSV (remote color-wheel input) to CIE 1931 xy chromaticity for the Hue bridge.
 *
 * Follows the canonical conversion from the Philips Hue developer docs:
 * https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/
 *
 * If a gamut triangle is supplied, the result is clipped onto that triangle so
 * edge-of-gamut selections render consistently across bulb models.
 */
export function convertHSVtoXY(hue: number, saturation: number, value: number, gamut?: GamutTriangle): XY {
  const h = hue / 60;
  const s = saturation / 255;
  const v = value;

  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;

  let r, g, b;
  if (h >= 0 && h < 1) {
    [r, g, b] = [c, x, 0];
  } else if (h < 2) {
    [r, g, b] = [x, c, 0];
  } else if (h < 3) {
    [r, g, b] = [0, c, x];
  } else if (h < 4) {
    [r, g, b] = [0, x, c];
  } else if (h < 5) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  [r, g, b] = [r + m, g + m, b + m];

  // sRGB gamma decode to linear-light values (per Philips Hue developer docs).
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Philips "Wide RGB D65" matrix (distinct from the standard sRGB→XYZ matrix;
  // tuned for the Hue gamut).
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;

  const sum = X + Y + Z;
  const xy: XY = sum === 0 ? { x: 0.3, y: 0.3 } : { x: X / sum, y: Y / sum };
  return gamut ? clipToGamut(xy, gamut) : xy;
}

export function getHubUrl(ip: string): string {
  // best effort: even though the parameter should only be an IP or hostname, we try to parse URL's
  // Note: the `URL` class isn't a very good validator!
  const address =
    "https://" +
    ip
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "");

  if (!isValidHttpUrl(address)) {
    throw new Error("Invalid hub URL: " + address);
  }

  const url = new URL(address);
  return url.protocol + "//" + url.host;
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const newUrl = new URL(url);
    return newUrl.protocol === "http:" || newUrl.protocol === "https:";
  } catch {
    return false;
  }
}

export function mirekToColorTemp(colorTemp: number, minMirek: number, maxMirek: number) {
  if (isNaN(colorTemp) || colorTemp <= minMirek) {
    return 0;
  }
  if (colorTemp >= maxMirek) {
    return 100;
  }
  const range = maxMirek - minMirek;
  return ((colorTemp - minMirek) / range) * 100;
}

export function colorTempToMirek(colorTemp: number, minMirek: number, maxMirek: number) {
  if (isNaN(colorTemp) || colorTemp <= 0) {
    return minMirek;
  }
  if (colorTemp >= 100) {
    return maxMirek;
  }
  const range = maxMirek - minMirek;
  return Math.round((colorTemp / 100) * range + minMirek);
}

/**
 * Convert a brightness value to a percentage
 * @param brightness - 0 - 255
 * @returns The brightness value as a percentage (1-100)
 */
export function brightnessToPercent(brightness: number) {
  if (isNaN(brightness) || brightness <= 0) {
    return 1;
  }
  if (brightness >= 255) {
    return 100;
  }
  return Math.max(1, Math.round((brightness / 255) * 100));
}

export function percentToBrightness(percent: number) {
  if (isNaN(percent) || percent <= 0) {
    return 1;
  }
  if (percent >= 100) {
    return 255;
  }
  return Math.max(1, Math.round((percent / 100) * 255));
}

/**
 * Normalize a bridge ID.
 *
 * Logic from aiohue library.
 *
 * @param bridgeId The bridge ID to normalize.
 * @returns The normalized bridge ID.
 */
export function normalizeBridgeId(bridgeId: string): string {
  const id = bridgeId.toLowerCase();

  // zeroconf: properties['id'], field contains semicolons after each 2 char
  if (id.length === 17 && (id.match(/:/g) || []).length === 5) {
    return id.replace(/:/g, "");
  }

  // nupnp: contains 4 extra characters in the middle: "fffe"
  if (id.length === 16 && id.substring(6, 10) === "fffe") {
    return id.substring(0, 6) + id.substring(10);
  }

  // SSDP/UPNP and Hue Bridge API contains right ID.
  if (id.length === 12) {
    return id;
  }

  log.warn("Received unexpected bridge id: %s", bridgeId);

  return id;
}

/**
 * Returns an object of translations for a given phrase in each language.
 *
 * - The `i18n.__h` hashed list of translations is converted to an object with key values.
 *   - __h result for a given key: `[{en: "foo"},{de: "bar"}]`
 *   - Output: `{en: "foo", de: "bar"}`
 * - If a translation text is the same as the key, it is considered "untranslated" and skipped in the output.
 *   - __h result for given key `key42`: `[{en: "foo"},{de: "key42"},{fr: "key42"}]`
 *   - Output: `{en: "foo"}`
 * - If there are no translations, the english key is returned as value.
 *   - __h result for a given key: `[]`
 *   - Output: `{en: "${key}"}`
 *
 * @param key translation key
 * @return object containing translations for each language
 */
export function i18all(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  i18n.__h(key).forEach((item) => {
    const lang = Object.keys(item)[0];
    // skip untranslated keys
    if (key !== item[lang]) {
      out[lang] = item[lang];
    }
  });
  if (Object.keys(out).length === 0) {
    out.en = key;
  }
  return out;
}

/**
 * Performs a deep comparison between two values to determine if they are equivalent.
 *
 * Object fields set to `undefined` are ignored.
 *
 * @param a The first value to compare.
 * @param b The second value to compare.
 * @returns True if the values are equivalent, false otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDeepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }

  if (a && b && typeof a === "object" && typeof b === "object") {
    if (a.constructor !== b.constructor) {
      return false;
    }

    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!isDeepEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }

    const keysA = Object.keys(a).filter((k) => a[k] !== undefined);
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined);

    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      if (!keysB.includes(key)) {
        return false;
      }
      if (!isDeepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  return a !== a && b !== b;
}
