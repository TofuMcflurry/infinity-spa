import { Link } from "@inertiajs/react"
import heroImage from "@/assets/hero-spa.jpg";
import { Sparkles } from "lucide-react";
import { Button } from "@/Components/Landing/ui/button";

export const Hero = () => {
  return (
    <section
      id="home"
      className="relative min-h-screen w-full overflow-hidden pt-20"
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Luxury home spa therapist preparing a treatment with rose petals and candles"
          width={1920}
          height={1080}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 bg-radial-gold" />
      </div>

      <div className="container relative z-10 flex min-h-[calc(100vh-5rem)] flex-col items-start justify-center py-20">
        <div className="max-w-3xl animate-fade-up">
          <span className="gold-divider mb-6 text-xs uppercase tracking-[0.3em] text-primary">
            <Sparkles className="h-3 w-3" /> Dubai · Est. 2024
          </span>

          <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            Dubai's Premier
            <br />
            <span className="text-gradient-gold italic">Home Spa</span> Experience
          </h1>

          <p className="mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl">
            World-class wellness treatments, delivered to your home by licensed
            therapists. Privacy, indulgence, and serenity — on your schedule.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Button variant="luxe" size="xl" asChild>
              <a href="#booking">Book Now</a>
            </Button>
            <Button variant="outlineGold" size="xl" asChild>
              <Link href="/login">
                Member Login
              </Link>
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 border-t border-border/40 pt-8 max-w-md">
            {[
              { k: "10K+", v: "Happy Clients" },
              { k: "50+", v: "Therapists" },
              { k: "4.9★", v: "Rating" },
            ].map((s) => (
              <div key={s.v}>
                <div className="font-display text-3xl text-gradient-gold">{s.k}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
