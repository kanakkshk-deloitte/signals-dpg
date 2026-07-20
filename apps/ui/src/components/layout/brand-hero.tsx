import { useNetworkTheme } from '@/theme/theme-provider';
import { NetworkConstellation } from './network-constellation';

export function BrandHero() {
  const { theme, themeId } = useNetworkTheme();
  const isPurple = themeId === 'purple_dot';

  return (
    <div
      className={`relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 ${isPurple ? 'bg-brand-hero-soft' : 'bg-brand-hero'
        }`}
    >
      {/* Constellation illustration */}
      <NetworkConstellation
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${isPurple ? 'opacity-20' : 'opacity-60'
          }`}
      />

      {isPurple && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-brand-hero-soft-wave" />
          <div className="pointer-events-none absolute left-8 top-10 h-16 w-16 rounded-full border border-violet-300/60" />
          <div className="pointer-events-none absolute right-16 top-36 h-8 w-8 rounded-full border border-violet-300/60" />
          <div className="pointer-events-none absolute right-24 top-24 h-2 w-2 rounded-full bg-violet-300/70" />
        </>
      )}

      {/* Content stack */}
      <div className={`relative z-10 flex-1 flex flex-col justify-center py-12 ${isPurple ? 'pt-4' : ''}`}>
        <div className="max-w-md">
          <h1
            className={`mb-4 text-4xl font-bold leading-tight xl:text-5xl ${isPurple ? 'text-violet-950' : 'text-white'
              }`}
          >
            {theme.tagline.lead}{' '}
            <span className="text-brand-hero-highlight">{theme.tagline.highlight}</span>{' '}
            {theme.tagline.tail}
          </h1>
          <p className={`text-base leading-relaxed ${isPurple ? 'text-violet-900/80' : 'text-white/70'}`}>
            {theme.subline}
          </p>

          {isPurple && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-violet-300/80 bg-white/70 px-3 py-1 text-xs font-medium text-violet-900">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              Inclusive services network
            </div>
          )}
        </div>
      </div>

      {/* Stat counters — hidden when stats array is empty (populated via API later) */}
      {theme.stats.length > 0 && (
        <div className="relative z-10 grid grid-cols-4 gap-4 border-t border-white/10 pt-8">
          {theme.stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-brand-stat text-2xl font-bold leading-none">{stat.value}</p>
              <p className="mt-1 text-xs text-white/60">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
