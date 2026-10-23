import { nothingDueLines } from '../lib/format';

/** « Rien à réviser pour le moment ! », and on its own line when the next review is due. */
export function NothingDue({
  due,
  now,
  className,
}: {
  due: { nextDueAt: string | null };
  now: Date;
  className: string;
}) {
  const [nothing, next] = nothingDueLines(due, now);
  return (
    <p className={className}>
      {nothing}
      {next && (
        <>
          <br />
          {next}
        </>
      )}
    </p>
  );
}
