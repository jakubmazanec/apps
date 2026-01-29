// TODO: fix this; this file should be in the `tools` directory
/* eslint-disable import/no-extraneous-dependencies -- TODO */
import fs from 'fs-extra';
import path from 'node:path';
import xlsx from 'xlsx';
import {z} from 'zod';

import {appRootPath} from './constants.server.js';

let rowSchema = z
  .object({
    'Note ID': z.coerce.number(),
    'Bottle ID': z.string().optional(),
    'Whisky ID': z.string().optional(),
    Brand: z.string().optional(),
    Distillery: z.string().optional(),
    Bottler: z.string().optional(),
    Name: z.string().optional(),
    Edition: z.string().optional(),
    Batch: z.string().optional(),
    Age: z.union([z.undefined(), z.coerce.number()]),
    Vintage: z.string().optional(),
    Bottled: z.string().optional(),
    'Cask type': z.string().optional(),
    'Cask number': z.string().optional(),
    Strength: z
      .string()
      .optional()
      .refine((value) => !value || /^\d+(\.\d{1,2})?%$/.test(value), {
        message: `Format must be "{number}%"!`,
      })
      .transform((value) => {
        if (!value) {
          return undefined;
        }

        return Number.parseFloat((Number.parseFloat(value.slice(0, -1)) / 100).toFixed(4));
      }),
    Size: z.union([z.undefined(), z.coerce.number()]),
    'Bottles count': z.union([z.undefined(), z.coerce.number()]),
    'Nose rating': z.union([z.undefined(), z.coerce.number()]),
    'Taste rating': z.union([z.undefined(), z.coerce.number()]),
    'Finish rating': z.union([z.undefined(), z.coerce.number()]),
    'Balance rating': z.union([z.undefined(), z.coerce.number()]),
    Rating: z.union([z.undefined(), z.coerce.number()]),
    Score: z.union([z.undefined(), z.coerce.number()]),
    'Tasted at': z.coerce
      .date()
      .optional()
      .transform((date) => {
        if (!date) {
          return undefined;
        }

        return date.toISOString();
      }),
    'Tasting location': z.string().optional(),
    Color: z.string().optional(),
    Nose: z.string().optional(),
    Taste: z.string().optional(),
    Finish: z.string().optional(),
    'Bottle number': z.union([z.undefined(), z.string()]),
    'Bar code': z.string().optional(),
    'Bottle code': z.string().optional(),
    'Bought at': z.coerce
      .date()
      .optional()
      .transform((date) => {
        if (!date) {
          return undefined;
        }

        return date.toISOString().slice(0, 10);
      }),
    'Whiskybase URL': z.string().optional(),
  })
  .strict();

async function readXlsx(filePath: string, sheetName: string) {
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`File "${filePath}" doesn't exist!`);
  }

  let workbook = xlsx.readFile(filePath);
  let sheetNames = workbook.SheetNames;

  if (!sheetNames.includes(sheetName)) {
    throw new Error(`File "${filePath}" doesn't contain sheet "${sheetName}"!`);
  }

  let sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`File "${filePath}" doesn't contain sheet "${sheetName}"!`);
  }

  let rows = xlsx.utils.sheet_to_json(sheet, {raw: false});

  return rows;
}

function rowToNote(rawRow: unknown) {
  let row: z.infer<typeof rowSchema>;

  try {
    row = rowSchema.parse(rawRow);
  } catch (error) {
    console.log('Error in note', rawRow);
    throw error;
  }

  let note = {
    age: row.Age,
    balanceRating: row['Balance rating'],
    barCode: row['Bar code'],
    batch: row.Batch,
    bottleCode: row['Bottle code'],
    bottleId: row['Bottle ID'],
    bottleNumber: row['Bottle number'],
    bottled: row.Bottled,
    bottler: row.Bottler,
    bottlesCount: row['Bottles count'],
    boughtAt: row['Bought at'],
    brand: row.Brand,
    caskNumber: row['Cask number'],
    caskType: row['Cask type'],
    color: row.Color,
    distillery: row.Distillery,
    edition: row.Edition,
    finish: row.Finish,
    finishRating: row['Finish rating'],
    name: row.Name,
    nose: row.Nose,
    noseRating: row['Nose rating'],
    rating: row.Rating,
    score: row.Score,
    size: row.Size,
    strength: row.Strength,
    taste: row.Taste,
    tasteRating: row['Taste rating'],
    tastedAt: row['Tasted at'],
    tastingLocation: row['Tasting location'],
    vintage: row.Vintage,
    whiskybaseUrl: row['Whiskybase URL'],
    whiskyId: row['Whisky ID'],
    order: row['Note ID'],
  };

  return note;
}

async function importData() {
  let rawRows = await readXlsx(path.join(appRootPath, '$/whisky.xlsx'), 'tasting_notes');
  let notes = rawRows.map((rawNote) => rowToNote(rawNote)).filter((note) => note.tastedAt);

  console.log(`Writing ${notes.length} notes to JSON...`);

  let outputPath = path.join(appRootPath, 'source/data.json');
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, notes, {spaces: 2});

  console.log('Done!');
}

importData().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});
