import {
  type DataTablePagination,
  dataTablePaginationSchema,
  type DataTableSorting,
  dataTableSortingSchema,
} from '@jakubmazanec/ui';
import {json, type LoaderFunctionArgs} from '@remix-run/node';
import {useLoaderData, useSearchParams} from '@remix-run/react';
import {useCallback} from 'react';

import {e} from '../db.js';
import {auth} from '../services/auth.server.js';
import {Notes} from '../ui.js';

function parsePagination(value: string | null): DataTablePagination {
  let result: DataTablePagination = {
    page: 1,
    pageSize: 10,
    pageCount: 1,
  };

  if (!value) {
    return result;
  }

  try {
    result = dataTablePaginationSchema.parse(JSON.parse(value));
  } catch {
    // no-op
  }

  return result;
}

function parseSorting(value: string | null): DataTableSorting {
  let result: DataTableSorting = false;

  if (!value) {
    return result;
  }

  try {
    result = dataTableSortingSchema.parse(JSON.parse(value));
  } catch {
    // no-op
  }

  return result;
}

export const loader = async ({request}: LoaderFunctionArgs) => {
  let url = new URL(request.url);
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();

  if (!isSignedIn) {
    return json({isSignedIn});
  }

  let pagination = parsePagination(url.searchParams.get('pagination'));
  let sorting = parseSorting(url.searchParams.get('sorting'));
  let noteCount = await e.count(e.Note).run(session.client);
  let notes = await e
    .select(e.Note, (note) => ({
      ...e.Note['*'],
      offset: Math.max((pagination.page - 1) * pagination.pageSize, 0), // offset cannot be lower than 0
      limit: pagination.pageSize,
      order_by:
        sorting ?
          {
            // TODO: fix
            // @ts-expect-error
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO
            expression: note[sorting.column],
            direction: sorting.direction === 'ascending' ? e.ASC : e.DESC,
          }
        : undefined,
    }))
    .run(session.client);

  return json({
    isSignedIn,
    notes,
    currentPage: pagination.page,
    pageCount:
      Math.trunc(noteCount / pagination.pageSize) + (noteCount % pagination.pageSize > 0 ? 1 : 0),
  });
};

export default function NotesRoute() {
  let data = useLoaderData<typeof loader>();
  let [searchParameters, setSearchParameters] = useSearchParams();

  let pagination = parsePagination(searchParameters.get('pagination'));
  let sorting = parseSorting(searchParameters.get('sorting'));

  let handlePagination = useCallback(
    (newPagination: Pick<DataTablePagination, 'page'> | Pick<DataTablePagination, 'pageSize'>) => {
      setSearchParameters((previous) => {
        previous.set('pagination', JSON.stringify({...pagination, ...newPagination}));

        return previous;
      });
    },
    [pagination, setSearchParameters],
  );

  let handleSorting = useCallback(
    (sorting: DataTableSorting) => {
      if (sorting === false) {
        setSearchParameters((previous) => {
          previous.delete('sorting');

          return previous;
        });
      } else {
        setSearchParameters((previous) => {
          previous.set('sorting', JSON.stringify(sorting));

          return previous;
        });
      }
    },
    [setSearchParameters],
  );

  return data.isSignedIn ?
      <div className="flex flex-col gap-y-6 p-4">
        <Notes
          notes={data.notes}
          pagination={{...pagination, pageCount: data.pageCount}}
          sorting={sorting}
          onPagination={handlePagination}
          onSorting={handleSorting}
        />
      </div>
    : null;
}
