import { z } from 'zod';

// API request schemas
export const startGenerationSchema = z.object({
  productDescription: z
    .string()
    .min(10, 'Product description must be at least 10 characters')
    .max(2000, 'Product description must be less than 2000 characters'),
  referenceImageUrl: z.string().url().optional(),
});

export const upgradeUserPlanSchema = z.object({
  uid: z.string().uuid(),
  addCredits: z.number().int().positive(),
});

// AI response schemas
export const aiVariantSchema = z.object({
  prompt: z.string(),
  caption: z.string(),
});

export const aiVariantsResponseSchema = z.object({
  variants: z.array(aiVariantSchema).length(3, 'Must return exactly 3 variants'),
});

// Webhook schemas
export const stripeWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.object({
      metadata: z
        .object({
          uid: z.string().uuid().optional(),
        })
        .optional(),
      amount: z.number().optional(),
      currency: z.string().optional(),
    }),
  }),
});

export const razorpayWebhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        amount: z.number(),
        currency: z.string(),
        captured: z.boolean(),
        notes: z
          .object({
            uid: z.string().uuid().optional(),
          })
          .optional(),
      }),
    }),
  }),
});

// Generation result schema
export const generationResultSchema = z.object({
  variants: z.array(
    z.object({
      prompt: z.string(),
      caption: z.string(),
      image_url: z.string().url(),
    })
  ),
  safety_flags: z.array(z.string()),
});

// RPC parameter schemas
export const startGenerationTxSchema = z.object({
  p_uid: z.string().uuid(),
  p_product_description: z.string(),
  p_reference_image_url: z.string().nullable(),
  p_daily_limit: z.number().int().positive().default(100),
});
