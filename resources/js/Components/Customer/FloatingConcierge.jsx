import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link, usePage } from '@inertiajs/react';
import { MessageCircle, X, Send, Paperclip } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

// Rule-based FAQ topics for the Booking Assistant. Each topic's label/answer
// text lives in translations.js (messenger.assistant.topics.<id>) for EN/AR
// parity — this array only carries routing + free-text keyword metadata,
// which isn't locale-specific. Keywords are plain English words/phrases;
// typed Arabic text falls through to the fallback message rather than
// guessing.
//
// Keywords are split into two tiers:
//  - `keywords`: specific-intent words/phrases that reliably identify the
//    topic on their own (scored higher).
//  - `genericKeywords`: words that show up across many real customer
//    sentences regardless of actual intent — "book"/"booking" appear in
//    cancellation and payment questions just as often as booking questions,
//    and "therapist" appears in tracking questions just as often as
//    "choose a therapist" questions (scored lower). A topic matched only on
//    a generic word loses to any other topic matched on a specific word for
//    the same message — see matchTopic() below.
const TOPICS = [
  { id: 'howToBook',       route: 'bookings',    keywords: ['reserve', 'schedule', 'appointment'], genericKeywords: ['book', 'booking', 'session', 'start'] },
  { id: 'chooseTherapist', route: 'therapists',  keywords: ['masseuse', 'masseur', 'specialist', 'choose', 'pick', 'who'], genericKeywords: ['therapist'] },
  { id: 'payment',         route: 'bookings',    keywords: ['pay', 'payment', 'cash', 'card', 'stripe', 'downpayment', 'deposit', 'cashless', 'price', 'cost'] },
  { id: 'checkBookings',   route: 'my.bookings', keywords: ['status', 'upcoming', 'history', 'pending', 'completed'], genericKeywords: ['my booking', 'my bookings'] },
  { id: 'tracking',        route: 'my.bookings', keywords: ['track', 'location', 'gps', 'map', 'where is', 'en route', 'arriving', 'live'] },
  { id: 'cancellation',    route: 'my.bookings', keywords: ['cancel', 'cancellation', 'refund', 'forfeit', 'reschedule'] },
  { id: 'voucher',         route: 'bookings',    keywords: ['voucher', 'promo', 'code', 'discount', 'coupon'] },
];

const SPECIFIC_WEIGHT = 2;
const GENERIC_WEIGHT = 1;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word/whole-phrase match only — plain substring matching would also
// fire inside unrelated words (e.g. "who" inside "wholesale", "map" inside
// "mapping", "pay" inside "repay"), which is the brittle behavior this
// replaces.
function hasKeyword(lowerText, keyword) {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(lowerText);
}

// Scores every topic against the typed text and returns the best match (or
// null if nothing scored). Specific keywords outweigh generic ones, so a
// topic hit only on a generic word (e.g. "booking") loses to a different
// topic hit on a specific word (e.g. "cancel") in the same sentence — e.g.
// "How do I cancel my booking?" now scores cancellation=2 (specific "cancel")
// vs howToBook=1 (generic "booking"), so cancellation wins. Ties keep
// whichever topic is declared first in TOPICS.
function matchTopic(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (hasKeyword(lower, kw)) score += SPECIFIC_WEIGHT;
    }
    for (const kw of topic.genericKeywords || []) {
      if (hasKeyword(lower, kw)) score += GENERIC_WEIGHT;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  return best;
}

