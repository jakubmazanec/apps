import data from '../data.json';
import {noteSchema} from '../Note.js';
import {Notes} from '../ui.js';
import {type Route} from './+types/notes.js';

export const loader = async () => {
  let notes = noteSchema.array().parse(data);

  return {
    notes,
  };
};

export default function NotesRoute({loaderData}: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-y-6 p-4">
      <Notes notes={loaderData.notes} />
    </div>
  );
}
