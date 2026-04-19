import { ShieldCheck, Home, Star } from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    title: "Licensed Therapists",
    desc: "DHA-certified professionals with years of luxury hospitality experience.",
  },
  {
    icon: Home,
    title: "Home Service",
    desc: "We bring the full spa — table, oils, music, ambience — straight to your door.",
  },
  {
    icon: Star,
    title: "5-Star Rated",
    desc: "Trusted by Dubai's most discerning clients. Excellence, every visit.",
  },
];

export const Features = () => {
  return (
    <section className="relative border-y border-border/40 bg-card/40 py-20">
      <div className="container">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-8 transition-smooth hover:border-primary/50 hover:shadow-gold"
            >
              <div className="absolute inset-0 bg-gradient-gold opacity-0 transition-smooth group-hover:opacity-[0.04]" />
              <div className="relative">
                <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-medium text-foreground">{title}</h3>
                <p className="mt-2 text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
