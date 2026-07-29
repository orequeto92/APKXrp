import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.brahian.xrp",
  appName: "XRP",
  webDir: "dist",

  android: {
    allowMixedContent: false,
  },

  plugins: {
    // CLAVE: enruta fetch/XHR por el HTTP nativo de Android.
    // Sin esto, las llamadas a api.bitget.com y a GitHub fallan por CORS
    // dentro del WebView.
    CapacitorHttp: {
      enabled: true,
    },
  },

  // Solo necesita permiso de INTERNET (que Capacitor ya declara).
};

export default config;
