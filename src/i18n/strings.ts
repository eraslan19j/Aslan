import type { LocaleCode } from '../core/save';

export interface UiStrings {
  appTitle: string;
  milestoneTag: string;
  fpsLabel: string;
  drawsLabel: string;
  trisLabel: string;
  tilesLabel: string;
  buildingsLabel: string;
  speedUnit: string;
  physicsReady: string;
  physicsLoading: string;
  qualityLow: string;
  qualityMedium: string;
  qualityHigh: string;
  qualityUltra: string;
  timeDay: string;
  timeSunset: string;
  timeNight: string;
  settingsButton: string;
  pauseButton: string;
  aboutButton: string;
  langButton: string;
  cameraButtonTitle: string;
  cameraChase: string;
  cameraWide: string;
  cameraHood: string;
  cameraTopdown: string;
  soundOn: string;
  soundOff: string;
  sprintButton: string;
  enterCarButton: string;
  exitCarButton: string;
  callTaxiButton: string;
  gasButton: string;
  brakeButton: string;
  driftButton: string;
  hornButton: string;
  pausedTitle: string;
  resumeButton: string;
  resetPosButton: string;
  regionSwitchHeading: string;
  fastTravelHeading: string;
  viewCrashLogButton: string;
  closeButton: string;
  settingsTitle: string;
  diagnosticsHeading: string;
  copyReportButton: string;
  reportCopied: string;
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
  controlsHintFootDesktop: string;
  controlsHintDriveDesktop: string;
  controlsHintFootTouch: string;
  controlsHintDriveTouch: string;
  sanctuaryBanner: string;
  nearVehiclePrompt: string;
  missionPickupPrefix: string;
  missionDropoffPrefix: string;
  missionPickedUpToast: string;
  missionCompletedToast: string;
  missionExpiredToast: string;
  taxiCalledToast: string;
  wantedLabel: string;
  bustedTitle: string;
  bustedBody: string;
  bustedResumeButton: string;
}

