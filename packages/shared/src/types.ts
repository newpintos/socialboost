// Database types
export type Plan = 'free' | 'pro';
export type GenerationStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type PaymentProvider = 'stripe' | 'razorpay';
export type AIProvider = 'nanobanana' | 'gemini';

export interface Profile {
  uid: string;
  email: string;
  plan: Plan;
  credits: number;
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id: string;
  uid: string;
  product_description: string;
  reference_image_url: string | null;
  status: GenerationStatus;
  result: GenerationResult | null;
  error: string | null;
  cost_credits: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface GenerationResult {
  variants: Variant[];
  safety_flags: string[];
}

export interface Variant {
  prompt: string;
  caption: string;
  image_url: string;
}

export interface Payment {
  id: string;
  uid: string;
  provider: PaymentProvider;
  provider_event_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface DailyUsage {
  uid: string;
  day: string;
  generations_count: number;
}

// AI Adapter types
export interface AIAdapter {
  getVariants(
    productDescription: string,
    referenceImageUrl?: string
  ): Promise<AIVariantResponse>;
  getImageBytes(prompt: string): Promise<Uint8Array>;
}

export interface AIVariantResponse {
  variants: Array<{
    prompt: string;
    caption: string;
  }>;
}

// API Request/Response types
export interface StartGenerationRequest {
  productDescription: string;
  referenceImageUrl?: string;
}

export interface StartGenerationResponse {
  genId: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

// Webhook types
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      metadata?: {
        uid?: string;
      };
      amount?: number;
      currency?: string;
    };
  };
}

export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        captured: boolean;
        notes?: {
          uid?: string;
        };
      };
    };
  };
}

// Style presets for UI
export type StylePreset = 'studio' | 'lifestyle' | 'ugc';

export interface PresetConfig {
  name: string;
  description: string;
  hint: string;
  aspectRatio: '1:1' | '4:5' | '9:16';
}
