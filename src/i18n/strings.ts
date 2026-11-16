import type { LocaleCode } from '../core/save';

export interface UiStrings {
  appTitle: string;
  milestoneTag: string;
  fpsLabel: string;
  drawsLabel: string;
  trisLabel: string;
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
    milestoneTag: 'M0 İskelet · v0.0.1',
    fpsLabel: 'FPS',
    drawsLabel: 'Çizim',
    trisLabel: 'Üçgen',
    physicsReady: 'Rapier3D Hazır',
    physicsLoading: 'Fizik Yükleniyor…',
    qualityNormal: 'Normal',
    qualityLite: 'Lite Modu',
    pauseButton: 'Duraklat',
    aboutButton: 'Hakkında',
    langButton: 'TR / EN',
    sprintButton: 'KOŞ',
    pausedTitle: 'Oyun Duraklatıldı',
    resumeButton: 'Devam Et',
    resetPosButton: 'Konumu Sıfırla',
    viewCrashLogButton: 'Kilitlenme Günlüğü',
    closeButton: 'Kapat',
    aboutTitle: 'Hakkında ve Atıflar',
    aboutSubtitle: 'Istanbul Streets — %100 orijinal açık dünya İstanbul oyunu (v0.0.1-m0 İskelet).',
    aboutDataHeading: 'Planlanan Harita ve Açık Veri Atıfları (M1+)',
    aboutOriginalityNote:
      'Tüm karakterler, markalar ve kurumlar kurgusaldır. Ayasofya ve Sultanahmet Camii çevresi şiddetsiz güvenli alan olarak tasarlanmıştır.',
    aboutPrivacyLink: 'Gizlilik Politikası (KVKK / GDPR)',
    crashTitle: 'Beklenmedik Bir Hata Oluştu',
    crashBody:
      'Oyun güvenli bir şekilde durduruldu. Kaydınız korunmuştur ve hata yerel kilitlenme günlüğüne kaydedildi.',
    crashCopyButton: 'Hata Günlüğünü Kopyala',
    crashCopied: 'Kopyalandı',
    crashReloadButton: 'Oyunu Yeniden Başlat',
    crashLogEmpty: 'Henüz kayıtlı kilitlenme yok.',
    recoveredSaveToast: 'Kayıt yedeği başarıyla kurtarıldı.',
    controlsHintDesktop: 'WASD / Oklar: Yürü · Shift: Koş · Esc: Duraklat',
    controlsHintTouch: 'Sol kol: Yürü · KOŞ: Hızlı koş · Geri tuşu: Duraklat',
    sanctuaryBanner: 'Güvenli Alan — İbadethane Çevresi',
  },
  en: {
    appTitle: 'ISTANBUL STREETS',
    milestoneTag: 'M0 Skeleton · v0.0.1',
    fpsLabel: 'FPS',
    drawsLabel: 'Draws',
    trisLabel: 'Tris',
    physicsReady: 'Rapier3D Ready',
    physicsLoading: 'Loading Physics…',
    qualityNormal: 'Normal',
    qualityLite: 'Lite Mode',
    pauseButton: 'Pause',
    aboutButton: 'About',
    langButton: 'EN / TR',
    sprintButton: 'SPRINT',
    pausedTitle: 'Game Paused',
    resumeButton: 'Resume',
    resetPosButton: 'Reset Position',
    viewCrashLogButton: 'Crash Log',
    closeButton: 'Close',
    aboutTitle: 'About & Attributions',
    aboutSubtitle: 'Istanbul Streets — 100% original open-world game set in Istanbul (v0.0.1-m0).',
    aboutDataHeading: 'Planned Map & Open Data Attributions (M1+)',
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
    controlsHintDesktop: 'WASD / Arrows: Walk · Shift: Sprint · Esc: Pause',
    controlsHintTouch: 'Left stick: Walk · SPRINT: Run · Back button: Pause',
    sanctuaryBanner: 'Safe Zone — Sanctuary Precinct',
  },
};

export function getStrings(locale: LocaleCode): UiStrings {
  return STRINGS[locale];
}
