import { cn } from '~/lib/utils';

export const Table = ({ className, ...props }: React.ComponentProps<'table'>) => (
  <div data-slot="table-container" className="relative w-full overflow-x-auto">
    <table
      data-slot="table"
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
);

export const TableHeader = ({ className, ...props }: React.ComponentProps<'thead'>) => (
  <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
);

export const TableBody = ({ className, ...props }: React.ComponentProps<'tbody'>) => (
  <tbody
    data-slot="table-body"
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
);

export const TableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => (
  <tr
    data-slot="table-row"
    className={cn('hover:bg-muted/50 border-b transition-colors', className)}
    {...props}
  />
);

export const TableHead = ({ className, ...props }: React.ComponentProps<'th'>) => (
  <th
    data-slot="table-head"
    className={cn(
      'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap',
      className,
    )}
    {...props}
  />
);

export const TableCell = ({ className, ...props }: React.ComponentProps<'td'>) => (
  <td
    data-slot="table-cell"
    className={cn('p-2 align-middle whitespace-nowrap', className)}
    {...props}
  />
);
