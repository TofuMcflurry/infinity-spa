import { Instagram, Facebook, Mail, Phone, MapPin } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="relative border-t border-border/50 bg-card/60">
      <div className="container py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="font-display text-2xl font-semibold">
              <span className="text-gradient-gold">Infinity</span> Home Spa
            </div>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Dubai's premier home spa concierge. Wellness rituals delivered
              with discretion and devotion.
            </p>
            <div className="mt-6 flex gap-3">
              {[Instagram, Facebook].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="Social link"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-smooth hover:border-primary hover:text-primary hover:shadow-gold"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-display text-lg text-primary">Contact</h4>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 text-primary" />
                +971 50 000 0000
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 text-primary" />
                concierge@infinityhomespa.ae
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                Downtown Dubai, UAE
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-lg text-primary">Explore</h4>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                ["Services", "#services"],
                ["Booking", "#booking"],
                ["Gallery", "#gallery"],
                ["About", "#about"],
              ].map(([l, h]) => (
                <li key={l}>
                  <a href={h} className="text-muted-foreground transition-smooth hover:text-primary">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Infinity Home Spa. All rights reserved.</p>
          <p>Crafted with care in Dubai · UAE</p>
        </div>
      </div>
    </footer>
  );
};
