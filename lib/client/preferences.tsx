"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { CURRENCIES, convert, formatMoney, type Currency, type Settings } from "@/lib/domain";

export const LANGUAGES = [
  { code: "en", label: "English", locale: "en-ZM" },
  { code: "fr", label: "Français", locale: "fr-FR" },
  { code: "pt", label: "Português", locale: "pt-PT" },
  { code: "sw", label: "Kiswahili", locale: "sw-KE" },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];

const en = {
  "nav.workspace": "Workspace", "nav.overview": "Overview", "nav.inventory": "Vehicle inventory", "nav.leads": "Leads & enquiries",
  "nav.sales": "Sales & transactions", "nav.appointments": "Appointments", "nav.customers": "Customers", "nav.messages": "Messages",
  "nav.reports": "Reports & analytics", "nav.settings": "Settings", "nav.signOut": "Sign out", "nav.website": "View website",
  "title.dashboard": "Dealership overview", "sub.dashboard": "Here's what's happening at your dealership today.",
  "title.inventory": "Vehicle inventory", "sub.inventory": "Your showroom, organized. Manage every vehicle from arrival to sale.",
  "title.leads": "Leads & enquiries", "sub.leads": "Build relationships. Move every opportunity a little further.",
  "title.sales": "Sales & transactions", "sub.sales": "Every deal, every detail. A clear view of your sales.",
  "title.appointments": "Appointments", "sub.appointments": "Make time for what matters. Keep your dealership moving.",
  "title.customers": "Customers", "sub.customers": "Great experiences start with knowing your customers.",
  "title.reports": "Reports & analytics", "sub.reports": "Less guesswork. More insight into your dealership's performance.",
  "title.settings": "Workspace settings", "sub.settings": "Dealership details, currencies, messaging and your team.",
  "title.messages": "Messages", "sub.messages": "Every customer conversation from your website, in one inbox.",
  "nav.tradeIns": "Sell & swap requests", "title.tradeIns": "Sell & swap requests",
  "sub.tradeIns": "Cars customers want to sell to you or swap with a top-up, with photos and a direct line to the customer.",
  "action.addVehicle": "Add vehicle", "action.addLead": "Add lead", "action.addCustomer": "Add customer", "action.recordSale": "Record sale",
  "action.newAppointment": "New appointment", "action.export": "Export", "action.exportReport": "Export report", "action.save": "Save changes",
  "action.cancel": "Cancel", "action.retry": "Try again", "action.confirm": "Confirm", "action.loadSample": "Load sample inventory",
  "common.loading": "Loading your workspace…", "common.search": "Search anything...", "common.language": "Language", "common.currency": "Display currency",
  "common.offline": "We couldn't reach the server.", "common.updates": "Workspace updates",
  "login.title": "Sign in to your workspace", "login.subtitle": "Staff access for the dealership portal.", "login.email": "Email address",
  "login.password": "Password", "login.submit": "Sign in", "login.working": "Signing in…",
  "login.invalid": "That email and password combination didn't work.", "login.help": "Forgotten your password? Ask a workspace administrator to reset it.",
  "inbox.all": "All", "inbox.open": "Open", "inbox.closed": "Closed", "inbox.empty": "No conversations yet",
  "inbox.emptyText": "Enquiries and test-drive requests from your website will appear here.", "inbox.select": "Select a conversation to read it.",
  "inbox.reply": "Write a reply…", "inbox.send": "Send reply", "inbox.close": "Close conversation", "inbox.reopen": "Reopen",
  "inbox.replyNote": "Replies are emailed to the customer with a private link back to this conversation.",
  "settings.dealership": "Dealership details", "settings.currency": "Currency & exchange rates", "settings.refresh": "Refresh live rates",
  "settings.messaging": "Messaging", "settings.team": "Team members", "settings.password": "Change password", "settings.audit": "Recent activity",
} as const;

export type MessageKey = keyof typeof en;
type Dictionary = Partial<Record<MessageKey, string>>;

