import { motion } from 'framer-motion';
import { Clock, Star } from 'lucide-react';

export default function ServiceCard({ service, onBook, bookLabel, durationLabel, locale }) {
  const name = locale === 'ar' ? service.nameAr : service.name;
  const description = locale === 'ar' ? service.descriptionAr : service.description;
  const vatAmount = service.price * 0.05;
  const totalPrice = service.price + vatAmount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="glass-card overflow-hidden group"
    >
      <div className="h-48 bg-secondary relative overflow-hidden">
        <div className="absolute inset-0 gold-gradient opacity-20" />
        <div className="absolute bottom-3 start-3 flex items-center gap-1 bg-background/70 backdrop-blur-sm rounded-full px-2 py-1">
          <Star className="w-3 h-3 text-gold fill-gold" />
          <span className="text-xs font-medium">{service.rating}</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <h3 className="font-display font-semibold text-base">{name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{service.duration} {durationLabel}</span>
          </div>
          <div className="text-end">
            <span className="text-sm font-semibold gold-text">AED {totalPrice.toFixed(0)}</span>
            <p className="text-[9px] text-muted-foreground">incl. 5% VAT</p>
          </div>
        </div>
        <button
          onClick={() => onBook(service)}
          className="btn-gold w-full py-2.5 text-sm"
        >
          {bookLabel}
        </button>
      </div>
    </motion.div>
  );
}

