import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const translations = {
  en: {
    nav: {
      home: 'Home',
      services: 'Services',
      bookings: 'Bookings',
      profile: 'Profile',
      liveChat: 'Live Chat',
    },
    header: {
      welcomeBack: 'Welcome back',
      platinumVip: 'Platinum VIP Member',
      sessionsCompleted: 'sessions completed',
      memberSince: 'Member since',
    },
    status: {
      liveTracking: 'Live Tracking',
      eta: 'ETA',
      min: 'min',
      therapistOnWay: 'Therapist is on the way',
      confirmed: 'Confirmed',
      enRoute: 'En Route',
      arrived: 'Arrived',
      callAdmin: 'Call Admin',
    },
    bookings: {
      title: 'Bookings',
      viewAll: 'View all',
      upcoming: 'Upcoming',
      completed: 'Completed',
      cancelled: 'Cancelled',
      invoice: 'Invoice',
      rebook: 'Rebook',
    },
    vip: {
      title: 'VIP Preferences',
      medicalNotes: 'Medical / Allergy Notes',
      savedLocations: 'Saved Locations',
      massagePreferences: 'Massage Preferences',
      pressureLevel: 'Pressure Level',
      light: 'Light',
      medium: 'Medium',
      firm: 'Firm',
      oilType: 'Oil Type',
      silenceMode: 'Silence Mode',
      home: 'Home',
      office: 'Office',
      hotel: 'Hotel',
    },
    finance: {
      title: 'Payment',
      vat: 'VAT (5%)',
      total: 'Total',
      payApplePay: 'Pay with Apple Pay',
      securedPayment: 'Secured payment • 256-bit encryption',
    },
    messenger: {
      title: 'Booking Assistant',
      online: 'Online',
      placeholder: 'Ask me anything...',
      assistant: {
        welcome: "Hi! I'm your Booking Assistant 🌿 I can help with booking steps, payments, your bookings, and tracking. Choose a topic below or type your question.",
        fallback: "I'm not totally sure about that one yet. Here's what I can help with — tap a topic below, or ask me about booking, payment, tracking, cancellations, or vouchers.",
        openLabel: 'Open booking assistant',
        closeLabel: 'Close booking assistant',
        sendLabel: 'Send',
        linkLabels: {
          bookings: 'Book a Session',
          'my.bookings': 'View My Bookings',
          therapists: 'Browse Therapists',
        },
        topics: {
          howToBook: {
            label: 'How do I book a session?',
            answer: 'Booking takes 5 quick steps: pick a Service, choose a Therapist, set your Date & Address, select an available Time, then Pay. You can start right now from the Book a Session page.',
          },
          chooseTherapist: {
            label: 'How do I choose a therapist?',
            answer: 'After picking a service, Step 2 of booking shows you available therapists with their specialty, rating, and experience so you can choose who feels right for you.',
          },
          payment: {
            label: 'What payment options do I have?',
            answer: "You pay securely via Stripe — either a 20% downpayment now with the rest due on session day, or the full amount upfront. If you choose the downpayment, you'll pick Cash (pay your therapist on arrival) or Cashless (card/app) for the remaining balance.",
          },
          checkBookings: {
            label: 'How do I check my bookings?',
            answer: 'Open My Bookings to see every session — Pending, Completed, and Cancelled — along with its payment and downpayment status.',
          },
          tracking: {
            label: 'Can I track my therapist?',
            answer: "I can't check your specific booking, but here's how tracking works: once your therapist is on the way, your booking's status becomes En Route and a live map appears on My Bookings showing their location in real time, as long as location updates are being received. If the connection drops, you'll see their last known position instead.",
          },
          cancellation: {
            label: "What's the cancellation policy?",
            answer: "Cancel more than 24 hours before your session for a full refund of what you've paid. Cancelling within 24 hours of the session, or not showing up, forfeits the amount already paid.",
          },
          voucher: {
            label: 'How do I use a voucher?',
            answer: 'Enter your voucher code (like IHS-FREE-XXXX) during Step 5 - Payment of booking. A valid voucher can cover an eligible 60-minute service in full, so you pay nothing for that session.',
          },
        },
      },
    },
    services: {
      title: 'Our Services',
      subtitle: 'Premium spa treatments delivered to your door',
      bookNow: 'Book Now',
      duration: 'Duration',
      price: 'Price',
      categories: {
        massage: 'Massage',
        facials: 'Facials',
        homeRituals: 'Home Rituals',
        all: 'All',
      },
    },
    booking: {
      // ── General ────────────────────────────────────────────────────────────
      title:             'Book a Session',
      next:              'Next',
      back:              'Back',
      confirm:           'Confirm Booking',
      confirmingBooking: 'Confirming...',
      bookingConfirmed:  'Booking Confirmed!',
      waitingConfirm:    'Waiting for therapist confirmation...',
      dismiss:           'Dismiss',
      phoneRequired:     'Phone number is required',

      // ── Stepper labels ─────────────────────────────────────────────────────
      stepService:      'Service',
      stepTherapist:    'Therapist',
      stepDateLocation: 'Date & Location',
      stepTime:         'Time',
      stepPayment:      'Payment',

      // ── Step 1: Service ────────────────────────────────────────────────────
      selectService:   'Choose a service to get started',
      from:            'From',
      minutes_suffix:  'min',
      new_rating:      'New',

      // ── Step 2: Therapist ──────────────────────────────────────────────────
      selectTherapist:   'Choose your therapist',
      findingTherapists: 'Finding available therapists...',
      genderAll:         'All',
      genderMale:        'Male',
      genderFemale:      'Female',

      // ── Step 3: Date & Location ────────────────────────────────────────────
      chooseDate:  'Choose a date',
      location:    'Select your location',
      noAddresses: 'No addresses found. Add one in your profile.',

      // ── Step 4: Time ───────────────────────────────────────────────────────
      chooseTime:       'Choose a time slot',
      checkingAvail:    'Checking availability...',
      slotUnavailable:  'No therapists available on this day.',

      // ── Step 5: Payment / Summary ──────────────────────────────────────────
      summary:          'Booking Summary',
      summaryService:   'Service',
      summaryTherapist: 'Therapist',
      summaryDateTime:  'Date & Time',
      summaryLocation:  'Location',
      summaryTotal:     'Total',

      // ── Legacy keys (kept for other pages that still use them) ────────────
      step1:           'Select Service',
      step2:           'Choose Therapist',
      step3:           'Date & Location',
      selectDateTime:  'Pick date & time',
      selectLocation:  'Confirm location',
      chooseTime_old:  'Choose Time',
      rating:          'Rating',
      experience:      'Experience',
      years:           'years',
      specialty:       'Specialty',
    },
    profile: {
      title: 'Profile Settings',
      personalInfo: 'Personal Information',
      fullName: 'Full Name',
      email: 'Email',
      phone: 'Phone Number',
      addressBook: 'Address Book',
      addAddress: 'Add Address',
      communicationPrefs: 'Communication Preferences',
      emailNotifications: 'Email Notifications',
      smsNotifications: 'SMS Notifications',
      pushNotifications: 'Push Notifications',
      promotionalOffers: 'Promotional Offers',
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      default: 'Default',
      security: 'Security',
      twoFactorAuth: 'Two-Factor Authentication',
      twoFactorDesc: 'Extra layer of security for your account',
      enabled: 'Enabled',
      disabled: 'Disabled',
      accountType: 'Account Type',
      accountTypeDesc: 'account',
      edit: 'Edit',
      setDefault: 'Set Default',
      profileUpdated: 'Profile updated!',
      addressAdded: 'Address added!',
      addressRemoved: 'Address removed!',
      defaultUpdated: 'Default address updated!',
      noAddresses: 'No addresses yet.',
      addFirstLocation: 'Add your first location.',
      changeAvatar: 'Change',
      selectZone: 'Select your zone',
      enterAddress: 'Enter your address',
      selectZoneDesc: 'We currently serve these areas in Dubai. Select where you\'d like to receive services.',
      locationLabel: 'Location Label',
      labelPlaceholder: 'e.g. Home, Studio, Office...',
      exactAddress: 'Exact Address',
      addressPlaceholder: 'e.g. Villa 23, Street 5B, Gate Village, DIFC',
      notInArea: 'Not in any of these areas?',
      areaNotCovered: 'Sorry, we do not cover this area yet.',
    },
    language: {
      en: 'English (US)',
      ar: 'Arabic (Dubai)',
    },
    stats: {
      sessions: 'Sessions',
      avgRating: 'Avg Rating',
    },
  },

  ar: {
    nav: {
      home: 'الرئيسية',
      services: 'الخدمات',
      bookings: 'الحجوزات',
      profile: 'الملف الشخصي',
      liveChat: 'الدردشة المباشرة',
    },
    header: {
      welcomeBack: 'مرحباً بعودتك',
      platinumVip: 'عضو VIP بلاتيني',
      sessionsCompleted: 'جلسة مكتملة',
      memberSince: 'عضو منذ',
    },
    status: {
      liveTracking: 'تتبع مباشر',
      eta: 'الوصول المتوقع',
      min: 'دقيقة',
      therapistOnWay: 'المعالج في الطريق',
      confirmed: 'مؤكد',
      enRoute: 'في الطريق',
      arrived: 'وصل',
      callAdmin: 'اتصل بالإدارة',
    },
    bookings: {
      title: 'الحجوزات',
      viewAll: 'عرض الكل',
      upcoming: 'القادمة',
      completed: 'مكتملة',
      cancelled: 'ملغاة',
      invoice: 'فاتورة',
      rebook: 'إعادة حجز',
    },
    vip: {
      title: 'تفضيلات VIP',
      medicalNotes: 'ملاحظات طبية / حساسية',
      savedLocations: 'المواقع المحفوظة',
      massagePreferences: 'تفضيلات التدليك',
      pressureLevel: 'مستوى الضغط',
      light: 'خفيف',
      medium: 'متوسط',
      firm: 'قوي',
      oilType: 'نوع الزيت',
      silenceMode: 'وضع الصمت',
      home: 'المنزل',
      office: 'المكتب',
      hotel: 'الفندق',
    },
    finance: {
      title: 'الدفع',
      vat: 'ضريبة القيمة المضافة (٥٪)',
      total: 'المجموع',
      payApplePay: 'الدفع عبر Apple Pay',
      securedPayment: 'دفع آمن • تشفير 256 بت',
    },
    messenger: {
      title: 'مساعد الحجوزات',
      online: 'متصل',
      placeholder: 'اسألني أي شيء...',
      assistant: {
        welcome: 'مرحباً! أنا مساعد الحجوزات 🌿 يمكنني مساعدتك في خطوات الحجز، طرق الدفع، حجوزاتك، وتتبع المعالج. اختر موضوعاً أدناه أو اكتب سؤالك.',
        fallback: 'لست متأكداً من هذا السؤال حالياً. إليك ما يمكنني المساعدة به — اختر موضوعاً أدناه، أو اسألني عن الحجز، الدفع، التتبع، الإلغاء، أو القسائم.',
        openLabel: 'فتح مساعد الحجوزات',
        closeLabel: 'إغلاق مساعد الحجوزات',
        sendLabel: 'إرسال',
        linkLabels: {
          bookings: 'احجز جلستك',
          'my.bookings': 'عرض حجوزاتي',
          therapists: 'تصفح المعالجين',
        },
        topics: {
          howToBook: {
            label: 'كيف أحجز جلسة؟',
            answer: 'الحجز يتم بـ 5 خطوات سريعة: اختر الخدمة، اختر المعالج، حدد التاريخ والعنوان، اختر وقتاً متاحاً، ثم الدفع. يمكنك البدء الآن من صفحة احجز جلستك.',
          },
          chooseTherapist: {
            label: 'كيف أختار المعالج؟',
            answer: 'بعد اختيار الخدمة، تعرض لك الخطوة الثانية من الحجز المعالجين المتاحين مع تخصصهم وتقييمهم وخبرتهم لتختار من يناسبك.',
          },
          payment: {
            label: 'ما هي طرق الدفع المتاحة؟',
            answer: 'يمكنك الدفع بأمان عبر Stripe — إما دفعة مقدمة بنسبة ٢٠٪ الآن مع سداد الباقي يوم الجلسة، أو الدفع الكامل مقدماً. إذا اخترت الدفعة المقدمة، ستحدد الدفع نقداً (للمعالج عند الحضور) أو بدون نقد (بطاقة / تطبيق) للمبلغ المتبقي.',
          },
          checkBookings: {
            label: 'كيف أتحقق من حجوزاتي؟',
            answer: 'افتح صفحة حجوزاتي لرؤية جميع جلساتك — المعلقة، المكتملة، والملغاة — مع حالة الدفع والدفعة المقدمة لكل منها.',
          },
          tracking: {
            label: 'هل يمكنني تتبع المعالج؟',
            answer: "لا يمكنني معرفة حالة حجزك الخاص، ولكن هكذا يعمل التتبع: بمجرد أن يكون المعالج في الطريق، تتغير حالة حجزك إلى 'في الطريق' وتظهر خريطة مباشرة في صفحة حجوزاتي تُظهر موقعه في الوقت الفعلي، طالما يتم استقبال تحديثات الموقع. إذا انقطع الاتصال، سترى آخر موقع معروف له.",
          },
          cancellation: {
            label: 'ما هي سياسة الإلغاء؟',
            answer: 'الإلغاء قبل أكثر من ٢٤ ساعة من جلستك يعني استرداد كامل للمبلغ المدفوع. الإلغاء خلال ٢٤ ساعة من الجلسة، أو عدم الحضور، يؤدي إلى فقدان المبلغ المدفوع.',
          },
          voucher: {
            label: 'كيف أستخدم القسيمة؟',
            answer: 'أدخل رمز القسيمة (مثل IHS-FREE-XXXX) في الخطوة الخامسة - الدفع من الحجز. القسيمة الصالحة قد تغطي خدمة ٦٠ دقيقة بالكامل، فلا تدفع شيئاً لتلك الجلسة.',
          },
        },
      },
    },
    services: {
      title: 'خدماتنا',
      subtitle: 'علاجات سبا فاخرة تُقدّم إلى باب منزلك',
      bookNow: 'احجز الآن',
      duration: 'المدة',
      price: 'السعر',
      categories: {
        massage: 'تدليك',
        facials: 'عناية بالوجه',
        homeRituals: 'طقوس منزلية',
        all: 'الكل',
      },
    },
    booking: {
      // ── General ────────────────────────────────────────────────────────────
      title:             'احجز جلستك',
      next:              'التالي',
      back:              'رجوع',
      confirm:           'تأكيد الحجز',
      confirmingBooking: 'جاري التأكيد...',
      bookingConfirmed:  'تم تأكيد الحجز!',
      waitingConfirm:    'في انتظار تأكيد المعالج...',
      dismiss:           'إغلاق',
      phoneRequired:     'رقم الهاتف مطلوب',

      // ── Stepper labels ─────────────────────────────────────────────────────
      stepService:      'الخدمة',
      stepTherapist:    'المعالج',
      stepDateLocation: 'التاريخ والموقع',
      stepTime:         'الوقت',
      stepPayment:      'الدفع',

      // ── Step 1: Service ────────────────────────────────────────────────────
      selectService:  'اختر خدمة للبدء',
      from:           'من',
      minutes_suffix: 'دقيقة',
      new_rating:     'جديد',

      // ── Step 2: Therapist ──────────────────────────────────────────────────
      selectTherapist:   'اختر معالجك',
      findingTherapists: 'البحث عن المعالجين المتاحين...',
      genderAll:         'الكل',
      genderMale:        'ذكر',
      genderFemale:      'أنثى',

      // ── Step 3: Date & Location ────────────────────────────────────────────
      chooseDate:  'اختر التاريخ',
      location:    'اختر موقعك',
      noAddresses: 'لا توجد عناوين. أضف عنواناً من ملفك الشخصي.',

      // ── Step 4: Time ───────────────────────────────────────────────────────
      chooseTime:      'اختر وقت الجلسة',
      checkingAvail:   'جاري التحقق من التوفر...',
      slotUnavailable: 'لا يوجد معالجون متاحون في هذا اليوم.',

      // ── Step 5: Payment / Summary ──────────────────────────────────────────
      summary:          'ملخص الحجز',
      summaryService:   'الخدمة',
      summaryTherapist: 'المعالج',
      summaryDateTime:  'التاريخ والوقت',
      summaryLocation:  'الموقع',
      summaryTotal:     'الإجمالي',

      // ── Legacy keys (kept for other pages that still use them) ────────────
      step1:          'اختر الخدمة',
      step2:          'اختر المعالج',
      step3:          'التاريخ والموقع',
      selectDateTime: 'اختر التاريخ والوقت',
      selectLocation: 'تأكيد الموقع',
      rating:         'التقييم',
      experience:     'الخبرة',
      years:          'سنوات',
      specialty:      'التخصص',
    },
    profile: {
      title: 'إعدادات الملف الشخصي',
      personalInfo: 'المعلومات الشخصية',
      fullName: 'الاسم الكامل',
      email: 'البريد الإلكتروني',
      phone: 'رقم الهاتف',
      addressBook: 'دفتر العناوين',
      addAddress: 'إضافة عنوان',
      communicationPrefs: 'تفضيلات التواصل',
      emailNotifications: 'إشعارات البريد',
      smsNotifications: 'إشعارات SMS',
      pushNotifications: 'إشعارات الدفع',
      promotionalOffers: 'العروض الترويجية',
      saveChanges: 'حفظ التغييرات',
      saving: 'جاري الحفظ...',
      default: 'الافتراضي',
      security: 'الأمان',
      twoFactorAuth: 'المصادقة الثنائية',
      twoFactorDesc: 'طبقة أمان إضافية لحسابك',
      enabled: 'مفعل',
      disabled: 'معطل',
      accountType: 'نوع الحساب',
      accountTypeDesc: 'حساب',
      edit: 'تعديل',
      setDefault: 'تعيين افتراضي',
      profileUpdated: 'تم تحديث الملف الشخصي!',
      addressAdded: 'تمت إضافة العنوان!',
      addressRemoved: 'تم حذف العنوان!',
      defaultUpdated: 'تم تحديث العنوان الافتراضي!',
      noAddresses: 'لا توجد عناوين حتى الآن.',
      addFirstLocation: 'أضف موقعك الأول.',
      changeAvatar: 'تغيير',
      selectZone: 'اختر منطقتك',
      enterAddress: 'أدخل عنوانك',
      selectZoneDesc: 'نحن نخدم هذه المناطق في دبي. اختر أين تريد تلقي الخدمات.',
      locationLabel: 'تسمية الموقع',
      labelPlaceholder: 'مثال: المنزل، الاستوديو، المكتب...',
      exactAddress: 'العنوان الدقيق',
      addressPlaceholder: 'مثال: فيلا 23، شارع 5ب، قرية البوابة، DIFC',
      notInArea: 'لست في أي من هذه المناطق؟',
      areaNotCovered: 'عذراً، نحن لا نغطي هذه المنطقة بعد.',
    },
    language: {
      en: 'English (US)',
      ar: 'العربية (دبي)',
    },
    stats: {
      sessions: 'الجلسات',
      avgRating: 'متوسط التقييم',
    },
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    return localStorage.getItem('locale') || 'en';
  });

  const setLocale = useCallback((l) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
  }, []);

  const isRTL = locale === 'ar';

  useEffect(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    React.createElement(LanguageContext.Provider, { value: { locale, setLocale, t: translations[locale], isRTL } },
      children
    )
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export { translations };