import {
  type DataTableFilters,
  dataTableFiltersSchema,
  type DataTablePagination,
  dataTablePaginationSchema,
  type DataTableSearch,
  dataTableSearchSchema,
  type DataTableSorting,
  dataTableSortingSchema,
} from '@jakubmazanec/ui';
import {useCallback} from 'react';
import {type LoaderFunctionArgs} from 'react-router';
import {useSearchParams} from 'react-router';

import {e} from '../db.js';
import {auth} from '../services/auth.server.js';
import {Notes} from '../ui.js';
import {type Route} from './+types/notes.js';

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
  let result: DataTableSorting = null;

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

function parseFilters(value: string | null): DataTableFilters {
  let result: DataTableFilters = null;

  if (!value) {
    return result;
  }

  try {
    result = dataTableFiltersSchema.parse(JSON.parse(value));
  } catch {
    // no-op
  }

  return result;
}

function parseSearch(value: string | null): DataTableSearch {
  let result: DataTableSearch = null;

  if (!value) {
    return result;
  }

  try {
    result = dataTableSearchSchema.parse(JSON.parse(value));
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
    return {isSignedIn};
  }

  let pagination = parsePagination(url.searchParams.get('pagination'));
  let sorting = parseSorting(url.searchParams.get('sorting'));
  let filters = parseFilters(url.searchParams.get('filters'));
  let search = parseSearch(url.searchParams.get('search'));

  // TODO: figure out a better way how to create such very dynamic queries
  let notesQuery = e.select(e.Note, (note) => {
    function createFilter(column: string, value: string) {
      if (
        column === 'bottleId' ||
        column === 'whiskyId' ||
        column === 'brand' ||
        column === 'distillery' ||
        column === 'bottler' ||
        column === 'name' ||
        column === 'edition' ||
        column === 'batch' ||
        column === 'vintage' ||
        column === 'bottled' ||
        column === 'caskType' ||
        column === 'caskNumber' ||
        column === 'tastingLocation' ||
        column === 'color' ||
        column === 'nose' ||
        column === 'taste' ||
        column === 'finish' ||
        column === 'bottleNumber' ||
        column === 'barCode' ||
        column === 'bottleCode' ||
        column === 'whiskybaseUrl'
      ) {
        return e.op(
          e.contains(e.str_lower(note[column as 'name']), value.toLowerCase()),
          '??',
          false,
        );
      }

      return e.op(
        e.contains(e.str_lower(e.to_str(note[column as 'age'])), value.toLowerCase()),
        '??',
        false,
      );
    }

    function createMinMaxFilter(
      column: string,
      min: number | null | undefined,
      max: number | null | undefined,
    ) {
      if (typeof min === 'number' && typeof max === 'number') {
        return e.op(
          e.op(e.op(note[column as 'id'], '>=', min), 'and', e.op(note[column as 'id'], '<=', max)),
          '??',
          false,
        );
      } else if (typeof min === 'number') {
        return e.op(e.op(note[column as 'id'], '>=', min), '??', false);
      } else if (typeof max === 'number') {
        return e.op(e.op(note[column as 'id'], '<=', max), '??', false);
      }

      throw new Error('Invalid filters!');
    }

    let filter;

    if (search && filters) {
      filter = e.all(
        e.set(
          ...filters.map(({column, filter}) =>
            Array.isArray(filter) ?
              createMinMaxFilter(column, filter[0], filter[1])
            : createFilter(column, String(filter)),
          ),
          // TODO: fix this
          // @ts-expect-error -- TODO
          e.any(
            e.set(
              e.ext.pg_trgm.word_similar(search, note.brand),
              e.ext.pg_trgm.word_similar(search, note.distillery),
              e.ext.pg_trgm.word_similar(search, note.name),
              e.ext.pg_trgm.word_similar(search, note.edition),
              e.ext.pg_trgm.word_similar(search, note.batch),
              e.ext.pg_trgm.word_similar(search, e.to_str(note.age)),
              e.ext.pg_trgm.word_similar(search, note.vintage),
              e.ext.pg_trgm.word_similar(search, note.bottled),
              e.ext.pg_trgm.word_similar(search, note.caskType),
              e.ext.pg_trgm.word_similar(search, note.caskNumber),
              e.ext.pg_trgm.word_similar(search, e.to_str(e.op(note.strength, '*', 100))),
            ),
          ),
        ),
      );
    } else if (search) {
      filter = e.any(
        e.set(
          e.ext.pg_trgm.word_similar(search, note.brand),
          e.ext.pg_trgm.word_similar(search, note.distillery),
          e.ext.pg_trgm.word_similar(search, note.name),
          e.ext.pg_trgm.word_similar(search, note.edition),
          e.ext.pg_trgm.word_similar(search, note.batch),
          e.ext.pg_trgm.word_similar(search, e.to_str(note.age)),
          e.ext.pg_trgm.word_similar(search, note.vintage),
          e.ext.pg_trgm.word_similar(search, note.bottled),
          e.ext.pg_trgm.word_similar(search, note.caskType),
          e.ext.pg_trgm.word_similar(search, note.caskNumber),
          e.ext.pg_trgm.word_similar(search, e.to_str(e.op(note.strength, '*', 100))),
        ),
      );
    } else if (filters) {
      filter = e.all(
        e.set(
          ...filters.map(({column, filter}) =>
            Array.isArray(filter) ?
              createMinMaxFilter(column, filter[0], filter[1])
            : createFilter(column, String(filter)),
          ),
        ),
      );
    }

    return {
      ...e.Note['*'],
      filter,
    };
  });

  let {notes, noteCount} = await e
    .select({
      noteCount: e.count(notesQuery),
      notes: e.select(notesQuery, (note) => ({
        ...e.Note['*'],
        offset: Math.max((pagination.page - 1) * pagination.pageSize, 0),
        limit: pagination.pageSize,
        order_by:
          sorting ?
            {
              expression: note[sorting.column as 'id'],
              direction: sorting.direction === 'ascending' ? e.ASC : e.DESC,
            }
          : undefined,
      })),
    })
    .run(session.client);

  // TODO: this is temporary hack, remove this
  // @ts-expect-error -- client expect dates as strings
  notes = notes.map((note) => ({
    ...note,
    tastedAt: note.tastedAt?.toString(),
    boughtAt: note.boughtAt?.toString(),
  }));

  return {
    isSignedIn,
    notes,
    currentPage: pagination.page,
    pageCount:
      Math.trunc(noteCount / pagination.pageSize) + (noteCount % pagination.pageSize > 0 ? 1 : 0),
  };
};

