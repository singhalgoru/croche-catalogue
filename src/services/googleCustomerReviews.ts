export interface GoogleCustomerReviewsOptInParams {
  merchantId?: number;
  orderId: string;
  email: string;
  deliveryCountry?: string;
  estimatedDeliveryDate: string;
  optInStyle?: 'CENTER_DIALOG' | 'BOTTOM_RIGHT_DIALOG' | 'BOTTOM_LEFT_DIALOG' | 'TOP_RIGHT_DIALOG' | 'TOP_LEFT_DIALOG' | 'BOTTOM_TRAY';
}

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
      surveyoptin?: {
        render: (config: {
          merchant_id: number;
          order_id: string;
          email: string;
          delivery_country: string;
          estimated_delivery_date: string;
          opt_in_style?: string;
        }) => void;
      };
    };
    renderOptIn?: () => void;
  }
}

export const GOOGLE_MERCHANT_ID = 5865567820;

export function calculateEstimatedDeliveryDate(dispatchDays = 5, transitDays = 4): string {
  const date = new Date();
  date.setDate(date.getDate() + dispatchDays + transitDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let scriptPromise: Promise<void> | null = null;

function loadGooglePlatformScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.gapi?.surveyoptin) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="apis.google.com/js/platform.js"]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Google Platform script'));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function renderGoogleCustomerReviewsOptIn(params: GoogleCustomerReviewsOptInParams): void {
  if (typeof window === 'undefined' || !params.email || !params.orderId) return;

  const config = {
    merchant_id: params.merchantId ?? GOOGLE_MERCHANT_ID,
    order_id: params.orderId,
    email: params.email,
    delivery_country: params.deliveryCountry ?? 'IN',
    estimated_delivery_date: params.estimatedDeliveryDate,
    ...(params.optInStyle ? { opt_in_style: params.optInStyle } : {}),
  };

  const executeRender = () => {
    if (!window.gapi) return;
    window.gapi.load('surveyoptin', () => {
      window.gapi?.surveyoptin?.render(config);
    });
  };

  window.renderOptIn = executeRender;

  if (window.gapi?.surveyoptin) {
    executeRender();
  } else {
    loadGooglePlatformScript()
      .then(() => {
        if (window.gapi) executeRender();
      })
      .catch(err => {
        console.warn('Google Customer Reviews opt-in script load error:', err);
      });
  }
}
