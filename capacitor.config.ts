import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.istanbulstreets.game',
  appName: 'Istanbul Streets',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#121826',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
