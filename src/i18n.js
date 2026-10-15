// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, button, feature names), in English
// and French.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The text of `texts` in `language`, English otherwise. */
export const word = (texts, language) => texts[language] ?? texts.en;

/** Feature names, in the language chosen in the configuration. */
export const FEATURE_NAMES = {
  temperature: { en: 'Water temperature', fr: "Température de l'eau" },
  ph: { en: 'pH', fr: 'pH' },
  orp: { en: 'Redox (ORP)', fr: 'Redox (ORP)' },
  salt: { en: 'Salt', fr: 'Sel' },
  tds: { en: 'Dissolved solids (TDS)', fr: 'Minéraux dissous (TDS)' },
  battery: { en: 'Battery', fr: 'Batterie' },
  rssi: { en: 'Signal', fr: 'Signal' },
  recommendations: { en: 'Recommendations', fr: 'Recommandations' },
};

/** "25 min" / "3 h", for the ages of the measures. */
export function age(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 120) {
    return { en: `${minutes} min`, fr: `${minutes} min` };
  }
  const hours = Math.round(minutes / 60);
  return hours < 48
    ? { en: `${hours} h`, fr: `${hours} h` }
    : { en: `${Math.round(hours / 24)} days`, fr: `${Math.round(hours / 24)} jours` };
}

export const T = {
  notConnected: {
    en: 'Click "Connect" to link your Ondilo account (the one of the ICO app).',
    fr: "Cliquez sur « Connecter » pour lier votre compte Ondilo (celui de l'application ICO).",
  },
  connecting: {
    en: 'Ondilo account linked: reading your pools and spas…',
    fr: 'Compte Ondilo lié : lecture de vos piscines et spas…',
  },
  connected: (pools) => ({
    en: `Connected to Ondilo: ${plural(pools, 'pool or spa', 'pools or spas')}. Open Discovery to add them.`,
    fr: `Connecté à Ondilo : ${plural(pools, 'piscine ou spa', 'piscines ou spas')}. Ouvrez Découverte pour les ajouter.`,
  }),
  noPool: {
    en: 'Connected to Ondilo, but this account has no pool or spa with an ICO.',
    fr: "Connecté à Ondilo, mais ce compte n'a aucune piscine ni spa équipé d'un ICO.",
  },
  refused: {
    en: 'Ondilo refused the saved authorization (password changed, access revoked?): click "Connect" again.',
    fr: "Ondilo a refusé l'autorisation enregistrée (mot de passe changé, accès révoqué ?) : cliquez à nouveau sur « Connecter ».",
  },
  unreachable: (reason, wait) => ({
    en: `Ondilo cannot be reached (${reason}). Next try in ${wait.en}.`,
    fr: `Ondilo est injoignable (${reason}). Nouvel essai dans ${wait.fr}.`,
  }),
  noMeasure: {
    en: 'No measure received from the ICO yet.',
    fr: "Aucune mesure reçue de l'ICO pour le moment.",
  },
  stale: (since) => ({
    en: `No measure for ${since.en}: check the ICO (battery, out of the water, wintering).`,
    fr: `Aucune mesure depuis ${since.fr} : vérifiez l'ICO (batterie, hors de l'eau, hivernage).`,
  }),
  rateLimited: (wait) => ({
    en: `Ondilo says the request quota is reached: pausing for ${wait.en}.`,
    fr: `Ondilo indique que le quota de requêtes est atteint : pause de ${wait.fr}.`,
  }),
  refresh: {
    pool: (name, values, measuredAgo) => ({
      en: `${name}: ${values || 'no measure yet'}${measuredAgo ? ` (measured ${measuredAgo.en} ago)` : ''}.`,
      fr: `${name} : ${values || 'aucune mesure pour le moment'}${measuredAgo ? ` (mesuré il y a ${measuredAgo.fr})` : ''}.`,
    }),
    recommendations: (count) => ({
      en: count > 0 ? ` ${plural(count, 'recommendation', 'recommendations')} in progress.` : '',
      fr:
        count > 0
          ? ` ${plural(count, 'recommandation en cours', 'recommandations en cours')}.`
          : '',
    }),
    cooldown: (wait) => ({
      en: `Already read less than 5 minutes ago (Ondilo limits the requests): next refresh possible in ${wait.en}.`,
      fr: `Déjà lu il y a moins de 5 minutes (Ondilo limite les requêtes) : prochaine actualisation possible dans ${wait.fr}.`,
    }),
    budget: (wait) => ({
      en: `The Ondilo request budget of the hour is spent: next refresh possible in ${wait.en}.`,
      fr: `Le budget de requêtes Ondilo de l'heure est épuisé : prochaine actualisation possible dans ${wait.fr}.`,
    }),
  },
};
