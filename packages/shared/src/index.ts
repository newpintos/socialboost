// Re-export all types
export * from './types';

// Re-export all schemas
export * from './schemas';

// Constants
export const PRESETS = {
  studio: {
    name: 'Studio Clean',
    description: 'Professional product photography with clean background',
    hint: 'Professional studio photography, clean white background, centered composition, soft lighting, high-end product shot',
    aspectRatio: '1:1' as const,
  },
  lifestyle: {
    name: 'Lifestyle Context',
    description: 'Product in real-life setting with natural context',
    hint: 'Lifestyle photography, natural setting, product in use, authentic moment, natural lighting, relatable context',
    aspectRatio: '4:5' as const,
  },
  minimal: {
    name: 'Minimal Modern',
    description: 'Clean, minimalist aesthetic with subtle shadows',
    hint: 'Minimal modern style, neutral tones, clean surfaces, subtle shadows, contemporary aesthetic, elegant simplicity',
    aspectRatio: '1:1' as const,
  },
  festive: {
    name: 'Festive Seasonal',
    description: 'Holiday-themed with seasonal decorations and warmth',
    hint: 'Festive seasonal style, holiday decorations, warm lighting, celebratory atmosphere, seasonal elements, cozy vibes',
    aspectRatio: '4:5' as const,
  },
  luxury: {
    name: 'Luxury Premium',
    description: 'High-end luxury presentation with rich textures',
    hint: 'Luxury premium style, rich textures, elegant backdrop, sophisticated lighting, high-end presentation, premium feel',
    aspectRatio: '1:1' as const,
  },
  ugc: {
    name: 'UGC Handheld',
    description: 'User-generated content style, authentic and relatable',
    hint: 'User-generated content style, handheld shot, casual authentic vibe, natural imperfections, phone camera aesthetic, relatable angle',
    aspectRatio: '9:16' as const,
  },
} as const;

export const DEFAULT_CREDITS = {
  FREE: 50,
  PRO_BONUS: 500,
} as const;

export const RATE_LIMITS = {
  DAILY_GENERATIONS: 100,
} as const;
