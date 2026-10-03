import {z} from 'zod';

export const tiledTextSchema = z.object({
  bold: z.boolean().default(false),
  color: z.string().default('#000000'),
  fontfamily: z.string().default('sans-serif'),
  halign: z.enum(['center', 'justify', 'left', 'right']).default('left'),
  italic: z.boolean().default(false),
  kerning: z.boolean().default(true),
  pixelsize: z.number().default(16),
  strikeout: z.boolean().default(false),
  text: z.string(),
  underline: z.boolean().default(false),
  valign: z.enum(['bottom', 'center', 'top']).default('top'),
  wrap: z.boolean().default(false),
});

export type TiledText = z.infer<typeof tiledTextSchema>;
