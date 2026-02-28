# UIRat — Architecture Technique v1.0

**UI Reverse-Engineering & Reconstruction Pipeline**
*Scrape. Design. Build. Run.*

Version 1.0 — Février 2026 — Document confidentiel

---

## Table des matières

1. Résumé Exécutif
2. Stack Technique
3. Architecture Globale : Le Pipeline
4. Module 1 : Headless Crawler
5. Module 2 : DOM Serializer
6. Format CIR (UIRat Intermediate Representation)
7. Module 3 : Asset Collector
8. Module 4 : Les Trois Transformers
9. Module 5 : Figma Generator
10. Capture Responsive Multi-Viewport
11. Sécurité et Confidentialité
12. Modèle Économique
13. Plan de Développement (Roadmap)
14. Risques et Mitigations
15. Conclusion

---

## 1. Résumé Exécutif

### 1.1 Qu'est-ce que UIRat ?

UIRat est un pipeline de reverse-engineering d'interfaces utilisateur qui transforme n'importe quelle application web en deux types de livrables exploitables : un fichier de design Figma fidèle au pixel, et un projet frontend fonctionnel (HTML/CSS ou React) directement exécutable sur la machine locale de l'utilisateur.

L'outil parcourt automatiquement un site web complet — y compris les pages protégées par authentification — et propose trois modes de sortie :

- **Mode Standard** : Génère un fichier Figma pixel-perfect avec des calques génériques (gratuit, rapide, sans IA)
- **Mode AI Design** : Génère un fichier Figma professionnel avec calques nommés, Design System et composants réutilisables
- **Mode AI Build** : Génère un projet frontend complet (React + Tailwind ou HTML/CSS) dans un dossier local, avec serveur de développement intégré

Le Mode AI Build est la fonctionnalité différenciante clé. Au lieu de simplement produire un fichier Figma statique, UIRat peut reconstruire l'UI scrappée en code propre et le lancer sur un serveur local (localhost:3000) pour prévisualisation immédiate. L'utilisateur obtient un dossier de projet structuré, prêt à être déployé ou modifié.

### 1.2 Positionnement concurrentiel

| Fonctionnalité | html.to.design | Locofy | UIRat Standard | UIRat AI Build |
|---|---|---|---|---|
| Capture multi-pages | Non | Non | Oui | Oui |
| Authentification | Non | Non | Oui | Oui |
| Output Figma | Oui | Non | Oui | Oui |
| Output code frontend | Non | Oui (sens inverse) | Non | Oui (React / HTML) |
| Serveur dev local | Non | Non | Non | Oui (auto-start) |
| Design System auto | Non | Non | Non | Oui |
| Nommage intelligent | Non | N/A | Non | Oui |
| Prix | Payant | Payant | Gratuit | Premium |

---

## 2. Stack Technique

TypeScript est le langage principal : Playwright, l'API Plugin Figma et l'écosystème npm sont tous natifs TypeScript. Le mode AI Build utilise un sous-système de scaffolding de projet qui génère du code React ou HTML selon le choix utilisateur.

### 2.1 Stack complète

| Couche | Technologie | Justification |
|---|---|---|
| Langage principal | TypeScript (Node.js 20+) | Typage fort, natif Playwright/Figma |
| Navigation/Crawl | Playwright + stealth plugin | Navigation réaliste, auth, JS execution |
| API Backend | Fastify | Performance, schema validation native |
| File de jobs | BullMQ + Redis | Crawl asynchrone + rate limiting |
| Orchestration IA | Vercel AI SDK | Abstraction multi-provider LLM |
| Génération de code | LLM (Claude/GPT-4o) + Scaffolder maison | Transformation CIR → React/HTML |
| Serveur dev local | Vite (React) ou live-server (HTML) | Hot reload, prévisualisation instantanée |
| Plugin Figma | Figma Plugin API v3 + React | Interface native Figma |
| App Web | React + Tailwind CSS | Dashboard standalone |
| Base de données | SQLite (dev) / PostgreSQL (prod) | Sessions, historique de captures |
| Cache | Redis | Sessions browser, CIR temporaires |

