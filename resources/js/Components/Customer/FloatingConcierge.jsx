import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Paperclip } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const initialMessages = [
  { id: 1, text: 'Welcome back! Your appointment is confirmed for today at 3 PM. 🌿', sender: 'concierge', time: '2:15 PM' },
  { id: 2, text: 'Thank you! Can I add a hot stone add-on?', sender: 'user', time: '2:18 PM' },
  { id: 3, text: "Absolutely! I've added hot stones to your session. No extra charge for VIP members. ✨", sender: 'concierge', time: '2:19 PM' },
];

export default function FloatingConcierge() {
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(1);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, {
      id: Date.now(),
      text: input,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
    setInput('');
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
            onClick={handleOpen}
            className="fixed bottom-20 right-5 md:bottom-6 md:right-6 z-50 w-14 h-14 rounded-full gold-gradient flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
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
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm glass-card-strong flex flex-col overflow-hidden"
            style={{ maxHeight: '70vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-display font-semibold">
                    {locale === 'ar' ? 'خدمة الكونسيرج' : 'VIP Concierge'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-emerald-400">
                      {locale === 'ar' ? 'متصل' : 'Online'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: '200px' }}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender === 'user'
                        ? 'gold-gradient text-primary-foreground rounded-br-md'
                        : 'bg-secondary text-foreground rounded-bl-md'
                    }`}
                  >
                    <p>{msg.text}</p>
                    <p className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 p-3 border-t border-glass-border">
              <button className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={locale === 'ar' ? 'اكتب رسالة...' : 'Type a message...'}
                className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-gold/50 placeholder:text-muted-foreground/60"
              />
              <button onClick={handleSend} className="p-2 rounded-xl gold-gradient">
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

