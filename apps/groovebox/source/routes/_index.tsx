import {useEffect, useRef} from 'react';
import {type MetaFunction} from 'react-router';

export const meta: MetaFunction = () => [
  {title: 'Groovebox'},
  {
    name: 'description',
    content:
      'The groovebox panel with its screen, played with the mouse, the computer keyboard and MIDI.',
  },
];

export default function Index() {
  let panel = useRef<HTMLDivElement>(null);
  let row = useRef<HTMLDivElement>(null);
  let status = useRef<HTMLParagraphElement>(null);
  let note = useRef<HTMLParagraphElement>(null);
  let saveSession = useRef<HTMLButtonElement>(null);
  let savePicture = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let shell = import('../shell/shell.js').then(async ({runShell}) =>
      runShell({
        panel: panel.current as HTMLDivElement,
        row: row.current as HTMLDivElement,
        status: status.current as HTMLParagraphElement,
        note: note.current as HTMLParagraphElement,
        saveSession: saveSession.current as HTMLButtonElement,
        savePicture: savePicture.current as HTMLButtonElement,
      }),
    );

    return () => {
      void shell.then(({stop}) => {
        stop();
      });
    };
  }, []);

  // The panel at the top left, at whole device pixels, and under it one row of the rest. Below
  // zoom 1 the page scrolls
  return (
    <main className="min-h-screen w-max min-w-full bg-[#f0f0ec]">
      <div ref={panel} />
      <div ref={row} className="flex items-center gap-4 px-4 py-2">
        <p ref={status} />
        <p ref={note} />
        <button
          ref={saveSession}
          className="rounded border border-[#969692] bg-[#ecece8] px-2"
          type="button"
        >
          Save session
        </button>
        <button
          ref={savePicture}
          className="rounded border border-[#969692] bg-[#ecece8] px-2"
          type="button"
        >
          Save picture
        </button>
      </div>
    </main>
  );
}
