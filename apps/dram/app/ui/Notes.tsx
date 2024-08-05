import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@jakubmazanec/ui';

import {type Note} from '../db.js';

const WHISKYBASE_ID_REGEXP = /(?!\/)\d+(?=\/)/;

export type NotesProps = {
  notes: Array<Omit<Note, 'owner'>>;
};

export function Notes({notes}: NotesProps) {
  return (
    <div className="w-full overflow-y-visible overflow-x-scroll text-xs [scrollbar-color:theme(colors.gray.200)_transparent] [scrollbar-width:thin]">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>#</TableHeader>
            <TableHeader>Bottle ID</TableHeader>
            <TableHeader>Whisky ID</TableHeader>
            <TableHeader>Brand</TableHeader>
            <TableHeader>Distillery</TableHeader>
            <TableHeader>Bottler</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader>Edition</TableHeader>
            <TableHeader>Batch</TableHeader>
            <TableHeader>Age</TableHeader>
            <TableHeader>Vintage</TableHeader>
            <TableHeader>Bottled</TableHeader>
            <TableHeader>Cask type</TableHeader>
            <TableHeader>Cask number</TableHeader>
            <TableHeader>Strength</TableHeader>
            <TableHeader>Size</TableHeader>
            <TableHeader>Bottles count</TableHeader>
            <TableHeader>Nose</TableHeader>
            <TableHeader>Taste</TableHeader>
            <TableHeader>Finish</TableHeader>
            <TableHeader>Balance</TableHeader>
            <TableHeader>Rating</TableHeader>
            <TableHeader>Score</TableHeader>
            <TableHeader>Tasted at</TableHeader>
            <TableHeader>Tasting location</TableHeader>
            <TableHeader>Color</TableHeader>
            <TableHeader>Nose</TableHeader>
            <TableHeader>Taste</TableHeader>
            <TableHeader>Finish</TableHeader>
            <TableHeader>Barcode</TableHeader>
            <TableHeader>Bottle number</TableHeader>
            <TableHeader>Bottle code</TableHeader>
            <TableHeader>Bought at</TableHeader>
            <TableHeader>Whiskybase ID</TableHeader>
          </TableRow>
        </TableHead>

        <TableBody>
          {notes.map(
            ({
              id,
              age,
              balanceRating,
              barCode,
              batch,
              bottleCode,
              bottleId,
              bottled,
              bottler,
              bottlesCount,
              boughtAt,
              brand,
              caskNumber,
              caskType,
              color,
              distillery,
              edition,
              finish,
              finishRating,
              name,
              nose,
              noseRating,
              order,
              rating,
              score,
              size,
              strength,
              taste,
              tasteRating,
              tastedAt,
              tastingLocation,
              vintage,
              whiskyId,
              whiskybaseUrl,
              bottleNumber,
            }) => (
              <TableRow key={id}>
                <TableCell>{order}</TableCell>
                <TableCell>{bottleId}</TableCell>
                <TableCell>{whiskyId}</TableCell>
                <TableCell>{brand}</TableCell>
                <TableCell>{distillery}</TableCell>
                <TableCell>{bottler}</TableCell>
                <TableCell>{name}</TableCell>
                <TableCell>{edition}</TableCell>
                <TableCell>{batch}</TableCell>
                <TableCell>{age}</TableCell>
                <TableCell>{vintage}</TableCell>
                <TableCell>{bottled}</TableCell>
                <TableCell>{caskType}</TableCell>
                <TableCell>{caskNumber}</TableCell>
                <TableCell>{strength}</TableCell>
                <TableCell>{size}</TableCell>
                <TableCell>{bottlesCount}</TableCell>
                <TableCell>{noseRating}</TableCell>
                <TableCell>{tasteRating}</TableCell>
                <TableCell>{finishRating}</TableCell>
                <TableCell>{balanceRating}</TableCell>
                <TableCell>{rating}</TableCell>
                <TableCell>{score}</TableCell>
                <TableCell>{tastedAt?.toString()}</TableCell>
                <TableCell>{tastingLocation}</TableCell>
                <TableCell>{color}</TableCell>
                <TableCell>{nose}</TableCell>
                <TableCell>{taste}</TableCell>
                <TableCell>{finish}</TableCell>
                <TableCell>{barCode}</TableCell>
                <TableCell>{bottleNumber}</TableCell>
                <TableCell>{bottleCode}</TableCell>
                <TableCell>{boughtAt?.toString()}</TableCell>
                <TableCell>
                  {whiskybaseUrl ?
                    <a
                      href={whiskybaseUrl}
                    >{`WB${WHISKYBASE_ID_REGEXP.exec(whiskybaseUrl)?.[0] ?? ''}`}</a>
                  : null}
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
