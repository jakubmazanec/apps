import fs, {pathExists} from 'fs-extra';
import path from 'path';
import {fileURLToPath} from 'url';
import xlsx from 'xlsx';
import {z} from 'zod';

import {appRootPath} from '../app/constants.js';
import {client, e, Note} from '../app/db.js';
// import {rawBottlings} from './rawBottlings';

// let client = createClient();

let rawNoteSchema = z
  .object({
    'Note ID': z.string().optional(),
    'Bottle ID': z.string().optional(),
    'Whisky ID': z.string().optional(),
    Brand: z.string().optional(),
    Distillery: z.string().optional(),
    Bottler: z.string().optional(),
    Name: z.string().optional(),
    Edition: z.string().optional(),
    Batch: z.string().optional(),
    Age: z.string().optional(),
    Vintage: z.string().optional(),
    Bottled: z.string().optional(),
    'Cask type': z.string().optional(),
    'Cask number': z.string().optional(),
    Strength: z.string().optional(),
    Size: z.string().optional(),
    'Bottles count': z.string().optional(),
    'Nose rating': z.string().optional(),
    'Taste rating': z.string().optional(),
    'Finish rating': z.string().optional(),
    'Balance rating': z.string().optional(),
    Rating: z.string().optional(),
    Score: z.string().optional(),
    'Tasted at': z.string().optional(),
    'Tasting location': z.string().optional(),
    Color: z.string().optional(),
    Nose: z.string().optional(),
    Taste: z.string().optional(),
    Finish: z.string().optional(),
    'Bottle number': z.string().optional(),
    'Bar code': z.string().optional(),
    'Bottle code': z.string().optional(),
    'Bought at': z.string().optional(),
    'Whiskybase URL': z.string().optional(),
  })
  .strict();

