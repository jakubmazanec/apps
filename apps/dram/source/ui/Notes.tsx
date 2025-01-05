import {
  createColumnHelper,
  DataTable,
  type DataTableProps,
  formatDateTime,
  formatNumber,
} from '@jakubmazanec/ui';

import {type Note} from '../db.js';

const WHISKYBASE_ID_REGEXP = /(?!\/whisky\/)\d+/;

const columnHelper = createColumnHelper<Omit<Note, 'owner'>>();

let columns = [
  columnHelper.accessor('order', {header: '#'}),
  columnHelper.accessor('bottleId', {header: 'Bottle ID'}),
  columnHelper.accessor('whiskyId', {header: 'Whisky ID'}),
  columnHelper.accessor('brand', {header: 'Brand'}),
  columnHelper.accessor('distillery', {header: 'Distillery'}),
  columnHelper.accessor('bottler', {header: 'Bottler'}),
  columnHelper.accessor('name', {header: 'Name'}),
  columnHelper.accessor('edition', {header: 'Edition'}),
  columnHelper.accessor('batch', {header: 'Batch'}),
  columnHelper.accessor('age', {header: 'Age', meta: {filterVariant: 'range'}}),
  columnHelper.accessor('vintage', {header: 'Vintage'}),
  columnHelper.accessor('bottled', {header: 'Bottled'}),
  columnHelper.accessor('caskType', {header: 'Cask type'}),
  columnHelper.accessor('caskNumber', {header: 'Cask number'}),
  columnHelper.accessor('strength', {
    header: 'Strength',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(value, {
        locale: 'en-US',
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    },
  }),
  columnHelper.accessor('size', {header: 'Size'}),
  columnHelper.accessor('bottlesCount', {header: 'Bottles count'}),
  columnHelper.accessor('noseRating', {
    header: 'Nose',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(value, {
        locale: 'en-US',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
  }),
  columnHelper.accessor('tasteRating', {
    header: 'Taste',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(value, {
        locale: 'en-US',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
  }),
  columnHelper.accessor('finishRating', {
    header: 'Finish',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(value, {
        locale: 'en-US',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
  }),
  columnHelper.accessor('balanceRating', {
    header: 'Balance',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(value, {
        locale: 'en-US',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
  }),
  columnHelper.accessor('rating', {
    header: 'Rating',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(value, {
        locale: 'en-US',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
  }),
  columnHelper.accessor('score', {header: 'Score'}),
  columnHelper.accessor('tastedAt', {
    header: 'Tasted at',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatDateTime(value.toString(), {
        locale: 'en-US',
        dateStyle: 'long',
        timeStyle: 'medium',
      });
    },
  }),
  columnHelper.accessor('tastingLocation', {header: 'Tasting location'}),
  columnHelper.accessor('color', {
    header: 'Color',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatNumber(Number(value), {
        locale: 'en-US',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    },
  }),
  columnHelper.accessor('nose', {header: 'Nose'}),
  columnHelper.accessor('taste', {header: 'Taste'}),
  columnHelper.accessor('finish', {header: 'Finish'}),
  columnHelper.accessor('barCode', {header: 'Barcode'}),
  columnHelper.accessor('bottleNumber', {header: 'Bottle number'}),
  columnHelper.accessor('bottleCode', {header: 'Bottle code'}),
  columnHelper.accessor('boughtAt', {
    header: 'Bought at',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return formatDateTime(value.toString(), {
        locale: 'en-US',
        dateStyle: 'long',
        timeStyle: 'medium',
      });
    },
  }),
  columnHelper.accessor('whiskybaseUrl', {
    header: 'Whiskybase ID',
    cell: ({cell}) => {
      let value = cell.getValue();

      if (!value) {
        return null;
      }

      return <a href={value}>{`WB${WHISKYBASE_ID_REGEXP.exec(value)?.[0] ?? ''}`}</a>;
    },
  }),
];

export type NotesProps = {
  notes: Array<Omit<Note, 'owner'>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  pagination: DataTableProps<any, any>['pagination'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  onPaginationChange: DataTableProps<any, any>['onPaginationChange'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  sorting: DataTableProps<any, any>['sorting'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  onSortingChange: DataTableProps<any, any>['onSortingChange'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  filters: DataTableProps<any, any>['filters'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  onFiltersChange: DataTableProps<any, any>['onFiltersChange'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  search: DataTableProps<any, any>['search'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  onSearchChange: DataTableProps<any, any>['onSearchChange'];
};

export function Notes({
  notes,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
}: NotesProps) {
  return (
    <div className="w-full overflow-y-visible overflow-x-scroll text-xs [scrollbar-color:theme(colors.gray.200)_transparent] [scrollbar-width:thin]">
      <DataTable
        // TODO: fix
        // @ts-expect-error -- weird typing error, probably must be fixed in DataTable
        columns={columns}
        data={notes}
        filters={filters}
        pagination={pagination}
        search={search}
        sorting={sorting}
        onFiltersChange={onFiltersChange}
        onPaginationChange={onPaginationChange}
        onSearchChange={onSearchChange}
        onSortingChange={onSortingChange}
      />
    </div>
  );
}