### 2.2 Dépendances critiques

| Package | Rôle |
|---|---|
| playwright + playwright-extra + stealth | Navigation headless anti-détection |
| bullmq | File de jobs asynchrones |
| @anthropic-ai/sdk / openai | Appels LLM (modes AI) |
| sharp | Traitement d'images (screenshots, assets) |
| svgo | Optimisation SVG |
| vite | Serveur dev pour les projets React générés |
| live-server | Serveur dev pour les projets HTML générés |
| figma-api | API REST Figma |
| archiver | Génération de fichiers ZIP téléchargeables |

## 3. Architecture Globale : Le Pipeline

UIRat est un pipeline en 5 modules séquentiels. Le format pivot central est le CIR (UIRat Intermediate Representation) — un JSON propriétaire qui sert de pont entre le DOM web et les trois outputs (Figma, code frontend, serveur local).

### 3.1 Flux de données

Le flux suit une chaîne linéaire qui se divise en trois branches au niveau du Transformer :

**URL + Auth** → Headless Crawler → DOM Serializer → **CIR JSON brut** → Asset Collector → **CIR Enrichi**

À partir du CIR Enrichi, trois chemins sont possibles :

- **Chemin A — Standard Mapper** → Fichier .fig (calques génériques)
- **Chemin B — AI Design** → Fichier .fig professionnel (composants, Design System)
- **Chemin C — AI Build** → Dossier projet local + démarrage serveur localhost

### 3.2 Résumé des modules

| Module | Input | Output | Dépendance IA |
|---|---|---|---|
| Headless Crawler | URL + credentials | Routes + sessions auth | Non |
| DOM Serializer | Page rendue (DOM live) | CIR brut (JSON) | Non |
| Asset Collector | CIR brut | CIR + images/fonts/SVGs | Non |
| Transformer Standard | CIR enrichi | CIR mappé Figma | Non |
| Transformer AI Design | CIR enrichi | CIR sémantique + Design System | Oui |
| Transformer AI Build | CIR enrichi | Dossier projet React/HTML | Oui |
| Figma Generator | CIR final | .fig ou API Figma REST | Non |
| Local Server Launcher | Dossier projet généré | localhost:3000 | Non |

---

## 4. Module 1 : Headless Crawler

Le Crawler simule un utilisateur humain naviguant sur l'application cible. Il gère l'authentification et découvre toutes les routes accessibles.

### 4.1 Navigation Stealth

Pour éviter la détection par les systèmes anti-bot (Cloudflare, Akamai, DataDome), le crawler utilise Playwright avec le plugin stealth :

- User-Agent rotatif (pool de 50+ agents réels Chrome/Firefox/Safari)
- Mouvements de souris aléatoires entre les actions
- Délais humanisés (200-800ms entre les clics)
- Viewport dynamique (1920x1080, 1440x900, 1366x768)
- Scroll naturel progressif (pas de scrollTo instantané)
- Masquage WebGL/Canvas fingerprint et flag navigator.webdriver

### 4.2 Stratégies d'authentification

#### 4.2.1 Méthode A : Import de session (recommandée)

L'utilisateur se connecte manuellement dans une fenêtre Chromium ouverte par UIRat. L'outil exporte l'état complet (cookies + localStorage + sessionStorage) dans un fichier state.json chiffré, réutilisable pour toutes les captures suivantes sans jamais redemander les identifiants.

#### 4.2.2 Méthode B : Injection de tokens

L'utilisateur fournit un token JWT ou OAuth. UIRat l'injecte dans les headers Authorization. Un mécanisme de refresh automatique est prévu pour les tokens à durée courte.

#### 4.2.3 Méthode C : Identifiants directs

