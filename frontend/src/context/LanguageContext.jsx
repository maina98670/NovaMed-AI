import { createContext, useContext, useState, useEffect } from 'react';

// ─── All supported languages ───────────────────────────────────────────────
export const LANGUAGES = [
  { code: 'en',    name: 'English',              nativeName: 'English',              flag: '🇬🇧' },
  { code: 'sw',    name: 'Swahili',              nativeName: 'Kiswahili',            flag: '🇰🇪' },
  { code: 'fr',    name: 'French',               nativeName: 'Français',             flag: '🇫🇷' },
  { code: 'ar',    name: 'Arabic',               nativeName: 'العربية',              flag: '🇸🇦', rtl: true },
  { code: 'es',    name: 'Spanish',              nativeName: 'Español',              flag: '🇪🇸' },
  { code: 'pt',    name: 'Portuguese',           nativeName: 'Português',            flag: '🇧🇷' },
  { code: 'de',    name: 'German',               nativeName: 'Deutsch',              flag: '🇩🇪' },
  { code: 'zh',    name: 'Chinese (Simplified)', nativeName: '中文（简体）',           flag: '🇨🇳' },
  { code: 'hi',    name: 'Hindi',               nativeName: 'हिन्दी',               flag: '🇮🇳' },
  { code: 'ru',    name: 'Russian',             nativeName: 'Русский',              flag: '🇷🇺' },
  { code: 'ja',    name: 'Japanese',            nativeName: '日本語',                flag: '🇯🇵' },
  { code: 'ko',    name: 'Korean',              nativeName: '한국어',                flag: '🇰🇷' },
  { code: 'it',    name: 'Italian',             nativeName: 'Italiano',             flag: '🇮🇹' },
  { code: 'nl',    name: 'Dutch',               nativeName: 'Nederlands',           flag: '🇳🇱' },
  { code: 'tr',    name: 'Turkish',             nativeName: 'Türkçe',               flag: '🇹🇷' },
  { code: 'ha',    name: 'Hausa',               nativeName: 'Hausa',                flag: '🇳🇬' },
  { code: 'am',    name: 'Amharic',             nativeName: 'አማርኛ',                flag: '🇪🇹' },
  { code: 'so',    name: 'Somali',              nativeName: 'Soomaali',             flag: '🇸🇴' },
  { code: 'lg',    name: 'Luganda',             nativeName: 'Luganda',              flag: '🇺🇬' },
  { code: 'rw',    name: 'Kinyarwanda',         nativeName: 'Kinyarwanda',          flag: '🇷🇼' },
  { code: 'pl',    name: 'Polish',              nativeName: 'Polski',               flag: '🇵🇱' },
  { code: 'uk',    name: 'Ukrainian',           nativeName: 'Українська',           flag: '🇺🇦' },
  { code: 'id',    name: 'Indonesian',          nativeName: 'Bahasa Indonesia',     flag: '🇮🇩' },
  { code: 'ms',    name: 'Malay',               nativeName: 'Bahasa Melayu',        flag: '🇲🇾' },
  { code: 'th',    name: 'Thai',                nativeName: 'ภาษาไทย',              flag: '🇹🇭' },
  { code: 'vi',    name: 'Vietnamese',          nativeName: 'Tiếng Việt',           flag: '🇻🇳' },
  { code: 'bn',    name: 'Bengali',             nativeName: 'বাংলা',                flag: '🇧🇩' },
  { code: 'ur',    name: 'Urdu',               nativeName: 'اردو',                 flag: '🇵🇰', rtl: true },
  { code: 'fa',    name: 'Persian',             nativeName: 'فارسی',                flag: '🇮🇷', rtl: true },
  { code: 'ro',    name: 'Romanian',            nativeName: 'Română',               flag: '🇷🇴' },
  { code: 'cs',    name: 'Czech',               nativeName: 'Čeština',              flag: '🇨🇿' },
  { code: 'hu',    name: 'Hungarian',           nativeName: 'Magyar',               flag: '🇭🇺' },
  { code: 'el',    name: 'Greek',               nativeName: 'Ελληνικά',             flag: '🇬🇷' },
  { code: 'he',    name: 'Hebrew',              nativeName: 'עברית',                flag: '🇮🇱', rtl: true },
];

