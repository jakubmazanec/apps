import {type MetaFunction} from 'react-router';

import {STATES} from '../gallery/states.js';

export const meta: MetaFunction = () => [{title: 'Groovebox screen gallery'}];

const urls = import.meta.glob(
  [
    '../../../../packages/groovebox-core/scenes/**/*.png',
    '../../../../docs/superpowers/specs/2026-11-07-groovebox-look/*.png',
  ],
  {eager: true, query: '?url', import: 'default'},
);

function urlOf(path: string) {
  let url = urls[path];

  if (url === undefined) {
    throw new Error(`The gallery has no file ${path}`);
  }

  return url;
}

// Every picture at 2 CSS pixels per screen pixel. The page scrolls
export default function Gallery() {
  return (
    <main className="min-h-screen w-max min-w-full bg-[#f0f0ec] p-4">
      <h1 className="text-xl">Screen gallery</h1>
      <p>
        On the left the frame from the core, on the right the picture Look approved, when there is
        one. Look&apos;s pictures also show other sounds, tracks and a transport group, so only the
        parts both pictures show must match.
      </p>
      {STATES.map((state) => (
        <section key={state.frame} className="mt-6">
          <h2>{state.title}</h2>
          <div className="mt-2 flex gap-4">
            <img
              alt={state.title}
              className="h-[544px] w-[960px] max-w-none shrink-0 [image-rendering:pixelated]"
              src={urlOf(`../../../../packages/groovebox-core/scenes/${state.frame}`)}
            />
            {state.approved === undefined ? null : (
              <img
                src={urlOf(
                  `../../../../docs/superpowers/specs/2026-11-07-groovebox-look/${state.approved}`,
                )}
                alt={`${state.title}, as Look drew it`}
                className="h-[544px] w-[960px] max-w-none shrink-0 [image-rendering:pixelated]"
              />
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
