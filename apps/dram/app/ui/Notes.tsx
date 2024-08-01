import {type Note} from '../db.js';

const WHISKYBASE_ID_REGEXP = /(?!\/)\d+(?=\/)/;

export type NotesProps = {
  notes: Note[];
};

export function Notes({notes}: NotesProps) {
  return (
    <div className="w-full overflow-y-visible overflow-x-scroll text-xs [scrollbar-color:theme(colors.gray.200)_transparent] [scrollbar-width:thin]">
      <table>
        <thead>
          <tr>
            <th className="whitespace-nowrap p-2 text-left">#</th>
            <th className="whitespace-nowrap p-2 text-left">Bottle ID</th>
            <th className="whitespace-nowrap p-2 text-left">Whisky ID</th>
            <th className="whitespace-nowrap p-2 text-left">Brand</th>
            <th className="whitespace-nowrap p-2 text-left">Distillery</th>
            <th className="whitespace-nowrap p-2 text-left">Bottler</th>
            <th className="whitespace-nowrap p-2 text-left">Name</th>
            <th className="whitespace-nowrap p-2 text-left">Edition</th>
            <th className="whitespace-nowrap p-2 text-left">Batch</th>
            <th className="whitespace-nowrap p-2 text-left">Age</th>
            <th className="whitespace-nowrap p-2 text-left">Vintage</th>
            <th className="whitespace-nowrap p-2 text-left">Bottled</th>
            <th className="whitespace-nowrap p-2 text-left">Cask type</th>
            <th className="whitespace-nowrap p-2 text-left">Cask number</th>
            <th className="whitespace-nowrap p-2 text-left">Strength</th>
            <th className="whitespace-nowrap p-2 text-left">Size</th>
            <th className="whitespace-nowrap p-2 text-left">Bottles count</th>
            <th className="whitespace-nowrap p-2 text-left">Nose</th>
            <th className="whitespace-nowrap p-2 text-left">Taste</th>
            <th className="whitespace-nowrap p-2 text-left">Finish</th>
            <th className="whitespace-nowrap p-2 text-left">Balance</th>
            <th className="whitespace-nowrap p-2 text-left">Rating</th>
            <th className="whitespace-nowrap p-2 text-left">Score</th>
            <th className="whitespace-nowrap p-2 text-left">Tasted at</th>
            <th className="whitespace-nowrap p-2 text-left">Tasting location</th>
            <th className="whitespace-nowrap p-2 text-left">Color</th>
            <th className="whitespace-nowrap p-2 text-left">Nose</th>
            <th className="whitespace-nowrap p-2 text-left">Taste</th>
            <th className="whitespace-nowrap p-2 text-left">Finish</th>
            <th className="whitespace-nowrap p-2 text-left">Barcode</th>
            <th className="whitespace-nowrap p-2 text-left">Bottle number</th>
            <th className="whitespace-nowrap p-2 text-left">Bottle code</th>
            <th className="whitespace-nowrap p-2 text-left">Bought at</th>
            <th className="whitespace-nowrap p-2 text-left">Whiskybase ID</th>
          </tr>
        </thead>

        <tbody>
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
              <tr key={id}>
                <td className="whitespace-nowrap p-2 tabular-nums">{order}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{bottleId}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{whiskyId}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{brand}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{distillery}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{bottler}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{name}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{edition}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{batch}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{age}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{vintage}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{bottled}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{caskType}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{caskNumber}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{strength}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{size}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{bottlesCount}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{noseRating}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{tasteRating}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{finishRating}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{balanceRating}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{rating}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{score}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{tastedAt?.toString()}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{tastingLocation}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{color}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{nose}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{taste}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{finish}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{barCode}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{bottleNumber}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{bottleCode}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">{boughtAt?.toString()}</td>
                <td className="whitespace-nowrap p-2 tabular-nums">
                  {whiskybaseUrl ?
                    <a
                      href={whiskybaseUrl}
                    >{`WB${WHISKYBASE_ID_REGEXP.exec(whiskybaseUrl)?.[0] ?? ''}`}</a>
                  : null}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
