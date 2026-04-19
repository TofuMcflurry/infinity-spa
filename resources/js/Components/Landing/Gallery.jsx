import gallery1 from "@/assets/gallery-1.jpg";
import gallery2 from "@/assets/gallery-2.jpg";
import gallery3 from "@/assets/gallery-3.jpg";
import gallery4 from "@/assets/gallery-4.jpg";

const images = [
  { src: gallery1, alt: "Hot stone massage tray with candles" },
  { src: gallery3, alt: "Royal Moroccan hammam interior" },
  { src: gallery2, alt: "Luxury skincare flat lay with jade roller" },
  { src: gallery4, alt: "Premium aromatherapy oils on dark marble" },
];

export const Gallery = () => {
  return (
    <section id="gallery" className="relative border-y border-border/40 bg-card/40 py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <span className="gold-divider text-xs uppercase tracking-[0.3em] text-primary">
            Inside the Experience
          </span>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl text-foreground">
            A Glimpse of <span className="italic text-gradient-gold">Serenity</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={img.src}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-border/50"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                width={1024}
                height={1024}
                className="h-full w-full object-cover transition-smooth duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 transition-smooth group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