export default function FloatingConcierge() {
  const { t } = useLanguage();
  const a = t.messenger.assistant;
  const reduceMotion = useReducedMotion();

  // The booking wizard (see CustomerLayout.jsx / BottomNav.jsx) replaces the
  // bottom nav with its own fixed action bar (~95px tall, measured), so the
  // button/panel need extra clearance there — everywhere else the default
  // 92px (tuned for BottomNav) still applies. One env(safe-area-inset-bottom)
  // reference in each case keeps the gap constant across devices rather than
  // compounding with the footer's own safe-area padding.
  const { url } = usePage();
  const isBookingWizard = url.startsWith('/book-session');
  const mobileBottomClass = isBookingWizard
    ? 'bottom-[calc(110px+env(safe-area-inset-bottom))]'
    : 'bottom-[calc(92px+env(safe-area-inset-bottom))]';
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(1);
  const [input, setInput] = useState('');
  const nextId = useRef(1);
  const messagesRef = useRef(null);
  const [messages, setMessages] = useState(() => [
    { id: 0, sender: 'concierge', text: a.welcome },
  ]);

  // Auto-scroll only the messages pane to the latest message — scrolling
  // `scrollTop` on this element directly (rather than e.g. scrollIntoView,
  // which can walk up and move ancestor scroll containers) never touches
  // the page's own scroll position.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const addMessage = (msg) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, ...msg }]);
  };

  const respond = (topicId) => {
    const topic = a.topics[topicId];
    const def = TOPICS.find((d) => d.id === topicId);
    addMessage({ sender: 'concierge', text: topic.answer, route: def?.route });
  };

  const handleTopicClick = (topicId) => {
    addMessage({ sender: 'user', text: a.topics[topicId].label });
    respond(topicId);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    addMessage({ sender: 'user', text });
    setInput('');

    const matched = matchTopic(text);
    if (matched) {
      respond(matched.id);
    } else {
      addMessage({ sender: 'concierge', text: a.fallback });
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            onClick={handleOpen}
            aria-label={a.openLabel}
            className={`fixed ${mobileBottomClass} right-5 md:bottom-6 md:right-6 z-50 w-14 h-14 rounded-full gold-gradient flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow`}
          >
            <MessageCircle className="w-6 h-6 text-primary-foreground" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-semibold">
                {unread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
            className={`ihs-assistant-panel fixed z-50 inset-x-3 ${mobileBottomClass} md:inset-x-auto md:left-auto md:right-6 md:bottom-6 md:w-full md:max-w-sm glass-card-strong flex flex-col overflow-hidden`}
            role="dialog"
            aria-label={t.messenger.title}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-display font-semibold">
                    {t.messenger.title}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-emerald-400">
                      {t.messenger.online}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label={a.closeLabel}
                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-gold/50"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages — the only flexible/scrolling region. `min-h-0`
                overrides the flex item's default `min-height: auto`, which
                is what let this area grow with content instead of
                scrolling, pushing the chips/footer out of the panel to be
                clipped by its `overflow-hidden`. */}
            <div
              ref={messagesRef}
              tabIndex={0}
              className="ihs-assistant-messages flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-gold/30"
            >
              {messages.map((msg) => (
                <div key={msg.id} className={`w-full flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] min-w-0 break-words rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender === 'user'
                        ? 'gold-gradient text-primary-foreground rounded-br-md'
                        : 'bg-secondary text-foreground rounded-bl-md'
                    }`}
                  >
                    <p className="whitespace-pre-line break-words">{msg.text}</p>
                    {msg.route && (
                      <Link
                        href={route(msg.route)}
                        className="inline-block mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-gold/50 rounded"
                        style={{ color: 'var(--theme-link, #e2b764)' }}
                      >
                        {a.linkLabels[msg.route]} →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick-reply topics — horizontally scrollable (touch swipe,
                trackpad, and Tab-key focus all work via native overflow
                scroll), with the scrollbar hidden purely visually so it
                doesn't clutter this thin strip. */}
            <div className="ihs-assistant-chips shrink-0 flex gap-2 px-3 pt-2 pb-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border-t border-glass-border">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => handleTopicClick(topic.id)}
                  className="flex-shrink-0 whitespace-nowrap text-xs px-3 py-1.5 rounded-full border border-gold/30 bg-secondary hover:bg-secondary/80 text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-gold/50"
                >
                  {a.topics[topic.id].label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="shrink-0 flex items-center gap-2 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-glass-border">
              <button
                type="button"
                className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                aria-hidden="true"
                tabIndex={-1}
              >
                <Paperclip className="w-4 h-4 text-muted-foreground" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t.messenger.placeholder}
                aria-label={t.messenger.placeholder}
                className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gold/50 placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={handleSend}
                aria-label={a.sendLabel}
                className="p-2 rounded-xl gold-gradient focus:outline-none focus:ring-2 focus:ring-gold/50"
              >
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