const fr: Dictionary = {
  "nav.workspace": "Espace", "nav.overview": "Vue d'ensemble", "nav.inventory": "Stock de véhicules", "nav.leads": "Prospects et demandes",
  "nav.sales": "Ventes et transactions", "nav.appointments": "Rendez-vous", "nav.customers": "Clients", "nav.messages": "Messages",
  "nav.reports": "Rapports et analyses", "nav.settings": "Paramètres", "nav.signOut": "Se déconnecter", "nav.website": "Voir le site",
  "title.dashboard": "Aperçu de la concession", "sub.dashboard": "Voici ce qui se passe aujourd'hui dans votre concession.",
  "title.inventory": "Stock de véhicules", "sub.inventory": "Votre showroom, organisé. Gérez chaque véhicule de l'arrivée à la vente.",
  "title.leads": "Prospects et demandes", "sub.leads": "Créez des relations. Faites avancer chaque opportunité.",
  "title.sales": "Ventes et transactions", "sub.sales": "Chaque affaire, chaque détail. Une vue claire de vos ventes.",
  "title.appointments": "Rendez-vous", "sub.appointments": "Prenez le temps pour l'essentiel.",
  "title.customers": "Clients", "sub.customers": "Une belle expérience commence par la connaissance de vos clients.",
  "title.reports": "Rapports et analyses", "sub.reports": "Moins de suppositions, plus de visibilité sur vos performances.",
  "title.settings": "Paramètres de l'espace", "sub.settings": "Concession, devises, messagerie et équipe.",
  "title.messages": "Messages", "sub.messages": "Toutes les conversations clients de votre site, dans une seule boîte.",
  "nav.tradeIns": "Reprises et échanges", "title.tradeIns": "Reprises et échanges", "sub.tradeIns": "Véhicules que les clients veulent vous vendre ou échanger avec soulte.",
  "action.addVehicle": "Ajouter un véhicule", "action.addLead": "Ajouter un prospect", "action.addCustomer": "Ajouter un client",
  "action.recordSale": "Enregistrer une vente", "action.newAppointment": "Nouveau rendez-vous", "action.export": "Exporter",
  "action.exportReport": "Exporter le rapport", "action.save": "Enregistrer", "action.cancel": "Annuler", "action.retry": "Réessayer",
  "action.confirm": "Confirmer", "action.loadSample": "Charger un stock d'exemple",
  "common.loading": "Chargement de votre espace…", "common.search": "Rechercher...", "common.language": "Langue", "common.currency": "Devise d'affichage",
  "common.offline": "Impossible de joindre le serveur.", "common.updates": "Mises à jour",
  "login.title": "Connectez-vous à votre espace", "login.subtitle": "Accès réservé au personnel de la concession.", "login.email": "Adresse e-mail",
  "login.password": "Mot de passe", "login.submit": "Se connecter", "login.working": "Connexion…",
  "login.invalid": "Cette combinaison e-mail / mot de passe est incorrecte.", "login.help": "Mot de passe oublié ? Demandez à un administrateur de le réinitialiser.",
  "inbox.all": "Tous", "inbox.open": "Ouverts", "inbox.closed": "Fermés", "inbox.empty": "Aucune conversation",
  "inbox.emptyText": "Les demandes et essais réservés sur votre site apparaîtront ici.", "inbox.select": "Sélectionnez une conversation.",
  "inbox.reply": "Écrire une réponse…", "inbox.send": "Envoyer", "inbox.close": "Clore la conversation", "inbox.reopen": "Rouvrir",
  "inbox.replyNote": "Les réponses sont envoyées par e-mail au client avec un lien privé vers cette conversation.",
  "settings.dealership": "Informations de la concession", "settings.currency": "Devises et taux de change", "settings.refresh": "Actualiser les taux",
  "settings.messaging": "Messagerie", "settings.team": "Équipe", "settings.password": "Changer le mot de passe", "settings.audit": "Activité récente",
};

