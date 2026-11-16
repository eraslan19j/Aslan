import type { LocaleCode } from '../core/save';

export interface UiStrings {
  appTitle: string;
  milestoneTag: string;
  fpsLabel: string;
  drawsLabel: string;
  trisLabel: string;
  tilesLabel: string;
  buildingsLabel: string;
  physicsReady: string;
  physicsLoading: string;
  qualityNormal: string;
  qualityLite: string;
  pauseButton: string;
  aboutButton: string;
  langButton: string;
  sprintButton: string;
  pausedTitle: string;
  resumeButton: string;
  resetPosButton: string;
  fastTravelHeading: string;
  viewCrashLogButton: string;
  closeButton: string;
  aboutTitle: string;
  aboutSubtitle: string;
  aboutDataHeading: string;
  aboutOriginalityNote: string;
  aboutPrivacyLink: string;
  crashTitle: string;
  crashBody: string;
  crashCopyButton: string;
  crashCopied: string;
  crashReloadButton: string;
  crashLogEmpty: string;
  recoveredSaveToast: string;
  controlsHintDesktop: string;
  controlsHintTouch: string;
  sanctuaryBanner: string;
}

const STRINGS: Record<LocaleCode, UiStrings> = {
  tr: {
    appTitle: 'ISTANBUL STREETS',
    milestoneTag: 'M1 Dünya · Fatih (Sultanahmet–Eminönü) · v0.1',
    fpsLabel: 'FPS',
    drawsLabel: 'Çizim',
    trisLabel: 'Üçgen',
    tilesLabel: 'Karo',
    buildingsLabel: 'Bina',
    physicsReady: 'Rapier3D Hazır',
    physicsLoading: 'Fizik…',
    qualityNormal: 'Normal',
    qualityLite: 'Lite Modu',
    pauseButton: 'Duraklat',
    aboutButton: 'Hakkında',
    langButton: 'TR / EN',
    sprintButton: 'KOŞ',
    pausedTitle: 'Oyun Duraklatıldı',
    resumeButton: 'Devam Et',
    resetPosButton: 'Sultanahmet Meydanı',
    fastTravelHeading: 'Bölge Noktaları (Hızlı Keşif)',
    viewCrashLogButton: 'Kilitlenme Günlüğü',
    closeButton: 'Kapat',
    aboutTitle: 'Hakkında ve Açık Veri Atıfları',
    aboutSubtitle:
      'Istanbul Streets — Gerçek Fatih (Sultanahmet–Eminönü) açık verisiyle çevrimdışı çalışan %100 orijinal açık dünya oyunu (v0.1.0-m1).',
    aboutDataHeading: 'Kullanılan Harita ve Açık Veri Atıfları',
    aboutOriginalityNote:
      'Tüm karakterler, markalar ve kurumlar kurgusaldır. Ayasofya ve Sultanahmet Camii çevresi şiddetsiz güvenli alan olarak kilitlidir.',
    aboutPrivacyLink: 'Gizlilik Politikası (KVKK / GDPR)',
    crashTitle: 'Beklenmedik Bir Hata Oluştu',
    crashBody:
      'Oyun güvenli bir şekilde durduruldu. Kaydınız korunmuştur ve hata yerel kilitlenme günlüğüne kaydedildi.',
    crashCopyButton: 'Hata Günlüğünü Kopyala',
    crashCopied: 'Kopyalandı',
    crashReloadButton: 'Oyunu Yeniden Başlat',
    crashLogEmpty: 'Henüz kayıtlı kilitlenme yok.',
    recoveredSaveToast: 'Kayıt yedeği başarıyla kurtarıldı.',
    controlsHintDesktop: 'WASD: Yürü · Shift: Koş · Q/E veya Sürükle: Kamera · Esc: Duraklat',
    controlsHintTouch: 'Sol kol: Yürü · Sağ sürükle: Kamera · KOŞ: Hızlı koş · Geri: Duraklat',
    sanctuaryBanner: 'GÜVENLİ ALAN — Şiddet & Silah Kilitli',
  },
  en: {
    appTitle: 'ISTANBUL STREETS',
    milestoneTag: 'M1 World · Fatih (Sultanahmet–Eminönü) · v0.1',
    fpsLabel: 'FPS',
    drawsLabel: 'Draws',
    trisLabel: 'Tris',
    tilesLabel: 'Tiles',
    buildingsLabel: 'Bldgs',
    physicsReady: 'Rapier3D Ready',
    physicsLoading: 'Physics…',
    qualityNormal: 'Normal',
    qualityLite: 'Lite Mode',
    pauseButton: 'Pause',
    aboutButton: 'About',
    langButton: 'EN / TR',
    sprintButton: 'SPRINT',
    pausedTitle: 'Game Paused',
    resumeButton: 'Resume',
    resetPosButton: 'Sultanahmet Square',
    fastTravelHeading: 'Region Landmarks (Quick Explore)',
    viewCrashLogButton: 'Crash Log',
    closeButton: 'Close',
    aboutTitle: 'About & Open Data Attributions',
    aboutSubtitle:
      'Istanbul Streets — 100% original offline open-world game built from real Fatih (Sultanahmet–Eminönü) open geospatial data (v0.1.0-m1).',
    aboutDataHeading: 'Map & Open Data Attributions',
    aboutOriginalityNote:
      'All characters, brands, and agencies are fictional. Hagia Sophia and Blue Mosque precincts are strict non-violent safe zones.',
    aboutPrivacyLink: 'Privacy Policy (KVKK / GDPR)',
    crashTitle: 'An Unexpected Error Occurred',
    crashBody:
      'The game stopped safely. Your save file is intact and details were recorded in the local crash log.',
    crashCopyButton: 'Copy Crash Log',
    crashCopied: 'Copied',
    crashReloadButton: 'Restart Game',
    crashLogEmpty: 'No crash records yet.',
    recoveredSaveToast: 'Save file recovered from backup.',
    controlsHintDesktop: 'WASD: Walk · Shift: Sprint · Q/E or Drag: Camera · Esc: Pause',
    controlsHintTouch: 'Left stick: Walk · Drag right: Camera · SPRINT: Run · Back: Pause',
    sanctuaryBanner: 'SAFE ZONE — Sanctuary Precinct (No Combat)',
  },
};

export function getStrings(locale: LocaleCode): UiStrings {
  return STRINGS[locale];
}
