import { motion } from 'framer-motion';
import { CreditCard, Receipt } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function FinanceSection() {
  const { t } = useLanguage();
  const subtotal = 650;
  const vat = subtotal * 0.05;
  const total = subtotal + vat;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-gold" />
        <h3 className="font-display text-base font-semibold">{t.finance.title}</h3>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Deep Tissue Massage (90 min)</span>
          <span>AED {subtotal.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t.finance.vat}</span>
          <span>AED {vat.toFixed(2)}</span>
        </div>
        <div className="h-px bg-border my-2" />
        <div className="flex justify-between text-base font-semibold">
          <span>{t.finance.total}</span>
          <span className="gold-text">AED {total.toFixed(2)}</span>
        </div>
      </div>

      <button className="btn-gold w-full flex items-center justify-center gap-3 py-4 text-base">
        <CreditCard className="w-5 h-5" />
        {t.finance.payApplePay}
      </button>

      <p className="text-[10px] text-muted-foreground text-center mt-3">{t.finance.securedPayment}</p>
    </motion.div>
  );
}

