import { motion } from 'framer-motion';
import { Send, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const initialMessages = [
  { id: 1, text: 'Welcome back! Your appointment is confirmed for today at 3 PM. 🌿', sender: 'concierge', time: '2:15 PM' },
  { id: 2, text: 'Thank you! Can I add a hot stone add-on?', sender: 'user', time: '2:18 PM' },
  { id: 3, text: "Absolutely! I've added hot stones to your session. No extra charge for VIP members. ✨", sender: 'concierge', time: '2:19 PM' },
];

export default function MessengerHub() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { id: Date.now(), text: input, sender: 'user', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setInput('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass-card p-5 flex flex-col"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold">{t.messenger.title}</h3>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400">{t.messenger.online}</span>
        </div>
      </div>

      <div className="flex-1 space-y-3 mb-4 max-h-48 overflow-y-auto">
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

      <div className="flex items-center gap-2">
        <button className="p-2.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t.messenger.placeholder}
            className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gold/50 placeholder:text-muted-foreground/60"
          />
        </div>
        <button onClick={handleSend} className="p-2.5 rounded-xl gold-gradient">
          <Send className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>
    </motion.div>
  );
}

