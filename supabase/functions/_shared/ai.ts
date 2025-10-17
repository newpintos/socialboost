// AI Adapter interface
export interface AIAdapter {
  getVariants(
    productDescription: string,
    referenceImageUrl?: string,
    selectedStyle?: string
  ): Promise<AIVariantResponse>;
  getImageBytes(prompt: string, productImageUrl?: string): Promise<Uint8Array>;
}

export interface AIVariantResponse {
  variants: Array<{
    prompt: string;
    caption: string;
  }>;
}

// Get the configured AI adapter
export function getAIAdapter(): AIAdapter {
  const provider = Deno.env.get('AI_PROVIDER') || 'nanobanana';

  switch (provider) {
    case 'gemini':
      return new GeminiAdapter();
    case 'nanobanana':
    default:
      return new NanoBananaAdapter();
  }
}

// ============================================================================
// NanoBanana Adapter (Default)
// ============================================================================

class NanoBananaAdapter implements AIAdapter {
  private apiKey: string;
  private useMock: boolean;

  constructor() {
    this.apiKey = Deno.env.get('NANO_BANANA_API_KEY') || '';
    this.useMock = !this.apiKey;

    if (this.useMock) {
      console.warn('⚠️  NanoBanana API credentials missing - using MOCK adapter');
    }
  }

  async getVariants(
    productDescription: string,
    referenceImageUrl?: string,
    selectedStyle?: string
  ): Promise<AIVariantResponse> {
    if (this.useMock) {
      return this.getMockVariants(productDescription);
    }

    try {
      // Use Gemini to generate prompts and captions for 3 variants
      const model = 'gemini-2.0-flash-exp';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      const systemPrompt = `You are a creative AI that generates 3 distinct social media image prompts and captions for products.

IMPORTANT: The user has uploaded their ACTUAL PRODUCT IMAGE. Your job is to create prompts that will:
1. Keep the exact product from the uploaded image
2. Apply different backgrounds, settings, and styles around the product
3. Preserve the product's appearance, colors, and details

Return a JSON object with this exact structure:
{
  "variants": [
    {"prompt": "detailed image generation prompt", "caption": "engaging social media caption"},
    {"prompt": "detailed image generation prompt", "caption": "engaging social media caption"},
    {"prompt": "detailed image generation prompt", "caption": "engaging social media caption"}
  ]
}`;

      // Build the parts array for the API request
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      let userPrompt = `Product: ${productDescription}\n\n`;

      // If product image is provided, download it and include it in the request
      if (referenceImageUrl) {
        try {
          console.log('Fetching product image:', referenceImageUrl);
          const imageResponse = await fetch(referenceImageUrl);

          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const imageBytes = new Uint8Array(imageBuffer);

            // Convert to base64
            let base64 = '';
            const len = imageBytes.length;
            for (let i = 0; i < len; i++) {
              base64 += String.fromCharCode(imageBytes[i]);
            }
            const base64Image = btoa(base64);

            // Determine MIME type from URL or default to jpeg
            let mimeType = 'image/jpeg';
            if (referenceImageUrl.toLowerCase().includes('.png')) {
              mimeType = 'image/png';
            } else if (referenceImageUrl.toLowerCase().includes('.webp')) {
              mimeType = 'image/webp';
            }

            console.log(`✓ Product image loaded: ${imageBytes.length} bytes, ${mimeType}`);

            // Add image first, then text
            parts.push({
              inlineData: {
                mimeType,
                data: base64Image,
              },
            });

            userPrompt += `The image above shows the ACTUAL PRODUCT. This exact product must appear in all generated images.\n\n`;
          } else {
            console.warn('Failed to fetch product image, proceeding without it');
          }
        } catch (imageError) {
          console.error('Error loading product image:', imageError);
          console.warn('Proceeding without product image');
        }
      }

      // Add style-specific instructions
      if (selectedStyle) {
        userPrompt += `Selected Style: ${selectedStyle}\n`;
        userPrompt += `Create prompts that place this exact product in ${selectedStyle}-style settings with appropriate backgrounds and lighting.\n\n`;
      }

      userPrompt += `Generate 3 creative variants. Each prompt must:
- Include the exact product from the uploaded image
- Apply different ${selectedStyle || 'creative'} backgrounds and settings
- Maintain the product's original appearance
- Create variations in: lighting, background, composition, and atmosphere`;

      // Add the text prompt
      parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error response:', errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from Gemini response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.variants || parsed.variants.length !== 3) {
        throw new Error('Expected exactly 3 variants from Gemini');
      }

