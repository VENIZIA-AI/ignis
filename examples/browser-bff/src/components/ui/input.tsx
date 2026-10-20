import { Input as BaseInput } from '@base-ui-components/react/input';
import { cn } from '~/lib/utils';

export const Input = ({ className, ...props }: React.ComponentProps<typeof BaseInput>) => {
  return (
    <BaseInput
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
        'placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        className,
      )}
      {...props}
    />
  );
};