En dernier recours : email + mot de passe remplis automatiquement dans le formulaire de login. Les identifiants sont chiffrés en mémoire, jamais persistés sur disque. Cette méthode est la plus fragile face aux captchas et 2FA.

### 4.3 Découverte de routes

1. **Extraction des liens HTML** : parcours récursif de tous les éléments `<a href>` du DOM
2. **Interception XHR/Fetch** : écoute des requêtes réseau pour découvrir les navigations SPA
3. **Analyse des bundles JS** : détection des routes dans React Router, Vue Router, Next.js
4. **Déduplication intelligente** : /user/123 et /user/456 → une seule route /user/:id

### 4.4 Capture des états interactifs

- Survol (hover) de tous les éléments cliquables pour détecter les changements CSS
- Clic sur les menus hamburger et dropdowns pour révéler le contenu caché
- Ouverture des modales détectées pour capturer leur design
- Chaque état est un snapshot CIR séparé lié à la page parente

---

## 5. Module 2 : DOM Serializer

Script JavaScript injecté dans la page via Playwright. Il parcourt l'arbre DOM rendu et extrait toutes les informations visuelles nécessaires à la reconstruction du design.

### 5.1 Données extraites par nœud

| Propriété | Méthode d'extraction | Usage |
|---|---|---|
| Position (x, y, w, h) | getBoundingClientRect() | Coordonnées absolues |
| Styles calculés | getComputedStyle(el) | Fills, strokes, typo, effects |
| Typographie | fontFamily, fontSize, fontWeight, lineHeight | Text styles |
| Couleurs | color, backgroundColor, borderColor | Fill + stroke |
| Bordures | borderWidth, borderRadius, borderStyle | Stroke + corner radius |
| Ombres | boxShadow (parsé) | Drop/Inner shadow effects |
| Layout | display, flexDirection, gap, justifyContent, alignItems | Auto-layout / CSS output |
| Pseudo-éléments | getComputedStyle(el, '::before'/'::after') | Calques supplémentaires |
| Z-index | zIndex + stacking context | Ordre des calques |
| Visibilité | opacity, visibility, display | Filtrage des invisibles |
| Images | src, srcset, background-image | Image fills / balises img |
| SVG inline | outerHTML du SVG | Vector nodes / composants SVG |

### 5.2 Filtrage intelligent

Le serializer ne capture pas aveuglément tout le DOM. Un ensemble de règles filtre les nœuds parasites :