      return parsed;
    } catch (error) {
      console.error('NanoBanana getVariants error:', error);
      throw error;
    }
  }

  async getImageBytes(prompt: string, productImageUrl?: string): Promise<Uint8Array> {
    if (this.useMock) {
      return this.getMockImageBytes();
    }

    try {
      // Use Gemini 2.5 Flash Image Preview for actual image generation
      console.log('Generating image with Gemini 2.5 Flash Image Preview');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${this.apiKey}`;

      // Build parts array - include product image if provided
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      // If product image is provided, include it first
      if (productImageUrl) {
        try {
          console.log('Including product image in generation:', productImageUrl);
          const imageResponse = await fetch(productImageUrl);

          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const imageBytes = new Uint8Array(imageBuffer);

            // Convert to base64
            let base64 = '';
            const len = imageBytes.length;
            for (let i = 0; i < len; i++) {
              base64 += String.fromCharCode(imageBytes[i]);
            }
            const base64Image = btoa(base64);

            // Determine MIME type
            let mimeType = 'image/jpeg';
            if (productImageUrl.toLowerCase().includes('.png')) {
              mimeType = 'image/png';
            } else if (productImageUrl.toLowerCase().includes('.webp')) {
              mimeType = 'image/webp';
            }

            console.log(`✓ Product image included for generation: ${imageBytes.length} bytes`);

            parts.push({
              inlineData: {
                mimeType,
                data: base64Image,
              },
            });

            // Enhance prompt to reference the product image
            parts.push({
              text: `Use the product shown in the image above. ${prompt}`,
            });
          } else {
            console.warn('Failed to fetch product image for generation, using prompt only');
            parts.push({ text: prompt });
          }
        } catch (imageError) {
          console.error('Error loading product image for generation:', imageError);
          parts.push({ text: prompt });
        }
      } else {
        // No product image, just use the prompt
        parts.push({ text: prompt });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          generationConfig: {
            temperature: 1.0,
            responseModalities: ['image'],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini Image API error response:', errorText);
        throw new Error(`Gemini Image API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Gemini response structure:', JSON.stringify(data, null, 2));

      // Try multiple possible response formats
      let base64Data = null;

      // Format 1: inlineData (camelCase) - this is what Gemini 2.5 uses!
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        base64Data = inlineData.data;
        console.log('Found image in inlineData.data (camelCase)');
      }

      // Format 2: inline_data (snake_case) - backup
      if (!base64Data) {
        const inline_data = data.candidates?.[0]?.content?.parts?.[0]?.inline_data;
        if (inline_data?.data) {
          base64Data = inline_data.data;
          console.log('Found image in inline_data.data (snake_case)');
        }
      }

      // Format 3: Direct in parts (some APIs return this way)
      if (!base64Data && data.candidates?.[0]?.content?.parts?.[0]?.image) {
        base64Data = data.candidates[0].content.parts[0].image;
        console.log('Found image in parts.image');
      }

      // Format 4: In output field
      if (!base64Data && data.output) {
        base64Data = data.output;
        console.log('Found image in output');
      }

      if (!base64Data) {
        console.error('No image data found in any expected format');
        console.error('Full response:', JSON.stringify(data));
        throw new Error('No image data in Gemini response');
      }

      // Decode base64 image
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log(`Generated image size: ${bytes.length} bytes`);
      return bytes;
    } catch (error) {
      console.error('NanoBanana getImageBytes error:', error);
      throw error;
    }
  }

  private getMockVariants(description: string): AIVariantResponse {
    const baseCaption = description.slice(0, 50);
    return {
      variants: [
        {
          prompt: `Studio shot: ${description}`,
          caption: `✨ ${baseCaption} - Professional studio quality`,
        },
        {
          prompt: `Lifestyle context: ${description}`,
          caption: `🌟 ${baseCaption} - In real-life setting`,
        },
        {
          prompt: `UGC style: ${description}`,
          caption: `📱 ${baseCaption} - Authentic user vibe`,
        },
      ],
    };
  }

  private getMockImageBytes(): Uint8Array {
    // Return a minimal valid 1x1 PNG (placeholder)
    // PNG signature + IHDR + IDAT + IEND chunks
    return new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // RGBA, CRC
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, // Compressed data
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, // CRC
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
      0x42, 0x60, 0x82,
    ]);
  }
}

// ============================================================================
// Gemini Adapter (Alternative)
// ============================================================================

class GeminiAdapter implements AIAdapter {
  private apiKey: string;
  private useMock: boolean;

