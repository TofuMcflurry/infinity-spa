import { Link } from "@inertiajs/react";
import { useEffect } from "react";
import spaHero from "@/assets/spa-hero.jpg";

const Index = () => {
  // ── Force dark theme on welcome page always ──────────────────────────────
  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: '#0b0c0e' }}>
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${spaHero})` }}
      />
      {/* Dark overlay — hardcoded, not CSS variable */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(11,12,14,0.7), rgba(11,12,14,0.5), rgba(11,12,14,0.8))' }}
      />
      {/* Mashrabiya pattern */}
      <div className="absolute inset-0 mashrabiya-pattern" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto">
        {/* Logo / Brand */}
        <p className="font-accent text-champagne tracking-[0.4em] uppercase text-sm mb-4 animate-fade-up">
          Infinity Home Spa
        </p>

        {/* Headline */}
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-tight mb-6 text-shimmer animate-fade-up-delay-1">
          Dubai's Premier<br />Home Spa Experience
        </h1>

        {/* Subtext */}
        <p className="font-accent text-lg sm:text-xl text-champagne/80 max-w-xl mb-10 animate-fade-up-delay-2 italic">
          Indulge in world-class wellness treatments, delivered to the sanctuary of your home
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 animate-fade-up-delay-3">
          <Link
            href={route('register')}
            className="px-10 py-4 bg-primary text-primary-foreground font-body text-sm tracking-[0.2em] uppercase rounded-sm glow-gold-strong hover:scale-105 transition-all duration-300"
          >
            Explore Services
          </Link>
          <Link
            href={route('login')}
            className="px-10 py-4 border border-gold/40 text-gold font-body text-sm tracking-[0.2em] uppercase rounded-sm glass hover:border-gold/70 hover:glow-gold transition-all duration-300"
          >
            Member Login
          </Link>
        </div>
      </div>

      {/* Bottom decorative line */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-20 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
    </div>
  );
};

export default Index;