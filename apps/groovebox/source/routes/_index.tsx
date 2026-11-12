import {useEffect, useRef} from 'react';
import {type MetaFunction} from 'react-router';

export const meta: MetaFunction = () => [
  {title: 'Hello, world!'},
  {name: 'description', content: 'Hello world page.'},
];

export default function Index() {
  let canvas = useRef<HTMLCanvasElement>(null);
  let status = useRef<HTMLParagraphElement>(null);
  let note = useRef<HTMLParagraphElement>(null);
  let save = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let shell = import('../shell/shell.js').then(async ({runShell}) =>
      runShell({
        canvas: canvas.current as HTMLCanvasElement,
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
    <main className="flex flex-wrap items-start gap-4">
      <canvas ref={canvas} aria-label="Screen" height={272} width={480} />
      <div className="flex flex-col gap-2">
        <p ref={status} />
        <p ref={note} />
        <button ref={save} type="button">
          Save session
        </button>
      </div>
    </main>
  );
}
