type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const POSTHOG_ENABLED = import.meta.env.VITE_POSTHOG_ENABLED === 'true';
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;
let posthogClient: { capture: (event: string, properties?: Record<string, unknown>) => void } | null = null;

export function isAnalyticsEnabled() {
  return POSTHOG_ENABLED && Boolean(POSTHOG_KEY);
}

export async function initAnalytics() {
  if (initialized || !isAnalyticsEnabled()) return;
  initialized = true;

  try {
    const key = POSTHOG_KEY;
    if (!key) return;

    const { default: posthog } = await import('posthog-js');
    posthog.init(key, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      loaded: (client) => {
        posthogClient = client;
        client.capture('app_loaded', {
          app: 'archimedes-agent',
          mode: import.meta.env.MODE,
        });
      },
    });
  } catch (error) {
    console.warn('PostHog analytics failed to initialize', error);
  }
}

export function captureAnalyticsEvent(event: string, properties?: AnalyticsProperties) {
  if (!isAnalyticsEnabled()) return;
  posthogClient?.capture(event, {
    app: 'archimedes-agent',
    ...properties,
  });
}
