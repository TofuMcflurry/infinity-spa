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
    <section id="gallery" className="relative scroll-mt-16 sm:scroll-mt-20 border-y border-border/40 bg-card/40 py-10 px-5 md:py-24 md:px-0">
      <div className="md:container">
        <div className="mx-auto max-w-2xl text-center">
          <span className="gold-divider text-xs uppercase tracking-[0.3em] text-primary">
            Inside the Experience
          </span>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl text-foreground">
            A Glimpse of <span className="italic text-gradient-gold">Serenity</span>
          </h2>
        </div>

        {/* Mobile: 2-column mosaic — same 4 images, same order. */}
        <div className="mt-8 grid grid-cols-2 gap-2 md:hidden">
          <div className="row-span-2 h-[328px] overflow-hidden rounded-[12px] border border-border/50">
            <img src={images[0].src} alt={images[0].alt} loading="lazy" className="h-full w-full object-cover" />
          </div>
          <div className="h-[160px] overflow-hidden rounded-[12px] border border-border/50">
            <img src={images[1].src} alt={images[1].alt} loading="lazy" className="h-full w-full object-cover" />
          </div>
          <div className="h-[160px] overflow-hidden rounded-[12px] border border-border/50">
            <img src={images[2].src} alt={images[2].alt} loading="lazy" className="h-full w-full object-cover" />
          </div>
          <div className="col-span-2 h-[150px] overflow-hidden rounded-[12px] border border-border/50">
            <img src={images[3].src} alt={images[3].alt} loading="lazy" className="h-full w-full object-cover" />
          </div>
        </div>

        {/* Desktop/tablet (md: and up) — original grid, unchanged. */}
        <div className="mt-14 hidden md:grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
