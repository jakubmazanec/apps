import {Button, Icon, Spinner} from '@jakubmazanec/ui';
import {NavLink} from '@remix-run/react';

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
      className="group/page tabular-nums"
      to={`${pageLink}${index + 1}`}
      variant={currentPage === index + 1 ? 'solid' : 'outline'}
    >
      <span className="group-[.pending]/page:hidden">{index + 1}</span>
      <Spinner className="hidden group-[.pending]/page:inline-block" />
    </Button>
  ));

  return (
    <div className="flex flex-wrap gap-x-1 gap-y-1">
      <Button
        as={NavLink}
        className="group/previous"
        disabled={currentPage <= 1}
        to={`${pageLink}${Math.max(1, currentPage - 1)}`}
        variant="outline"
      >
        <Icon className="inline-block group-[.pending]/previous:hidden" name="ArrowLongLeft" />
        <Spinner className="hidden group-[.pending]/previous:inline-block" />
        Previous
      </Button>
      {pageButtons}
      <Button
        as={NavLink}
        className="group/next"
        disabled={currentPage >= pagesCount}
        to={`${pageLink}${Math.min(pagesCount, currentPage + 1)}`}
        variant="outline"
      >
        Next
        <Icon className="inline-block group-[.pending]/next:hidden" name="ArrowLongRight" />
        <Spinner className="hidden group-[.pending]/next:inline-block" />
      </Button>
    </div>
  );
}
