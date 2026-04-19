import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Services", href: "#services" },
  { label: "Gallery", href: "#gallery" },
  { label: "About", href: "#about" },
  { label: "Book Now", href: "#booking" },
];

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-border/40 bg-background/90 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="container flex h-20 items-center justify-between">
        <a href="#home" className="font-display text-xl font-semibold text-foreground">
          <span className="text-gradient-gold">Infinity</span> Home Spa
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map(({ label, href }) =>
            label === "Book Now" ? (
              <a
                key={label}
                href={href}
                className="rounded-md border border-primary/60 px-5 py-2 text-sm font-medium text-primary transition-smooth hover:bg-primary/10"
              >
                {label}
              </a>
            ) : (
              <a
                key={label}
                href={href}
                className="text-sm text-muted-foreground transition-smooth hover:text-primary"
              >
                {label}
              </a>
            )
          )}
        </nav>

        {/* Mobile toggle */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-md md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border/40 bg-background/95 px-6 py-4 md:hidden glass">
          <nav className="flex flex-col gap-4">
            {navLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="text-sm text-muted-foreground transition-smooth hover:text-primary"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};
