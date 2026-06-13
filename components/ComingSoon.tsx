export default function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: string;
}) {
  return (
    <div className="mx-auto max-w-md px-4 pt-16 pb-24">
      <div className="rounded-sm border border-yellow-600/20 bg-zinc-50 dark:bg-black/50 p-8 text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-yellow-500">
          Coming soon
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        {phase && (
          <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {phase}
          </p>
        )}
      </div>
    </div>
  );
}
