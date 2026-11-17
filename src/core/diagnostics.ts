import type { QualityTier } from './quality';
import type { RegionId } from './world/regions';

export type TimeOfDay = 'day' | 'sunset' | 'night';

export interface DeviceDiagnosticsInfo {
  webViewVersion: string;
  deviceModel: string;
  platform: string;
}

export interface DiagnosticsSnapshot {
  appVersion: string;
  timestampIso: string;
  regionId: RegionId;
  qualityTier: QualityTier;
  timeOfDay: TimeOfDay;
  mode: 'on-foot' | 'driving';
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  activeTiles: number;
  activeBuildings: number;
  trafficCount: number;
  jsHeapUsedMb: number | null;
  jsHeapTotalMb: number | null;
  jsHeapLimitMb: number | null;
  gpuRenderer: string;
  gpuVendor: string;
  webViewVersion: string;
  deviceModel: string;
  platform: string;
  viewport: string;
  pixelRatio: number;
  touchUi: boolean;
  crashCount: number;
}

export function parseUserAgentInfo(userAgent: string, platform = ''): DeviceDiagnosticsInfo {
  const ua = userAgent || '';

  // Extract Chrome / Android System WebView version
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/i);
  const webViewTag = /; wv\)/i.test(ua) ? 'Android WebView' : 'Browser/Chromium';
  const webViewVersion = chromeMatch?.[1]
    ? `${webViewTag} ${chromeMatch[1]}`
    : ua.includes('Safari')
      ? 'WebKit/Safari'
      : 'Unknown';

  // Extract Android device model from standard UA "(Linux; Android 15; SM-A546E Build/...)"
  let deviceModel = 'Unknown';
  const androidMatch = ua.match(/Android\s+([\d.]+)(?:;\s*([^;)]+))?/i);
  if (androidMatch) {
    const osVer = androidMatch[1];
    const rawModel = (androidMatch[2] || 'Android Device').replace(/\s+Build\/.*$/i, '').trim();
    deviceModel = `${rawModel} (Android ${osVer})`;
  } else if (/Windows/i.test(ua)) {
    deviceModel = 'Windows Desktop';
  } else if (/Macintosh/i.test(ua)) {
    deviceModel = 'macOS Desktop';
  } else if (/Linux/i.test(ua)) {
    deviceModel = 'Linux Desktop/CI';
  }

  return {
    webViewVersion,
    deviceModel,
    platform: platform || (androidMatch ? 'Android' : 'Web'),
  };
}

export function formatDiagnosticsJson(snapshot: DiagnosticsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
