export default function PinDisplay({ pin }: { pin: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface border border-border px-8 py-6">
      <p className="font-display text-sm font-bold uppercase tracking-widest text-muted">
        Room PIN
      </p>
      <p
        aria-label="Room PIN"
        className="font-display text-6xl font-extrabold tracking-[0.2em] text-brand sm:text-7xl"
      >
        {pin}
      </p>
    </div>
  );
}
