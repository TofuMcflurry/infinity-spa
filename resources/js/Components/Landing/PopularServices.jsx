import { Link } from "@inertiajs/react"
import { Clock, Star } from "lucide-react";
import { Button } from "@/Components/Landing/ui/button";
import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";
import gallery4 from "@/assets/gallery-4.jpg";

const services = [
  {
    name: "Deep Tissue Massage",
    price: 450,
    duration: "75 min",
    rating: 4.9,
    img: gallery1,
    desc: "Targets deep muscle layers — perfect after intense workouts or stress.",
  },
  {
    name: "Royal Hammam Ritual",
    price: 780,
    duration: "120 min",
    rating: 5.0,
    img: gallery3,
    desc: "Authentic Moroccan steam, exfoliation and silk-soft skin treatment.",
  },
  {
    name: "Luxury Gold Facial",
    price: 620,
    duration: "90 min",
    rating: 4.9,
    img: gallery2,
    desc: "24K gold infusion with jade roller therapy for radiant, lifted skin.",
  },
  {
    name: "Swedish Massage",
    price: 380,
    duration: "60 min",
    rating: 4.8,
    img: gallery4,
    desc: "Classic flowing strokes to ease tension and restore complete calm.",
  },
];

export const Services = () => {
  return (
    <section id="services" className="relative py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <span className="gold-divider text-xs uppercase tracking-[0.3em] text-primary">
            Signature Treatments
          </span>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl">
            Popular <span className="italic text-gradient-gold">Services</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Curated rituals designed by world-class therapists, delivered with
            Emirati hospitality.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <article
              key={s.name}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card transition-smooth hover:-translate-y-1 hover:border-primary/50 hover:shadow-luxe"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={s.img}
                  alt={s.name}
                  loading="lazy"
                  width={1024}
                  height={768}
                  className="h-full w-full object-cover transition-smooth duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-primary/40 bg-background/80 px-2.5 py-1 text-xs backdrop-blur">
                  <Star className="h-3 w-3 fill-primary text-primary" />
                  <span className="font-medium">{s.rating}</span>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-xl font-medium leading-snug">
                  {s.name}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {s.desc}
                </p>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {s.duration}
                  </div>
                  <div className="font-display text-2xl text-gradient-gold">
                    AED {s.price}
                  </div>
                </div>

                <Button variant="luxe" className="mt-5 w-full" asChild>
                  <a href="#booking">Book Now</a>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