const STRINGS: Record<LocaleCode, UiStrings> = {
  tr: {
    appTitle: 'ISTANBUL STREETS',
    milestoneTag: 'v0.6.0 · Serbest Dünya',
    fpsLabel: 'FPS',
    drawsLabel: 'Çizim',
    trisLabel: 'Üçgen',
    tilesLabel: 'Karo',
    buildingsLabel: 'Bina',
    speedUnit: 'km/s',
    physicsReady: 'Fizik Hazır',
    physicsLoading: 'Fizik…',
    qualityLow: 'Düşük',
    qualityMedium: 'Orta',
    qualityHigh: 'Yüksek',
    qualityUltra: 'Ultra',
    timeDay: 'Gündüz',
    timeSunset: 'Gün Batımı',
    timeNight: 'Gece',
    settingsButton: 'Ayarlar',
    pauseButton: 'Duraklat',
    aboutButton: 'Hakkında',
    langButton: 'TR / EN',
    cameraButtonTitle: 'Kamera Açısı (C)',
    cameraChase: 'Takip',
    cameraWide: 'Geniş',
    cameraHood: 'Kaput',
    cameraTopdown: 'Kuş Bakışı',
    soundOn: 'Ses Açık',
    soundOff: 'Sessiz',
    sprintButton: 'KOŞ',
    enterCarButton: 'BİN',
    exitCarButton: 'İN',
    callTaxiButton: 'ARAÇ',
    gasButton: 'GAZ',
    brakeButton: 'FREN',
    driftButton: 'DRİFT',
    hornButton: 'KORNA',
    pausedTitle: 'Duraklatıldı',
    resumeButton: 'Devam Et',
    resetPosButton: 'Başlangıca Dön',
    regionSwitchHeading: 'Bölge Değiştir',
    fastTravelHeading: 'Bölge Noktaları (Hızlı Keşif)',
    viewCrashLogButton: 'Kilitlenme Günlüğü',
    closeButton: 'Kapat',
    settingsTitle: 'Ayarlar ve Tanılama Paneli',
    diagnosticsHeading: 'Cihaz & Performans Tanılama (JSON)',
    copyReportButton: 'RAPORU KOPYALA',
    reportCopied: 'Rapor panoya kopyalandı!',
    aboutTitle: 'Hakkında ve ODbL / Açık Veri Atıfları',
    aboutSubtitle:
      'Istanbul Streets v0.6.0 — İstanbul açık harita verileriyle çevrimdışı çalışan %100 orijinal GTA tarzı serbest açık dünya oyunu.',
    aboutDataHeading: 'Harita ve Türetilmiş Veri Atıfları (public/derived-data/)',
    aboutOriginalityNote:
      'Tüm karakterler, araçlar, markalar ve kurumlar kurgusaldır; gerçek kişi, ev adresi veya işletme logosu yoktur. Tüm ibadethaneler otomatik şiddetsiz Güvenli Alandır.',
    aboutPrivacyLink: 'Gizlilik Politikası (KVKK / GDPR)',
    crashTitle: 'Beklenmedik Bir Hata Oluştu',
    crashBody:
      'Oyun güvenli bir şekilde durduruldu. Kaydınız korunmuştur ve hata yerel kilitlenme günlüğüne kaydedildi.',
    crashCopyButton: 'Hata Günlüğünü Kopyala',
    crashCopied: 'Kopyalandı',
    crashReloadButton: 'Oyunu Yeniden Başlat',
    crashLogEmpty: 'Henüz kayıtlı kilitlenme yok.',
    recoveredSaveToast: 'Kayıt yedeği başarıyla kurtarıldı.',
    controlsHintFootDesktop:
      'WASD: Yürü · Shift: Koş · F: Araç (Herhangi bir araca bin) · R: Araç Çağır · C: Kamera · M: Ses · Esc: Menü',
    controlsHintDriveDesktop:
      'W/S: Gaz-Fren · A/D: Direksiyon · Space: Drift · H: Korna · C: Kamera · F: İn',
    controlsHintFootTouch: 'Sol kol: Yürü · Sağ kaydır: Kamera · BİN: Herhangi Bir Araç · Radar: Yakınlaştır',
    controlsHintDriveTouch: '◀/▶: Yön · GAZ/FREN/DRİFT · 🔔: Korna · 📷: Kamera · İN: Çık',
    sanctuaryBanner: 'GÜVENLİ ALAN — Şiddet & Silah Kilitli',
    nearVehiclePrompt: 'Araç yakın — Binmek için F / BİN',
    missionPickupPrefix: 'Yolcu Al',
    missionDropoffPrefix: 'Yolcuyu Bırak',
    missionPickedUpToast: 'Yolcu bindi! Hedefe götür',
    missionCompletedToast: 'Yolculuk tamamlandı!',
    missionExpiredToast: 'Süre doldu — Yeni yolcu haritada!',
    taxiCalledToast: 'Araç yanına getirildi!',
    wantedLabel: 'ARANMA',
    bustedTitle: 'YAKALANDIN (BUSTED)',
    bustedBody: 'Şehir Polisi tarafından durduruldun ve serbest bırakıldın.',
    bustedResumeButton: 'Sokağa Dön',
  },
  en: {
    appTitle: 'ISTANBUL STREETS',
    milestoneTag: 'v0.6.0 · Free Roam',
    fpsLabel: 'FPS',
    drawsLabel: 'Draws',
    trisLabel: 'Tris',
    tilesLabel: 'Tiles',
    buildingsLabel: 'Bldgs',
    speedUnit: 'km/h',
    physicsReady: 'Physics OK',
    physicsLoading: 'Physics…',
    qualityLow: 'Low',
    qualityMedium: 'Medium',
    qualityHigh: 'High',
    qualityUltra: 'Ultra',
    timeDay: 'Day',
    timeSunset: 'Sunset',
    timeNight: 'Night',
    settingsButton: 'Settings',
    pauseButton: 'Pause',
    aboutButton: 'About',
    langButton: 'EN / TR',
    cameraButtonTitle: 'Camera Angle (C)',
    cameraChase: 'Chase',
    cameraWide: 'Wide',
    cameraHood: 'Hood',
    cameraTopdown: 'Top-Down',
    soundOn: 'Sound On',
    soundOff: 'Muted',
    sprintButton: 'RUN',
    enterCarButton: 'DRIVE',
    exitCarButton: 'EXIT',
    callTaxiButton: 'CAR',
    gasButton: 'GAS',
    brakeButton: 'BRAKE',
    driftButton: 'DRIFT',
    hornButton: 'HORN',
    pausedTitle: 'Paused',
    resumeButton: 'Resume',
    resetPosButton: 'Reset Position',
    regionSwitchHeading: 'Switch Region',
    fastTravelHeading: 'Region Landmarks (Quick Explore)',
    viewCrashLogButton: 'Crash Log',
    closeButton: 'Close',
    settingsTitle: 'Settings & Diagnostics Panel',
    diagnosticsHeading: 'Device & Performance Diagnostics (JSON)',
    copyReportButton: 'COPY REPORT',
    reportCopied: 'Report copied to clipboard!',
    aboutTitle: 'About & ODbL / Open Data Attributions',
    aboutSubtitle:
      'Istanbul Streets v0.6.0 — 100% original offline GTA-style free-roam open-world game built from open Istanbul geospatial data.',
    aboutDataHeading: 'Map & Derived Data Attributions (public/derived-data/)',
    aboutOriginalityNote:
      'All characters, vehicles, brands, and agencies are fictional; zero real people, home addresses, or brand logos. All places of worship are automatic Safe Zones.',
    aboutPrivacyLink: 'Privacy Policy (KVKK / GDPR)',
    crashTitle: 'An Unexpected Error Occurred',
    crashBody:
      'The game stopped safely. Your save file is intact and details were recorded in the local crash log.',
    crashCopyButton: 'Copy Crash Log',
    crashCopied: 'Copied',
    crashReloadButton: 'Restart Game',
    crashLogEmpty: 'No crash records yet.',
    recoveredSaveToast: 'Save file recovered from backup.',
    controlsHintFootDesktop:
      'WASD: Walk · Shift: Run · F: Enter Any Car · R: Call Car · C: Camera · M: Audio · Esc: Menu',
    controlsHintDriveDesktop:
      'W/S: Gas/Brake · A/D: Steer · Space: Drift · H: Horn · C: Camera · F: Exit',
    controlsHintFootTouch: 'Left stick: Walk · Drag right: Camera · DRIVE: Any Car · Tap Radar: Zoom',
    controlsHintDriveTouch: '◀/▶: Steer · GAS/BRAKE/DRIFT · 🔔: Horn · 📷: Cam · EXIT: Leave',
    sanctuaryBanner: 'SAFE ZONE — Sanctuary Precinct (No Combat)',
    nearVehiclePrompt: 'Vehicle nearby — Press F / DRIVE',
    missionPickupPrefix: 'Pick Up Fare',
    missionDropoffPrefix: 'Drop Off Fare',
    missionPickedUpToast: 'Passenger aboard! Drive to drop-off',
    missionCompletedToast: 'Fare completed!',
    missionExpiredToast: 'Time up — New fare marked on radar!',
    taxiCalledToast: 'Vehicle delivered nearby!',
    wantedLabel: 'WANTED',
    bustedTitle: 'BUSTED',
    bustedBody: 'Stopped by City Police and released back to the street.',
    bustedResumeButton: 'Back to Street',
  },
};

export function getStrings(locale: LocaleCode): UiStrings {
  return STRINGS[locale];
}