const pt: Dictionary = {
  "nav.workspace": "Área de trabalho", "nav.overview": "Visão geral", "nav.inventory": "Inventário de veículos", "nav.leads": "Leads e pedidos",
  "nav.sales": "Vendas e transações", "nav.appointments": "Marcações", "nav.customers": "Clientes", "nav.messages": "Mensagens",
  "nav.reports": "Relatórios e análises", "nav.settings": "Definições", "nav.signOut": "Terminar sessão", "nav.website": "Ver site",
  "title.dashboard": "Visão geral do stand", "sub.dashboard": "Eis o que está a acontecer hoje no seu stand.",
  "title.inventory": "Inventário de veículos", "sub.inventory": "O seu showroom, organizado. Gira cada veículo da chegada à venda.",
  "title.leads": "Leads e pedidos", "sub.leads": "Construa relações. Avance cada oportunidade.",
  "title.sales": "Vendas e transações", "sub.sales": "Cada negócio, cada detalhe. Uma visão clara das suas vendas.",
  "title.appointments": "Marcações", "sub.appointments": "Tempo para o que importa.",
  "title.customers": "Clientes", "sub.customers": "Boas experiências começam por conhecer os seus clientes.",
  "title.reports": "Relatórios e análises", "sub.reports": "Menos suposições. Mais informação sobre o desempenho.",
  "title.settings": "Definições", "sub.settings": "Dados do stand, moedas, mensagens e equipa.",
  "title.messages": "Mensagens", "sub.messages": "Todas as conversas de clientes do seu site numa só caixa.",
  "nav.tradeIns": "Retomas e trocas", "title.tradeIns": "Retomas e trocas", "sub.tradeIns": "Carros que os clientes querem vender-lhe ou trocar com acerto de valor.",
  "action.addVehicle": "Adicionar veículo", "action.addLead": "Adicionar lead", "action.addCustomer": "Adicionar cliente",
  "action.recordSale": "Registar venda", "action.newAppointment": "Nova marcação", "action.export": "Exportar",
  "action.exportReport": "Exportar relatório", "action.save": "Guardar", "action.cancel": "Cancelar", "action.retry": "Tentar novamente",
  "action.confirm": "Confirmar", "action.loadSample": "Carregar inventário de exemplo",
  "common.loading": "A carregar…", "common.search": "Pesquisar...", "common.language": "Idioma", "common.currency": "Moeda de apresentação",
  "common.offline": "Não foi possível contactar o servidor.", "common.updates": "Atualizações",
  "login.title": "Inicie sessão", "login.subtitle": "Acesso reservado à equipa do stand.", "login.email": "Endereço de e-mail",
  "login.password": "Palavra-passe", "login.submit": "Entrar", "login.working": "A entrar…",
  "login.invalid": "O e-mail ou a palavra-passe estão incorretos.", "login.help": "Esqueceu-se da palavra-passe? Peça a um administrador para a redefinir.",
  "inbox.all": "Todas", "inbox.open": "Abertas", "inbox.closed": "Fechadas", "inbox.empty": "Ainda sem conversas",
  "inbox.emptyText": "Pedidos e test drives do seu site aparecerão aqui.", "inbox.select": "Selecione uma conversa.",
  "inbox.reply": "Escreva uma resposta…", "inbox.send": "Enviar", "inbox.close": "Fechar conversa", "inbox.reopen": "Reabrir",
  "inbox.replyNote": "As respostas são enviadas por e-mail ao cliente com um link privado para esta conversa.",
  "settings.dealership": "Dados do stand", "settings.currency": "Moedas e câmbio", "settings.refresh": "Atualizar câmbios",
  "settings.messaging": "Mensagens", "settings.team": "Equipa", "settings.password": "Alterar palavra-passe", "settings.audit": "Atividade recente",
};

