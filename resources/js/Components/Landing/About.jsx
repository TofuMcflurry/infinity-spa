import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import heroImage from "@/assets/hero-spa.jpg";

const points = [
  "DHA-licensed, vetted professionals",
  "Premium organic oils & products",
  "Discreet, female & male therapists",
  "Same-day booking across Dubai",
];

export const About = () => {
  return (
    <section id="about" className="relative py-24">
      <div className="container">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative">
            <div className="relative overflow-hidden rounded-3xl border border-primary/30 shadow-luxe">
              <img
                src={heroImage}
                alt="Infinity Home Spa luxury treatment"
                loading="lazy"
                width={1920}
                height={1080}
                className="aspect-[4/5] w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-background/60 to-transparent" />
            </div>
            <div className="absolute -bottom-6 -right-6 hidden h-40 w-40 rounded-2xl bg-gradient-gold p-1 shadow-gold sm:block">
              <div className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-background text-center">
                <div className="font-display text-4xl text-gradient-gold">5★</div>
                <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                  Concierge
                </div>
              </div>
            </div>
          </div>

          <div>
            <span className="gold-divider text-xs uppercase tracking-[0.3em] text-primary">
              About Us
            </span>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl">
              Wellness, <span className="italic text-gradient-gold">redefined</span> at home.
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              Infinity Home Spa was born in Dubai with one belief: true luxury
              is privacy. We bring the world's most refined wellness rituals to
              your home — every detail, from candles to silk linens, prepared
              for you.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap gap-4">
              <Button variant="luxe" size="lg" asChild>
                <a href="#booking">Book a Session</a>
              </Button>
              <Button variant="outlineGold" size="lg" asChild>
                <a href="#services">Explore Services</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
