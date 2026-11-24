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

// The row's buttons, whose look the shell gives the bank card's buttons too
const BUTTON = 'rounded border border-[#969692] bg-[#ecece8] px-2';

export default function Index() {
  let panel = useRef<HTMLDivElement>(null);
  let row = useRef<HTMLDivElement>(null);
  let status = useRef<HTMLParagraphElement>(null);
  let note = useRef<HTMLParagraphElement>(null);
  let saveSession = useRef<HTMLButtonElement>(null);
  let savePicture = useRef<HTMLButtonElement>(null);
  let switchView = useRef<HTMLButtonElement>(null);
  let setSize = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let shell = import('../shell/shell.js').then(async ({runShell}) =>
      runShell({
        panel: panel.current as HTMLDivElement,
        row: row.current as HTMLDivElement,
        status: status.current as HTMLParagraphElement,
        note: note.current as HTMLParagraphElement,
        saveSession: saveSession.current as HTMLButtonElement,
        savePicture: savePicture.current as HTMLButtonElement,
        switchView: switchView.current as HTMLButtonElement,
        setSize: setSize.current as HTMLButtonElement,
      }),
    );

    return () => {
      void shell.then(({stop}) => {
        stop();
      });
    };
  }, []);

  // The panel at the top left and one row of the rest, which the shell places: in the browser view
  // both fit the window, and in the real-size view the row sits under the device and the page
  // scrolls when the device is wider than the window
  return (
    <main className="min-h-dvh w-max min-w-full bg-[#f0f0ec]">
      <div ref={panel} />
      <div ref={row} className="flex flex-wrap content-start items-center gap-x-2 gap-y-1 text-xs">
        <p ref={status} />
        <p ref={note} />
        <button ref={saveSession} className={BUTTON} type="button">
          Save session
        </button>
        <button ref={savePicture} className={BUTTON} type="button">
          Save picture
        </button>
        <button ref={switchView} className={BUTTON} type="button">
          Real size
        </button>
        <button ref={setSize} hidden className={BUTTON} type="button">
          Set size
        </button>
      </div>
    </main>
  );
}