  constructor() {
    this.apiKey = Deno.env.get('GEMINI_API_KEY') || '';
    this.useMock = !this.apiKey;

    if (this.useMock) {
      console.warn('⚠️  Gemini API key missing - using MOCK adapter');
    }
  }

  async getVariants(
    productDescription: string,
    referenceImageUrl?: string,
    selectedStyle?: string
  ): Promise<AIVariantResponse> {
    if (this.useMock) {
      return this.getMockVariants(productDescription);
    }

    try {
      const model = 'gemini-2.0-flash-exp';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      const systemPrompt = `You are a creative AI that generates 3 distinct social media image prompts and captions for products.

IMPORTANT: The user has uploaded their ACTUAL PRODUCT IMAGE. Your job is to create prompts that will:
1. Keep the exact product from the uploaded image
2. Apply different backgrounds, settings, and styles around the product
3. Preserve the product's appearance, colors, and details

Return a JSON object with this exact structure:
{
  "variants": [
    {"prompt": "detailed image generation prompt", "caption": "engaging social media caption"},
    {"prompt": "detailed image generation prompt", "caption": "engaging social media caption"},
    {"prompt": "detailed image generation prompt", "caption": "engaging social media caption"}
  ]
}`;

      // Build the parts array for the API request
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      let userPrompt = `Product: ${productDescription}\n\n`;

      // If product image is provided, download it and include it in the request
      if (referenceImageUrl) {
        try {
          console.log('Fetching product image:', referenceImageUrl);
          const imageResponse = await fetch(referenceImageUrl);

          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const imageBytes = new Uint8Array(imageBuffer);

            // Convert to base64
            let base64 = '';
            const len = imageBytes.length;
            for (let i = 0; i < len; i++) {
              base64 += String.fromCharCode(imageBytes[i]);
            }
            const base64Image = btoa(base64);

            // Determine MIME type from URL or default to jpeg
            let mimeType = 'image/jpeg';
            if (referenceImageUrl.toLowerCase().includes('.png')) {
              mimeType = 'image/png';
            } else if (referenceImageUrl.toLowerCase().includes('.webp')) {
              mimeType = 'image/webp';
            }

            console.log(`✓ Product image loaded: ${imageBytes.length} bytes, ${mimeType}`);

            // Add image first, then text
            parts.push({
              inlineData: {
                mimeType,
                data: base64Image,
              },
            });

            userPrompt += `The image above shows the ACTUAL PRODUCT. This exact product must appear in all generated images.\n\n`;
          } else {
            console.warn('Failed to fetch product image, proceeding without it');
          }
        } catch (imageError) {
          console.error('Error loading product image:', imageError);
          console.warn('Proceeding without product image');
        }
      }

      // Add style-specific instructions
      if (selectedStyle) {
        userPrompt += `Selected Style: ${selectedStyle}\n`;
        userPrompt += `Create prompts that place this exact product in ${selectedStyle}-style settings with appropriate backgrounds and lighting.\n\n`;
      }

      userPrompt += `Generate 3 creative variants. Each prompt must:
- Include the exact product from the uploaded image
- Apply different ${selectedStyle || 'creative'} backgrounds and settings
- Maintain the product's original appearance
- Create variations in: lighting, background, composition, and atmosphere`;

      // Add the text prompt
      parts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from Gemini response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.variants || parsed.variants.length !== 3) {
        throw new Error('Expected exactly 3 variants from Gemini');
      }

      return parsed;
    } catch (error) {
      console.error('Gemini getVariants error:', error);
      throw error;
    }
  }

  async getImageBytes(prompt: string): Promise<Uint8Array> {
    if (this.useMock) {
      return this.getMockImageBytes();
    }

    // Note: Gemini doesn't directly generate images yet in the same way.
    // In a real implementation, you'd call Imagen or another service.
    // For now, use mock when configured with Gemini.
    console.warn('Gemini image generation not implemented - using mock');
    return this.getMockImageBytes();
  }

  private getMockVariants(description: string): AIVariantResponse {
    const baseCaption = description.slice(0, 50);
    return {
      variants: [
        {
          prompt: `Professional studio photography of ${description}, clean background`,
          caption: `✨ ${baseCaption} - Shot with professional lighting`,
        },
        {
          prompt: `Lifestyle photo of ${description} in natural environment`,
          caption: `🌟 ${baseCaption} - Living your best life`,
        },
        {
          prompt: `UGC style handheld photo of ${description}, authentic vibe`,
          caption: `📱 ${baseCaption} - Real people, real moments`,
        },
      ],
    };
  }

  private getMockImageBytes(): Uint8Array {
    // Same 1x1 PNG placeholder
    return new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
  }
}