const sw: Dictionary = {
  "nav.workspace": "Eneo la kazi", "nav.overview": "Muhtasari", "nav.inventory": "Magari yaliyopo", "nav.leads": "Wateja watarajiwa",
  "nav.sales": "Mauzo", "nav.appointments": "Miadi", "nav.customers": "Wateja", "nav.messages": "Ujumbe",
  "nav.reports": "Ripoti na takwimu", "nav.settings": "Mipangilio", "nav.signOut": "Ondoka", "nav.website": "Tazama tovuti",
  "title.dashboard": "Muhtasari wa biashara", "sub.dashboard": "Haya ndiyo yanayoendelea leo.",
  "title.inventory": "Magari yaliyopo", "sub.inventory": "Simamia kila gari tangu linapofika hadi linapouzwa.",
  "title.leads": "Wateja watarajiwa", "sub.leads": "Jenga mahusiano. Sogeza kila fursa mbele.",
  "title.sales": "Mauzo", "sub.sales": "Kila mauzo, kila undani.",
  "title.appointments": "Miadi", "sub.appointments": "Panga muda kwa yaliyo muhimu.",
  "title.customers": "Wateja", "sub.customers": "Huduma bora huanza kwa kuwajua wateja wako.",
  "title.reports": "Ripoti na takwimu", "sub.reports": "Uelewa zaidi wa utendaji wa biashara yako.",
  "title.settings": "Mipangilio", "sub.settings": "Taarifa za biashara, sarafu, ujumbe na timu.",
  "title.messages": "Ujumbe", "sub.messages": "Mazungumzo yote ya wateja kutoka tovuti yako.",
  "nav.tradeIns": "Kuuza na kubadilisha", "title.tradeIns": "Kuuza na kubadilisha", "sub.tradeIns": "Magari ambayo wateja wanataka kukuuzia au kubadilisha kwa kuongeza pesa.",
  "action.addVehicle": "Ongeza gari", "action.addLead": "Ongeza mteja mtarajiwa", "action.addCustomer": "Ongeza mteja",
  "action.recordSale": "Rekodi mauzo", "action.newAppointment": "Miadi mpya", "action.export": "Pakua",
  "action.exportReport": "Pakua ripoti", "action.save": "Hifadhi", "action.cancel": "Ghairi", "action.retry": "Jaribu tena",
  "action.confirm": "Thibitisha", "action.loadSample": "Pakia magari ya mfano",
  "common.loading": "Inapakia…", "common.search": "Tafuta...", "common.language": "Lugha", "common.currency": "Sarafu ya kuonyesha",
  "common.offline": "Imeshindwa kufikia seva.", "common.updates": "Taarifa mpya",
  "login.title": "Ingia kwenye akaunti", "login.subtitle": "Kwa wafanyakazi wa biashara pekee.", "login.email": "Barua pepe",
  "login.password": "Nenosiri", "login.submit": "Ingia", "login.working": "Inaingia…",
  "login.invalid": "Barua pepe au nenosiri si sahihi.", "login.help": "Umesahau nenosiri? Muombe msimamizi alibadilishe.",
  "inbox.all": "Yote", "inbox.open": "Wazi", "inbox.closed": "Yaliyofungwa", "inbox.empty": "Hakuna mazungumzo bado",
  "inbox.emptyText": "Maombi kutoka tovuti yako yataonekana hapa.", "inbox.select": "Chagua mazungumzo kusoma.",
  "inbox.reply": "Andika jibu…", "inbox.send": "Tuma jibu", "inbox.close": "Funga mazungumzo", "inbox.reopen": "Fungua tena",
  "inbox.replyNote": "Majibu hutumwa kwa mteja kwa barua pepe pamoja na kiungo cha mazungumzo haya.",
  "settings.dealership": "Taarifa za biashara", "settings.currency": "Sarafu na viwango vya ubadilishaji", "settings.refresh": "Sasisha viwango",
  "settings.messaging": "Ujumbe", "settings.team": "Timu", "settings.password": "Badilisha nenosiri", "settings.audit": "Shughuli za karibuni",
};

const dictionaries: Record<Language, Dictionary> = { en, fr, pt, sw };

function localPreference<T extends string>(key: string, fallback: T, valid: readonly string[]) {
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      const value = window.localStorage.getItem(key);
      return value && valid.includes(value) ? (value as T) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    use: () => useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => { if (event.key === key) listener(); };
        window.addEventListener("storage", onStorage);
        return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
      },
      read,
      () => fallback,
    ),
    set: (value: T) => {
      try { window.localStorage.setItem(key, value); } catch { /* storage may be unavailable in private mode */ }
      listeners.forEach((listener) => listener());
    },
  };
}

const languagePreference = localPreference<Language>("motive-portal.language", "en", LANGUAGES.map((l) => l.code));
const currencyPreference = localPreference<Currency | "base">("motive-portal.currency", "base", ["base", ...CURRENCIES]);

type Preferences = {
  language: Language; locale: string; setLanguage: (language: Language) => void;
  displayCurrency: Currency | "base"; setDisplayCurrency: (currency: Currency | "base") => void;
  t: (key: MessageKey) => string;
};
const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const language = languagePreference.use();
  const displayCurrency = currencyPreference.use();
  const locale = LANGUAGES.find((l) => l.code === language)?.locale ?? "en-ZM";
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const t = useCallback((key: MessageKey) => dictionaries[language][key] ?? en[key] ?? key, [language]);
  const value = useMemo<Preferences>(() => ({
    language, locale, setLanguage: languagePreference.set, displayCurrency, setDisplayCurrency: currencyPreference.set, t,
  }), [language, locale, displayCurrency, t]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}

/**
 * Formats base-currency amounts in the user's chosen display currency.
 * Falls back to the base currency when no exchange rate is configured for the selection.
 */
export function useMoney(settings: Pick<Settings, "currency" | "rates"> | undefined) {
  const { displayCurrency, locale } = usePreferences();
  return useCallback((amount: number, compact = false) => {
    const base = settings?.currency ?? "ZMW";
    const target = displayCurrency === "base" ? base : displayCurrency;
    const converted = settings ? convert(amount, settings, target) : null;
    return converted === null ? formatMoney(amount, base, locale, compact) : formatMoney(converted, target, locale, compact);
  }, [settings, displayCurrency, locale]);
}
