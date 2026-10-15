# Ondilo ICO

L'**Ondilo ICO** flotte dans votre piscine ou votre spa et mesure l'eau toutes
les heures. Cette intégration amène ces mesures dans Gladys, avec les
recommandations de l'application Ondilo, grâce à l'API client officielle
d'Ondilo. Non officielle, sans lien avec Ondilo.

> **Version de développement (0.1).** Réalisée d'après la documentation de
> l'API Ondilo et testée avec des réponses simulées, pas encore avec un vrai
> ICO. Vos retours sont les bienvenus sur le dépôt GitHub.

## Ce que vous obtenez

Un appareil Gladys par piscine ou spa de votre compte Ondilo (piscines
partagées comprises), avec :

| Mesure Ondilo                           | Dans Gladys                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Température de l'eau                    | capteur de température, °C                                             |
| pH                                      | capteur de pH                                                          |
| Redox (ORP)                             | capteur redox, mV                                                      |
| Sel (piscines au sel)                   | capteur en ppm : Ondilo donne des mg/L, même valeur (4000 ppm = 4 g/L) |
| Minéraux dissous, TDS (autres piscines) | capteur en ppm                                                         |
| Batterie de l'ICO                       | batterie, %                                                            |
| Signal de l'ICO                         | signal, %                                                              |
| Recommandations en cours                | texte : leurs titres, ou « — » s'il n'y en a aucune                    |

Chaque mesure est enregistrée à l'heure où l'ICO l'a prise, pas à l'heure où
Gladys l'a lue : les graphiques montrent le vrai rythme des mesures. Les
mesures que l'ICO déclare invalides (hors de l'eau…) sont ignorées.

Le badge de l'appareil indique `cloud` ; un point orange signale l'absence de
mesure depuis plus de 3 heures (batterie, ICO hors de l'eau, hivernage), et
`injoignable` qu'Ondilo ne répond pas ou a refusé l'autorisation.

## Installation

1. Installez l'intégration depuis le store de Gladys.
2. Dans l'onglet **Configuration**, cliquez sur **Connecter** à côté de
   « Compte Ondilo ».
3. La page d'Ondilo s'ouvre : identifiez-vous avec l'e-mail et le mot de passe
   de votre compte Ondilo (ceux de l'application ICO), puis cliquez sur
   **Autoriser**. Gladys ne voit jamais votre mot de passe, et il n'y a aucune
   application à créer chez Ondilo.
4. De retour dans Gladys, l'état indique « Connecté à Ondilo : 1 piscine ou
   spa ».
5. Ouvrez l'onglet **Découverte** et ajoutez vos piscines et spas.

Les dernières mesures arrivent dès qu'un appareil est ajouté.

## Fréquence de lecture

L'ICO mesure une fois par heure, et Ondilo autorise 30 requêtes par heure et
par compte. L'intégration :

- lit les mesures de chaque piscine 65 minutes après sa dernière mesure, donc
  juste après la suivante (environ une requête par piscine et par heure) ;
- lit les recommandations à chaque nouvelle mesure (au plus une fois par
  heure, au moins toutes les 6 heures), et la liste des piscines toutes les
  6 heures ;
- n'envoie jamais plus de 20 requêtes par heure, et laisse un tiers du quota à
  l'application Ondilo et à vos autres outils ;
- quand l'ICO reste muet (hivernage, batterie), réessaie 20 minutes plus tard,
  puis toutes les heures.

Pour une piscine, cela fait environ 2 requêtes par heure. Le bouton
**Actualiser maintenant** lit tout d'un coup et affiche un résumé (au plus
toutes les 5 minutes).

## Scènes

- Les mesures fonctionnent avec le déclencheur « Changement d'état d'un
  appareil », par exemple « pH au-dessus de 7,6 → m'envoyer un message ».
- Le déclencheur **Nouvelle recommandation Ondilo** lance une scène quand
  Ondilo publie une recommandation (ajuster le pH, nettoyer le filtre…), pour
  une piscine ou pour toutes. Ses détails sont disponibles dans les actions
  suivantes : `{{triggerEvent.data.title}}`, `message`, `deadline`,
  `pool_name`. Chaque recommandation ne déclenche qu'une fois ; celles déjà
  présentes quand le compte est lié ne sont pas annoncées.

## Options

| Option                              | Défaut   | Rôle                                                     |
| ----------------------------------- | -------- | -------------------------------------------------------- |
| Langue des noms des fonctionnalités | Français | noms des fonctionnalités des piscines ajoutées désormais |

Les recommandations gardent la langue de votre compte Ondilo.

## Dépannage

- **« Ondilo a refusé l'autorisation enregistrée »** : le mot de passe du
  compte Ondilo a changé, ou l'accès a été révoqué. Cliquez à nouveau sur
  **Connecter**.
- **« Ondilo est injoignable »** : Ondilo ou votre accès Internet est en
  panne. L'intégration réessaie après 5, 15, 30 puis 60 minutes.
- **« le quota de requêtes est atteint »** : un autre outil interroge beaucoup
  le même compte Ondilo. L'intégration fait une pause d'une heure.
- **Ondilo affiche une erreur sur l'adresse de redirection** quand vous
  cliquez sur Connecter : ouvrez un ticket sur le dépôt GitHub avec le
  message.
- **Le sel ne correspond pas à l'application** : l'application Ondilo peut
  afficher des g/L, Gladys affiche des ppm (mg/L) : 4200 ppm = 4,2 g/L.

## Confidentialité

Vous vous identifiez sur la page d'Ondilo elle-même : votre mot de passe ne
passe jamais par Gladys. Gladys conserve les jetons d'accès fournis par Ondilo
(jamais affichés dans l'interface) et l'intégration ne parle qu'à
`interop.ondilo.com`. ICO et Ondilo sont des marques d'Ondilo ; cette
intégration est sans lien avec Ondilo.