export default function NotesRoute({loaderData}: Route.ComponentProps) {
  let [searchParameters, setSearchParameters] = useSearchParams();

  let pagination = parsePagination(searchParameters.get('pagination'));
  let sorting = parseSorting(searchParameters.get('sorting'));
  let filters = parseFilters(searchParameters.get('filters'));
  let search = parseSearch(searchParameters.get('search'));

  let handlePaginationChange = useCallback(
    (newPagination: Pick<DataTablePagination, 'page'> | Pick<DataTablePagination, 'pageSize'>) => {
      setSearchParameters((previous) => {
        previous.set('pagination', JSON.stringify({...pagination, ...newPagination}));

        return previous;
      });
    },
    [pagination, setSearchParameters],
  );

  let handleSortingChange = useCallback(
    (sorting: DataTableSorting) => {
      if (sorting === null) {
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

  let handleFiltersChange = useCallback(
    (filters: DataTableFilters) => {
      if (filters === null) {
        setSearchParameters((previous) => {
          previous.delete('filters');

          return previous;
        });
      } else {
        setSearchParameters((previous) => {
          previous.set('filters', JSON.stringify(filters));

          return previous;
        });
      }
    },
    [setSearchParameters],
  );

  let handleSearchChange = useCallback(
    (search: DataTableSearch) => {
      if (search) {
        setSearchParameters((previous) => {
          previous.set('search', JSON.stringify(search));

          return previous;
        });
      } else {
        setSearchParameters((previous) => {
          previous.delete('search');

          return previous;
        });
      }
    },
    [setSearchParameters],
  );

  return loaderData.isSignedIn ?
      <div className="flex flex-col gap-y-6 p-4">
        <Notes
          filters={filters}
          // TODO: fix this
          // @ts-expect-error -- now that React Router serializes classes, but without their methods, and the underlying table expects just strings, we now have type and runtime errors
          notes={loaderData.notes}
          pagination={{...pagination, pageCount: loaderData.pageCount}}
          search={search}
          sorting={sorting}
          onFiltersChange={handleFiltersChange}
          onPaginationChange={handlePaginationChange}
          onSearchChange={handleSearchChange}
          onSortingChange={handleSortingChange}
        />
      </div>
    : null;
}