// ─── Translations ─────────────────────────────────────────────────────────
export const TRANSLATIONS = {
  en: {
    selectLanguage: 'Select your language',
    continueBtn: 'Continue',
    searchLang: 'Search language…',
    signIn: 'Sign in',
    signInWith: 'Sign in with',
    google: 'Google',
    welcomeBack: 'Welcome back. Please enter your credentials.',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    registerHere: 'Register here',
    loading: 'Loading clinical engine…',
    orContinueWith: 'or continue with',
    adminConsole: 'Admin Console',
    adminWelcome: 'Administrator access. Please sign in.',
    adminSignIn: 'Sign in to Admin',
  },
  sw: {
    selectLanguage: 'Chagua lugha yako',
    continueBtn: 'Endelea',
    searchLang: 'Tafuta lugha…',
    signIn: 'Ingia',
    signInWith: 'Ingia kwa',
    google: 'Google',
    welcomeBack: 'Karibu tena. Tafadhali weka taarifa zako.',
    email: 'Barua pepe',
    password: 'Neno siri',
    forgotPassword: 'Umesahau neno siri?',
    noAccount: 'Huna akaunti?',
    registerHere: 'Jisajili hapa',
    loading: 'Inapakia mfumo wa kliniki…',
    orContinueWith: 'au endelea na',
    adminConsole: 'Dashibodi ya Msimamizi',
    adminWelcome: 'Ufikiaji wa msimamizi. Tafadhali ingia.',
    adminSignIn: 'Ingia kama Msimamizi',
  },
  fr: {
    selectLanguage: 'Sélectionnez votre langue',
    continueBtn: 'Continuer',
    searchLang: 'Rechercher une langue…',
    signIn: 'Se connecter',
    signInWith: 'Se connecter avec',
    google: 'Google',
    welcomeBack: 'Bon retour. Veuillez entrer vos identifiants.',
    email: 'E-mail',
    password: 'Mot de passe',
    forgotPassword: 'Mot de passe oublié?',
    noAccount: "Pas de compte?",
    registerHere: "S'inscrire ici",
    loading: 'Chargement du moteur clinique…',
    orContinueWith: 'ou continuer avec',
    adminConsole: 'Console Administrateur',
    adminWelcome: "Accès administrateur. Veuillez vous connecter.",
    adminSignIn: "Connexion Admin",
  },
  ar: {
    selectLanguage: 'اختر لغتك',
    continueBtn: 'متابعة',
    searchLang: 'ابحث عن لغة…',
    signIn: 'تسجيل الدخول',
    signInWith: 'تسجيل الدخول باستخدام',
    google: 'Google',
    welcomeBack: 'مرحبًا بعودتك. يرجى إدخال بيانات الاعتماد الخاصة بك.',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    noAccount: 'ليس لديك حساب؟',
    registerHere: 'سجل هنا',
    loading: 'جارٍ تحميل المحرك السريري…',
    orContinueWith: 'أو تابع باستخدام',
    adminConsole: 'لوحة الإدارة',
    adminWelcome: 'وصول المسؤول. يرجى تسجيل الدخول.',
    adminSignIn: 'دخول المسؤول',
  },
  es: {
    selectLanguage: 'Selecciona tu idioma',
    continueBtn: 'Continuar',
    searchLang: 'Buscar idioma…',
    signIn: 'Iniciar sesión',
    signInWith: 'Iniciar sesión con',
    google: 'Google',
    welcomeBack: 'Bienvenido de nuevo. Por favor, ingresa tus credenciales.',
    email: 'Correo electrónico',
    password: 'Contraseña',
    forgotPassword: '¿Olvidaste tu contraseña?',
    noAccount: '¿No tienes cuenta?',
    registerHere: 'Regístrate aquí',
    loading: 'Cargando motor clínico…',
    orContinueWith: 'o continuar con',
    adminConsole: 'Consola de Administrador',
    adminWelcome: 'Acceso de administrador. Por favor, inicia sesión.',
    adminSignIn: 'Iniciar sesión como Admin',
  },
  pt: {
    selectLanguage: 'Selecione seu idioma',
    continueBtn: 'Continuar',
    searchLang: 'Pesquisar idioma…',
    signIn: 'Entrar',
    signInWith: 'Entrar com',
    google: 'Google',
    welcomeBack: 'Bem-vindo de volta. Por favor, insira suas credenciais.',
    email: 'E-mail',
    password: 'Senha',
    forgotPassword: 'Esqueceu a senha?',
    noAccount: 'Não tem uma conta?',
    registerHere: 'Cadastre-se aqui',
    loading: 'Carregando motor clínico…',
    orContinueWith: 'ou continuar com',
    adminConsole: 'Console do Administrador',
    adminWelcome: 'Acesso de administrador. Por favor, entre.',
    adminSignIn: 'Entrar como Admin',
  },
  de: {
    selectLanguage: 'Sprache auswählen',
    continueBtn: 'Weiter',
    searchLang: 'Sprache suchen…',
    signIn: 'Anmelden',
    signInWith: 'Anmelden mit',
    google: 'Google',
    welcomeBack: 'Willkommen zurück. Bitte geben Sie Ihre Zugangsdaten ein.',
    email: 'E-Mail',
    password: 'Passwort',
    forgotPassword: 'Passwort vergessen?',
    noAccount: 'Noch kein Konto?',
    registerHere: 'Hier registrieren',
    loading: 'Klinische Engine wird geladen…',
    orContinueWith: 'oder weiter mit',
    adminConsole: 'Admin-Konsole',
    adminWelcome: 'Administratorzugang. Bitte anmelden.',
    adminSignIn: 'Als Admin anmelden',
  },
  zh: {
    selectLanguage: '请选择您的语言',
    continueBtn: '继续',
    searchLang: '搜索语言…',
    signIn: '登录',
    signInWith: '使用以下方式登录',
    google: 'Google',
    welcomeBack: '欢迎回来，请输入您的凭据。',
    email: '电子邮件',
    password: '密码',
    forgotPassword: '忘记密码？',
    noAccount: '还没有账户？',
    registerHere: '在此注册',
    loading: '正在加载临床引擎…',
    orContinueWith: '或使用以下方式继续',
    adminConsole: '管理员控制台',
    adminWelcome: '管理员访问，请登录。',
    adminSignIn: '管理员登录',
  },
  hi: {
    selectLanguage: 'अपनी भाषा चुनें',
    continueBtn: 'जारी रखें',
    searchLang: 'भाषा खोजें…',
    signIn: 'साइन इन करें',
    signInWith: 'के साथ साइन इन करें',
    google: 'Google',
    welcomeBack: 'वापस स्वागत है। कृपया अपनी जानकारी दर्ज करें।',
    email: 'ईमेल',
    password: 'पासवर्ड',
    forgotPassword: 'पासवर्ड भूल गए?',
    noAccount: 'खाता नहीं है?',
    registerHere: 'यहाँ पंजीकरण करें',
    loading: 'क्लिनिकल इंजन लोड हो रहा है…',
    orContinueWith: 'या इसके साथ जारी रखें',
    adminConsole: 'व्यवस्थापक कंसोल',
    adminWelcome: 'व्यवस्थापक पहुँच। कृपया साइन इन करें।',
    adminSignIn: 'व्यवस्थापक के रूप में साइन इन करें',
  },
};

// Fallback to English for untranslated languages
const getTranslations = (code) => TRANSLATIONS[code] || TRANSLATIONS['en'];

// ─── Context ──────────────────────────────────────────────────────────────
const LangCtx = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('novamed_lang') || null);

  useEffect(() => {
    if (lang) {
      localStorage.setItem('novamed_lang', lang);
      const found = LANGUAGES.find(l => l.code === lang);
      document.documentElement.dir = found?.rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = getTranslations(lang);
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <LangCtx.Provider value={{ lang, setLang, t, currentLang, LANGUAGES }}>
      {children}
    </LangCtx.Provider>
  );
}

export const useLang = () => useContext(LangCtx);