let noteSchema = z
  .object({
    age: z.string(),
    balanceRating: z.string(),
    barCode: z.string(),
    batch: z.string(),
    bottleCode: z.string(),
    bottleId: z.string(),
    bottleNumber: z.string(),
    bottled: z.string(),
    bottler: z.string(),
    bottlesCount: z.string(),
    boughtAt: z.string(),
    brand: z.string(),
    caskNnumber: z.string(),
    caskType: z.string(),
    color: z.string(),
    distillery: z.string(),
    edition: z.string(),
    finish: z.string(),
    finishRating: z.string(),
    name: z.string(),
    nose: z.string(),
    noseRating: z.string(),
    noteId: z.string(),
    rating: z.string(),
    score: z.string(),
    size: z.string(),
    strength: z.string(),
    taste: z.string(),
    tasteRating: z.string(),
    tastedAt: z.string(),
    tastingLocation: z.string(),
    vintage: z.string(),
    whiskybaseUrl: z.string(),
    whiskyId: z.string(),
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

function convertRawNote(rawNote: unknown) {
  return rawNoteSchema.parse(rawNote);
}

async function seed() {
  let rawNotes = await readXlsx(path.join(appRootPath, '$/whisky.xlsx'), 'tasting_notes');
  let notes = rawNotes.map((rawNote) => convertRawNote(rawNote));

  console.log(notes[0]);

  // find user
  // let foo = await e
  //   .select(e.Note, (note) => ({
  //     filter: e.op(note.name, '=', 'foo'),
  //     ...e.Note['*'],
  //   }))
  //   .run(client);

  // // find user
  // let admin = await e
  //   .select(e.User, (user) => ({
  //     filter: e.op(user.email, '=', 'jakub@mazanec.dev'),
  //   }))
  //   .run(client);

  // if (!admin) {
  //   throw new Error('User not found!');
  // }

  // client = client.withGlobals({
  //   currentUserId: admin.id,
  // });

  // // add distilleries and bottlers
  // await e.delete(e.Distillery).run(client);
  // await e.delete(e.Bottler).run(client);

  // let addDistilleriesQuery = e.params({distilleries: e.json}, (parameters) =>
  //   e.for(e.json_array_unpack(parameters.distilleries), (distillery) =>
  //     e.insert(e.Distillery, {
  //       name: e.cast(e.str, distillery.name),
  //     }),
  //   ),
  // );

  // await addDistilleriesQuery.run(client, {
  //   distilleries: [
  //     {name: 'Glenfiddich'},
  //     {name: 'Bruichladdich'},
  //     {name: 'Bowmore'},
  //     {name: 'Ardbeg'},
  //     {name: 'Aberlour'},
  //     {name: 'Glenglassaugh'},
  //   ],
  // });

  // let addBottlersQuery = e.params({bottlers: e.json}, (parameters) =>
  //   e.for(e.json_array_unpack(parameters.bottlers), (bottler) =>
  //     e.insert(e.Bottler, {
  //       name: e.cast(e.str, bottler.name),
  //     }),
  //   ),
  // );

  // await addBottlersQuery.run(client, {
  //   bottlers: [{name: 'Murray McDavid'}],
  // });

  // // add bottlings and bottles
  // await e.delete(e.Tasting).run(client);
  // await e.delete(e.Bottling).run(client);

  // let addBottlingsQuery = e.params({bottlings: e.json}, (parameters) =>
  //   e.for(e.json_array_unpack(parameters.bottlings), (bottling) =>
  //     e.insert(e.Bottling, {
  //       type: e.cast(e.BottlingType, bottling.type),
  //       brand: e.cast(e.str, bottling.brand),
  //       distilleries: e.select(e.Distillery, (distillery) => ({
  //         filter: e.op(distillery.name, '=', e.cast(e.str, bottling.distilleryName)),
  //         limit: 1,
  //       })),
  //       bottler: e.assert_single(
  //         e.select(e.Bottler, (bottler) => ({
  //           filter: e.op(bottler.name, '=', e.cast(e.str, bottling.bottlerName)),
  //           limit: 1,
  //         })),
  //       ),
  //       country: e.cast(e.str, bottling.country),
  //       region: e.cast(e.str, bottling.region),

  //       displayNameParts: e.cast(e.array(e.str), bottling.displayNameParts),
  //       name: e.cast(e.str, bottling.name),
  //       subtitle: e.cast(e.str, bottling.subtitle),
  //       batchName: e.cast(e.str, bottling.batchName),
  //       batchSubtitle: e.cast(e.str, bottling.batchSubtitle),
  //       batchNumber: e.cast(e.int64, bottling.batchNumber),
  //       series: e.cast(e.str, bottling.series),
  //       seriesEntryName: e.cast(e.str, bottling.seriesEntryName),
  //       seriesEntryNumber: e.cast(e.int64, bottling.seriesEntryNumber),

  //       vintage: e.cast(e.str, bottling.vintage),
  //       parsedVintageParts: e.cast(e.array(e.int64), bottling.parsedVintageParts),
  //       bottled: e.cast(e.str, bottling.bottled),
  //       parsedBottledParts: e.cast(e.array(e.int64), bottling.parsedBottledParts),
  //       statedAge: e.cast(e.int64, bottling.statedAge),
  //       computedAge: e.cast(e.float64, bottling.computedAge),

  //       caskTypes: e.cast(e.array(e.str), bottling.caskTypes),
  //       caskNumbers: e.cast(e.array(e.str), bottling.caskNumbers),
  //       bottlesCount: e.cast(e.int64, bottling.bottlesCount),

  //       strength: e.cast(e.float64, bottling.strength),

  //       isNonColored: e.cast(e.bool, bottling.isNonColored),
  //       isNonChillFiltered: e.cast(e.bool, bottling.isNonChillFiltered),
  //       isCaskStrength: e.cast(e.bool, bottling.isCaskStrength),
  //       isSingleCask: e.cast(e.bool, bottling.isSingleCask),

  //       label: e.cast(e.str, bottling.label),
  //       bottledFor: e.cast(e.str, bottling.bottledFor),
  //       links: e.cast(e.array(e.str), bottling.caskTypes),

  //       bottles: e.insert(e.Bottle, {
  //         bottleNumber: e.cast(e.int64, bottling.bottle.bottleNumber),
  //         bottleCode: e.cast(e.str, bottling.bottle.bottleCode),
  //         barCode: e.cast(e.str, bottling.bottle.barCode),
  //         whiskybaseId: e.cast(e.str, bottling.bottle.whiskybaseId),
  //         price: e.cast(e.tuple({value: e.float64, currency: e.str}), bottling.bottle.price),
  //       }),
  //     }),
  //   ),
  // );

  // let bottlings = await addBottlingsQuery.run(client, {
  //   bottlings: rawBottlings,
  // });
  // let bottles = await e
  //   .select(e.Bottle, (bottle) => ({
  //     id: true,
  //     price: true,
  //     bottling: {
  //       id: true,
  //     },
  //     filter: e.op(
  //       e.op(bottle.bottling.id, '=', e.cast(e.uuid, bottlings[0].id)),
  //       'or',
  //       e.op(bottle.bottling.id, '=', e.cast(e.uuid, bottlings[1].id)),
  //     ),
  //   }))
  //   .run(client);

  // // add tastings
  // await e.delete(e.Tasting).run(client);

  // let addTastingsQuery = e.params({tastings: e.json}, (parameters) =>
  //   e.for(e.json_array_unpack(parameters.tastings), (tasting) =>
  //     e.insert(e.Tasting, {
  //       sampleType: e.cast(e.SampleType, tasting.sampleType),
  //       sampleSize: e.cast(e.float64, tasting.sampleSize),
  //       nose: e.cast(e.str, tasting.nose),
  //       noseWithWater: e.cast(e.str, tasting.noseWithWater),
  //       taste: e.cast(e.str, tasting.taste),
  //       tasteWithWater: e.cast(e.str, tasting.tasteWithWater),
  //       finish: e.cast(e.str, tasting.finish),
  //       finishWithWater: e.cast(e.str, tasting.finishWithWater),
  //       rating: e.cast(e.tuple([e.float64, e.float64, e.float64, e.float64]), tasting.rating),
  //       tastedAt: e.cast(e.datetime, tasting.tastedAt),

  //       price: e.cast(e.tuple({value: e.float64, currency: e.str}), tasting.price),

  //       bottle: e.select(e.Bottle, (bottle) => ({
  //         filter: e.op(bottle.id, '=', e.cast(e.uuid, tasting.bottleId)),
  //       })),
  //     }),
  //   ),
  // );

  // await addTastingsQuery.run(client, {
  //   tastings: [
  //     {
  //       sampleType: SampleType.Dram,
  //       sampleSize: 0.02,
  //       nose: 'Lorem ipusm',
  //       noseWithWater: null,
  //       taste: 'Lorem ipusm',
  //       tasteWithWater: null,
  //       finish: 'Lorem ipusm',
  //       finishWithWater: null,
  //       rating: [23.5, 22.5, 23.75, 20.75],
  //       tastedAt: new Date('2022-09-01 18:30'),

  //       price: {
  //         value: 200,
  //         currency: 'CZK',
  //       },

  //       bottleId: bottles[0].id,
  //     },
  //   ],
  // });

  console.log('Database has been seeded!');
}

seed()
  .catch((error: unknown) => {
    console.error(error);

    process.exitCode = 1;
  })
  .finally(() => {
    // void client.close();
  });
