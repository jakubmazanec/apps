import {Button, Icon, Spinner} from '@jakubmazanec/ui';
import {NavLink} from '@remix-run/react';

import {tailwindMerge} from '../utilities.js';

export type PaginationProps = {
  currentPage: number;
  pagesCount: number;
  pageLink: string;
};

export function Pagination({currentPage, pagesCount, pageLink}: PaginationProps) {
  let pageButtons = Array.from({length: pagesCount}).map((_, index) => (
    <Button
      // eslint-disable-next-line react/no-array-index-key -- needed, there is no other value
      key={index}
      as={NavLink}
      variant={currentPage === index + 1 ? 'solid' : 'outline'}
      to={`${pageLink}${index + 1}`}
      className={tailwindMerge(
        'group/page tabular-nums',
        currentPage === index + 1 ? 'pointer-events-none' : null,
      )}
    >
      <span className="group-[.pending]/page:hidden">{index + 1}</span>
      <Spinner className="hidden group-[.pending]/page:inline-block" />
    </Button>
  ));

  return (
    <div className="flex flex-wrap gap-x-1 gap-y-1">
      <Button
        as={NavLink}
        variant="outline"
        to={`${pageLink}${Math.max(1, currentPage - 1)}`}
        disabled={currentPage <= 1}
        className="group/previous"
      >
        <Icon name="ArrowLongLeft" className="inline-block group-[.pending]/previous:hidden" />
        <Spinner className="hidden group-[.pending]/previous:inline-block" />
        Previous
      </Button>
      {pageButtons}
      <Button
        as={NavLink}
        variant="outline"
        to={`${pageLink}${Math.min(Math.max(pagesCount, 1), currentPage + 1)}`} // if there are no pages, let's default to 1
        disabled={currentPage >= pagesCount}
        className="group/next"
      >
        Next
        <Icon name="ArrowLongRight" className="inline-block group-[.pending]/next:hidden" />
        <Spinner className="hidden group-[.pending]/next:inline-block" />
      </Button>
    </div>
  );
}
