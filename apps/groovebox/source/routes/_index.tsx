import {useEffect, useRef} from 'react';
import {type MetaFunction} from 'react-router';

export const meta: MetaFunction = () => [
  {title: 'Hello, world!'},
  {name: 'description', content: 'Hello world page.'},
];

export default function Index() {
  let canvas = useRef<HTMLCanvasElement>(null);
  let controls = useRef<HTMLDivElement>(null);
  let status = useRef<HTMLParagraphElement>(null);
  let note = useRef<HTMLParagraphElement>(null);
  let save = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let shell = import('../shell/shell.js').then(async ({runShell}) =>
      runShell({
        canvas: canvas.current as HTMLCanvasElement,
        controls: controls.current as HTMLDivElement,
        status: status.current as HTMLParagraphElement,
        note: note.current as HTMLParagraphElement,
        save: save.current as HTMLButtonElement,
      }),
    );

    return () => {
      void shell.then(({stop}) => {
        stop();
      });
    };
  }, []);

  return (
    <main className="flex items-start gap-4">
      <canvas ref={canvas} aria-label="Screen" className="shrink-0" height={272} width={480} />
      <div ref={controls} className="flex w-48 shrink-0 flex-col gap-2">
        <p ref={status} />
        <p ref={note} />
        <button ref={save} type="button">
          Save session
        </button>
      </div>
    </main>
  );
}