- Exclusion des éléments invisibles (display:none, visibility:hidden, opacity:0 sans transition)
- Exclusion des éléments hors viewport (position absolue loin de l'écran)
- Fusion des wrappers vides (div sans style propre avec un seul enfant)
- Exclusion des scripts, iframes publicitaires, trackers
- Détection et exclusion des banners de consentement cookies

### 5.3 Gestion des pseudo-éléments

Les pseudo-éléments ::before et ::after sont souvent utilisés pour des décorations essentielles au design (icônes, séparateurs, badges). Le serializer les capture et les insère comme des nœuds enfants supplémentaires dans le CIR, avec un flag isPseudo: true.

---

## 6. Format CIR (UIRat Intermediate Representation)

Le CIR est le cœur technique du projet. C'est un format JSON propriétaire servant de pont universel entre le DOM web, l'API Figma, et la génération de code frontend. Il est conçu pour être lisible, extensible, et traitable par un algorithme déterministe ou un LLM.

### 6.1 Structure d'un nœud CIR

Chaque élément visuel de la page est représenté par un objet CIRNode contenant les champs suivants :

- **id** : identifiant unique du nœud (ex: node_001)
- **tagName** : balise HTML source (BUTTON, DIV, IMG, etc.)
- **textContent** : contenu textuel visible
- **classList** : liste des classes CSS appliquées
- **bounds** : objet contenant x, y, width, height — les coordonnées absolues et dimensions en pixels
- **styles** : objet contenant toutes les propriétés visuelles calculées — backgroundColor, borderRadius, padding (top/right/bottom/left), fontFamily, fontSize, fontWeight, color, boxShadow, etc.
- **layout** : objet décrivant la disposition — display, flexDirection, justifyContent, alignItems, gap
- **assets** : références aux images — backgroundImage, imgSrc
- **meta** : métadonnées — isPseudo (booléen), isInteractive (booléen), zIndex (entier), componentHint (null par défaut, rempli par le mode AI), semanticRole (null par défaut, rempli par le mode AI)
- **children** : tableau de nœuds CIR enfants (structure récursive)

### 6.2 Structure d'un document CIR complet

Un document CIR représente l'intégralité d'une application scrappée et contient :

- **version** : version du format CIR (1.0)
- **tool** : "UIRat"
- **capturedAt** : horodatage de la capture
- **sourceUrl** : URL de l'application source
- **viewport** : dimensions du viewport utilisé (width, height)
- **pages** : tableau de pages, chacune contenant sa route, son titre, un screenshot en base64, un rootNode (arbre CIR complet), et un tableau d'états interactifs capturés (hover, modales, etc.)
- **assets** : catalogue de tous les assets collectés — images, fonts, SVGs
- **designTokens** : tokens de design extraits — couleurs, espacements, rayons, typographies

---

## 7. Module 3 : Asset Collector

Avant la phase de transformation, le pipeline collecte tous les assets référencés dans le CIR brut.

### 7.1 Stratégie de collecte

| Type d'asset | Source | Traitement |
|---|---|---|
| Images raster (PNG, JPG, WebP) | src, srcset, background-image | Téléchargement + conversion PNG via Sharp |
| SVG inline | outerHTML des éléments svg | Nettoyage + optimisation SVGO |
| SVG externes | src pointant vers .svg | Téléchargement + intégration inline |
| Polices (WOFF2, TTF) | @font-face dans CSS | Téléchargement + mapping Figma/CSS |
| Favicons/Logos | link rel='icon' | Téléchargement meilleure résolution |

### 7.2 Gestion des polices

La correspondance des polices web vers Figma est critique. L'Asset Collector maintient un dictionnaire de mapping entre les noms de polices web (font-family CSS) et les noms exacts dans la bibliothèque Google Fonts de Figma. Les polices personnalisées non trouvées sont remplacées par la police la plus proche morphologiquement, avec un warning dans le rapport de capture.

Pour le mode AI Build, les assets sont copiés dans un dossier /public/assets/ du projet généré, avec des chemins relatifs corrects dans le code.

---

## 8. Module 4 : Les Trois Transformers

C'est le cœur différenciateur de UIRat. Trois chemins de transformation traitent le même CIR pour produire des outputs radicalement différents.

### 8.1 Transformer Standard (sans IA)

Mapper déterministe rapide et gratuit. Traduit chaque propriété CSS en propriété Figma via des règles fixes.

#### 8.1.1 Règles de mapping CSS → Figma

| CSS | Figma | Notes |
|---|---|---|
| display: flex | layoutMode: HORIZONTAL/VERTICAL | Selon flexDirection |
| justify-content | primaryAxisAlignItems | Mapping direct |
| align-items | counterAxisAlignItems | Mapping direct |
| gap | itemSpacing | Pixels |
| padding | paddingLeft/Right/Top/Bottom | Individuel |
| background-color | fills[0] = Solid Paint | Conversion RGBA |
| border | strokes + strokeWeight | Complet |
| border-radius | cornerRadius | Support radius individuels |
| box-shadow | effects[] = DROP_SHADOW | Parsing composé |
| opacity | opacity (0-1) | Direct |
| overflow: hidden | clipsContent: true | Masquage |

#### 8.1.2 Limites du mode Standard

- Nommage générique (div-001, button-003)
- Pas de détection de composants répétés
- Auto-layout basique (flex simple uniquement)
- Pas de Design System généré

### 8.2 Transformer AI Design

Le mode AI Design prend le CIR brut et le passe par un pipeline de prompts LLM spécialisés pour produire un fichier Figma professionnel.

| Étape | Action IA | Résultat |
|---|---|---|
| 1. Sémantique | Renomme chaque nœud selon son rôle visuel | Header, Sidebar, CardProduct |
| 2. Composants | Détecte les patterns répétés | Master Components + Instances |
| 3. Nettoyage | Supprime wrappers vides, simplifie la hiérarchie | Arbre CIR allégé |
| 4. Design System | Extrait tokens (couleurs, typo, spacing) | Variables Figma + Styles |
| 5. Anonymisation | Remplace données privées par contenu fictif | CIR anonymisé (optionnel) |

### 8.3 Transformer AI Build (Reconstruction Frontend)

C'est la fonctionnalité qui distingue UIRat de tous les outils existants. Au lieu de simplement générer un fichier Figma statique, le mode AI Build reconstruit l'UI complète en code frontend fonctionnel dans un dossier de la machine locale de l'utilisateur, puis le lance automatiquement sur un serveur de développement.

#### 8.3.1 Principe de fonctionnement

Le Transformer AI Build prend le CIR enrichi et le transforme en un projet frontend structuré via un pipeline en 4 étapes :

1. **Analyse structurelle** : Le LLM analyse le CIR pour identifier les pages, les composants partagés (navbar, footer, sidebar), et la logique de navigation (routes).
2. **Scaffolding du projet** : UIRat crée l'arborescence complète du projet — fichiers de configuration, dossiers sources, dossiers assets.
3. **Génération du code** : Chaque page et composant est converti en fichier React ou HTML/CSS par le LLM. Les styles sont traduits en classes Tailwind CSS ou en CSS Modules.
4. **Démarrage automatique** : UIRat exécute l'installation des dépendances puis lance le serveur de développement. L'utilisateur voit immédiatement le résultat sur localhost:3000.

#### 8.3.2 Formats de sortie supportés

| Format | Stack générée | Serveur dev | Cas d'usage |
|---|---|---|---|
| React + Tailwind | Vite + React 18 + Tailwind CSS 3 | port 3000 | Développeurs, intégration dans un projet existant |
| React + CSS Modules | Vite + React 18 + CSS Modules | port 3000 | Préférence CSS pur, pas de framework CSS |
| HTML/CSS statique | Fichiers HTML + CSS + images | port 8080 (live-server) | Prototypage rapide, maquettes clients |
| Next.js (futur) | Next.js 14 + Tailwind + App Router | port 3000 | Sites avec routing complexe, SSR |

#### 8.3.3 Structure du projet généré (React + Tailwind)

Voici l'arborescence produite par UIRat AI Build pour une application à 5 pages :

- **uirat-output/** — Dossier racine du projet
  - **package.json** — Dépendances et scripts
  - **vite.config.js** — Configuration Vite
  - **tailwind.config.js** — Configuration Tailwind avec tokens extraits
  - **postcss.config.js** — Configuration PostCSS
  - **index.html** — Point d'entrée HTML
  - **public/** — Assets statiques
    - **assets/images/** — Images scrappées
    - **assets/fonts/** — Polices téléchargées
    - **assets/icons/** — SVGs extraits
    - **favicon.ico**
  - **src/** — Code source
    - **App.jsx** — Router principal
    - **main.jsx** — Point d'entrée React
    - **index.css** — Styles globaux + @font-face
    - **components/** — Composants partagés détectés automatiquement (Navbar, Footer, Sidebar, Button, ProductCard, etc.)
    - **pages/** — Pages de l'application (Dashboard, Settings, Profile, Products, Analytics, etc.)
    - **styles/tokens.css** — Design tokens extraits

#### 8.3.4 Pipeline de génération de code détaillé

Le LLM reçoit le CIR par morceaux (chunks) et génère le code composant par composant :

| Étape | Input LLM | Output | Stratégie |
|---|---|---|---|
| 1. Détection composants | CIR complet (résumé) | Liste des composants + pages | 1 appel, contexte global |
| 2. Tokens CSS | designTokens du CIR | Configuration Tailwind + tokens CSS | 1 appel, extraction |
| 3. Composants partagés | CIR des éléments répétés | Navbar, Button, etc. | 1 appel par composant |
| 4. Pages | CIR de chaque page | Dashboard, Settings, etc. | 1 appel par page |
| 5. Routing | Liste des routes | App.jsx avec React Router | 1 appel |
| 6. Config projet | Métadonnées | package.json, vite.config, etc. | Template (pas d'IA) |

#### 8.3.5 Qualité du code généré

Le code généré par le mode AI Build respecte les standards suivants :

- Composants fonctionnels React avec hooks (pas de classes)
- Tailwind CSS avec classes utilitaires propres (pas de style inline)
- Nommage sémantique des composants et des fichiers (PascalCase)
- Responsive de base (les breakpoints détectés sont traduits en classes Tailwind sm:/md:/lg:)
- Imports propres et tree-shakeable
- Commentaires explicatifs sur les sections clés
- Aucune donnée réelle dans le code (remplacement par du placeholder si anonymisation activée)

#### 8.3.6 Démarrage automatique du serveur

Une fois le projet généré, UIRat exécute automatiquement l'installation des dépendances dans le dossier du projet, puis démarre le serveur de développement Vite sur le port 3000 avec l'option d'ouverture automatique du navigateur. Le Hot Module Replacement est actif pour permettre des modifications en temps réel.

Pour les projets HTML/CSS statiques, UIRat utilise live-server sur le port 8080 à la place de Vite.

L'utilisateur voit immédiatement la reconstruction de l'UI dans son navigateur. Il peut ensuite modifier le code librement, ajouter de la logique métier, connecter des APIs, et déployer.

#### 8.3.7 Stratégie de chunking IA

Une application de 50 pages produit un CIR trop volumineux pour le contexte d'un LLM. Le Transformer découpe le CIR en chunks de 3000 tokens maximum, traite chaque composant/page indépendamment, puis assemble le projet final. La détection de composants partagés s'effectue en deux passes : une passe locale (par page) puis une passe globale (cross-pages) pour identifier les éléments communs comme les navbars et footers.

#### 8.3.8 Support multi-providers LLM

- **Claude Sonnet/Opus (Anthropic)** : Recommandé pour la qualité du code généré
- **GPT-4o (OpenAI)** : Bon compromis vitesse/qualité
- **Gemini 1.5 Pro (Google)** : Utile pour les très larges contextes (1M tokens)
- **Modèles locaux (Ollama/LM Studio)** : Pour la confidentialité, qualité inférieure

---

## 9. Module 5 : Figma Generator

Transforme le CIR final en objets Figma via deux canaux de distribution.

### 9.1 Canal A : Plugin Figma natif

Le plugin s'intègre directement dans Figma et crée les nœuds en temps réel. Son interface offre :

- Champ URL avec bouton de capture
- Options d'authentification (session import, token, identifiants)
- Toggle Standard / AI Design / AI Build
- Sélecteur de pages après découverte des routes
- Barre de progression en temps réel
- Prévisualisation avant insertion dans le canvas

### 9.2 Canal B : App Web standalone

L'application web permet de lancer des captures sans avoir Figma ouvert :

- Dashboard de gestion des captures (historique, re-scan, comparaison)
- Upload de fichiers state.json pour l'authentification
- Configuration avancée : viewport, pages à exclure, profondeur de crawl
- Export .fig, import direct via API REST Figma, ou dossier projet local (AI Build)
- Webhooks pour notification de fin de capture

### 9.3 Mapping CIR → Figma Nodes

| Type CIR | Node Figma | Détail |
|---|---|---|
| Container (div, section) | FRAME | Auto-layout si flex/grid |
| Text (p, h1-h6, span) | TEXT | TextStyle complet |
| Image (img, bg-image) | RECTANGLE + Image Fill | Asset en fill |
| SVG inline | VECTOR | Conversion SVG → Figma vectors |
| Input/Select | FRAME + TEXT | Simulé visuellement |
| Component (mode AI) | COMPONENT + INSTANCE | Master + instances |

---

## 10. Capture Responsive Multi-Viewport

Contrairement aux outils existants qui capturent un seul viewport, UIRat peut capturer l'application à plusieurs résolutions.

### 10.1 Breakpoints par défaut

| Nom | Viewport | Usage |
|---|---|---|
| Desktop | 1440 x 900 | Vue principale |
| Tablet | 768 x 1024 | Tablette portrait |
| Mobile | 375 x 812 | Smartphone (iPhone 13) |

### 10.2 Organisation dans Figma

Chaque page capturée est représentée par une Figma Page contenant trois frames côte à côte (Desktop, Tablet, Mobile), espacées de 200px. Le mode AI enrichit cet output en détectant les composants adaptatifs (ex: un menu hamburger qui remplace une barre de navigation).

### 10.3 Responsive dans AI Build

En mode AI Build, les breakpoints détectés sont automatiquement traduits en classes Tailwind responsive (sm:, md:, lg:). Le projet généré est donc responsive par défaut.

---

## 11. Sécurité et Confidentialité

### 11.1 Principes

- Les identifiants (email, password) ne sont JAMAIS persistés sur disque — mémoire uniquement
- Les fichiers state.json (cookies/tokens) sont chiffrés au repos (AES-256-GCM)
- Les captures CIR sont stockées localement par défaut — le cloud est opt-in
- Warning explicite avant tout envoi de données au LLM (modes AI)
- Option d'anonymisation (remplacement données privées par Lorem Ipsum) avant envoi au LLM
- Clés API stockées dans le keychain sécurisé de l'OS
- Le code généré (AI Build) reste 100% local, jamais uploadé

### 11.2 Considérations légales

L'utilisateur est responsable de s'assurer qu'il a le droit de capturer l'UI d'une application (propriétaire, employé, ou avec autorisation explicite). UIRat inclut un disclaimer au premier lancement et un champ de confirmation d'autorisation avant chaque capture d'application tierce. Le scraping d'applications sans autorisation peut violer les CGU des plateformes cibles.

---

## 12. Modèle Économique

### 13.1 Tiers de pricing

| Tier | Prix | Inclus |
|---|---|---|
| Free | 0$ | Mode Standard illimité, 1 viewport, 5 pages max, output Figma uniquement |
| Pro | 12$/mois | Mode Standard illimité + AI Design, 3 viewports, pages illimitées |
| Builder | 29$/mois | Tout Pro + AI Build (génération code + serveur local), crédits LLM inclus ou clé API perso |
| Enterprise | Sur devis | Self-hosted, API dédiée, support prioritaire, intégration CI/CD |

### 13.2 Coût IA par capture (app SaaS typique de 20 pages)

| Provider | Tokens estimés | Coût AI Design | Coût AI Build |
|---|---|---|---|
| Claude Sonnet 4 | ~150K in + ~50K out | ~0.50$ | ~1.20$ |
| GPT-4o | ~150K in + ~50K out | ~0.75$ | ~1.80$ |
| Gemini 1.5 Flash | ~150K in + ~50K out | ~0.10$ | ~0.25$ |
| Modèle local (Ollama) | N/A | 0$ | 0$ (qualité inférieure) |

---

## 13. Plan de Développement (Roadmap)

### 13.1 Phase 1 : PoC (Semaines 1-4)

**Objectif** : Capturer une seule page publique et la convertir en frame Figma.

1. Créer le DOM Serializer (script injecté produisant le CIR JSON d'une page)
2. Implanter le Transformer Standard (mapper CSS → Figma basique)
3. Créer un plugin Figma minimal lisant un CIR et générant les nodes
4. Tester sur 5 sites publics (landing pages simples)

### 13.2 Phase 2 : Crawler + Auth (Semaines 5-8)

**Objectif** : Naviguer dans une application complète avec authentification.

1. Intégrer Playwright Stealth
2. Implémenter les 3 méthodes d'authentification
3. Construire le Route Discovery engine
4. Ajouter l'Asset Collector

### 13.3 Phase 3 : Mode AI Design (Semaines 9-12)

**Objectif** : Ajouter l'intelligence sémantique au fichier Figma.

1. Intégrer Vercel AI SDK avec les prompts de nommage + composants
2. Implémenter le Design System auto-généré
3. Ajouter la capture multi-viewport
4. Construire l'App Web (React + Tailwind) avec dashboard

### 13.4 Phase 4 : Mode AI Build (Semaines 13-18)

**Objectif** : Générer du code frontend fonctionnel à partir du CIR.

1. Construire le scaffolder de projet (templates Vite + React + Tailwind)
2. Développer le pipeline LLM de génération de code (composants + pages + routing)
3. Intégrer le démarrage automatique du serveur de développement
4. Ajouter le support HTML/CSS statique (live-server)
5. Tester sur 20+ applications SaaS réelles

### 13.5 Phase 5 : Polish + Launch (Semaines 19-22)

- Tests de robustesse sur 50+ applications
- Optimisation performances (parallélisation, cache Redis)
- Documentation utilisateur et développeur
- Landing page + pricing + publication plugin Figma Community
- Beta privée avec 30 utilisateurs test

---

## 14. Risques et Mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Anti-bot agressif (Cloudflare, DataDome) | Élevé | Stealth plugin + mode session manuelle + délais |
| Captchas (reCAPTCHA, hCaptcha) | Élevé | Mode session (captcha résolu une fois manuellement) |
| CSS Grid complexe (subgrid) | Moyen | Fallback positionnement absolu dans Figma |
| Animations CSS/JS | Moyen | Capture état repos + screenshot de référence |
| Canvas/WebGL (cartes, graphiques) | Élevé | Screenshot rasterisé en remplacement |
| Coût LLM imprévisible | Moyen | Chunking intelligent + estimation pré-traitement + cap tokens |
| Qualité code AI Build | Moyen | Post-processing lint (ESLint + Prettier) + validation rendu |
| Dépendances Node.js pour AI Build | Faible | Installation automatisée + gestion d'erreurs |
| Changements API Figma | Moyen | Couche d'abstraction au-dessus de l'API brute |

---

## 15. Conclusion

UIRat se positionne comme le premier outil complet de reverse-engineering UI offrant trois niveaux de sortie : un fichier Figma basique (Standard), un fichier Figma professionnel avec Design System (AI Design), et un projet frontend fonctionnel exécutable localement (AI Build).

Le mode AI Build est le différenciateur majeur. Aucun outil sur le marché ne propose aujourd'hui de scraper une application web complète, de la reconstruire en code React/Tailwind propre, et de la lancer automatiquement sur un serveur de développement local. Cette capacité transforme UIRat d'un simple outil de design en un véritable outil de clonage d'expérience utilisateur.

La clé du succès technique reste le format CIR : tant que ce format intermédiaire est riche et bien structuré, les modules en amont (crawler) et en aval (Figma generator, code generator) peuvent évoluer indépendamment. C'est cette modularité qui garantit la pérennité et l'extensibilité du projet.

**Prochaine étape immédiate** : le PoC Phase 1 — un script de sérialisation DOM injecté dans une page publique, produisant un CIR JSON validé par un plugin Figma minimal.
