import Link from 'next/link';
import Footer from '@/core/components/Footer';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-12 text-center">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-extrabold text-brand sm:text-5xl">
          🔐 Escape Room de Inglés
        </h1>
        <p className="text-lg text-muted">Practica inglés en grupo, en tiempo real.</p>
      </div>

      <nav className="flex w-full max-w-xs flex-col gap-4">
        <Link
          href="/host"
          className="rounded-xl bg-brand px-6 py-4 font-display font-bold text-brand-foreground shadow-sm transition hover:opacity-90"
        >
          Soy el host 🖥️
        </Link>
        <Link
          href="/play"
          className="rounded-xl border-2 border-brand px-6 py-4 font-display font-bold text-brand transition hover:bg-brand/5"
        >
          Soy jugador 📱
        </Link>
      </nav>

      <Footer />
    </main>
  );
}
