# API-REST-Node — Support Ticket API

Une API pour gérer des tickets de support, avec des comptes utilisateurs, une connexion sécurisée et des droits selon le rôle de chacun.

- Les clients créent des tickets et suivent leur avancement.
- L'équipe support traite les tickets et change leur statut.
- Les administrateurs gèrent les comptes. Il n'y a pas d'inscription publique : les comptes sont créés par le Super Admin, et chaque personne reçoit une invitation par email.

**Technologies :** Node.js, Express, TypeScript, PostgreSQL, Prisma, Zod, JWT, Argon2, Brevo.

---

## Sommaire

1. [Installation](#installation)
2. [Variables d'environnement](#variables-denvironnement)
3. [Premier lancement : créer le Super Admin](#premier-lancement--créer-le-super-admin)
4. [Les rôles](#les-rôles)
5. [Comment fonctionne la connexion](#comment-fonctionne-la-connexion)
6. [Les routes](#les-routes)
7. [Les erreurs](#les-erreurs)
8. [Sécurité](#sécurité)
9. [Base de données](#base-de-données)
10. [Déploiement](#déploiement)
11. [Tests automatisés](#tests-automatisés)
12. [Tester avec Insomnia](#tester-avec-insomnia)

---

## Installation

**Prérequis :** Node.js 22 ou plus, Docker Desktop.

```bash
git clone git@github.com:abidinetou-lgtm/API-REST-Node.git
cd API-REST-Node
npm install
```

Créer le fichier `.env` à partir du modèle, puis le compléter (voir la section suivante) :

```bash
cp .env.example .env
```

Démarrer la base de données et créer les tables :

```bash
docker compose up -d
npx prisma migrate dev
npx prisma generate
```

Lancer l'API :

```bash
npm run dev
```

L'API tourne sur `http://localhost:3000`. Pour vérifier : `GET /health` renvoie `{ "status": "ok" }`.

---

## Variables d'environnement

Toutes les variables sont vérifiées au démarrage. S'il en manque une ou si elle est invalide, l'API refuse de démarrer et indique laquelle.

| Variable | Description | Exemple |
|----------|-------------|---------|
| `NODE_ENV` | `development` ou `production` | `development` |
| `PORT` | Port de l'API | `3000` |
| `DATABASE_URL` | Adresse de la base PostgreSQL | `postgresql://postgres:postgres@localhost:5434/tickets` |
| `APP_URL` | Adresse du front-end, utilisée dans les liens des emails | `http://localhost:5173` |
| `CORS_ORIGIN` | Sites autorisés à appeler l'API, séparés par des virgules | `http://localhost:5173` |
| `JWT_ACCESS_SECRET` | Clé secrète qui signe les tokens (32 caractères minimum) | — |
| `ACCESS_TOKEN_TTL_MINUTES` | Durée de vie de l'access token | `15` |
| `REFRESH_TOKEN_TTL_DAYS` | Durée de vie du refresh token | `7` |
| `BREVO_API_KEY` | Clé API Brevo. Vide en développement : les emails s'affichent dans le terminal. Obligatoire en production. | `xkeysib-...` |
| `MAIL_FROM_EMAIL` | Adresse d'expédition des emails (vérifiée dans Brevo) | `no-reply@mondomaine.com` |
| `MAIL_FROM_NAME` | Nom de l'expéditeur | `Support Ticket` |
| `SUPER_ADMIN_EMAIL` | Email du Super Admin, utilisé par le script de création | `admin@mondomaine.com` |

Pour générer un `JWT_ACCESS_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Premier lancement : créer le Super Admin

Comme personne ne peut s'inscrire, le premier compte est créé par un script :

```bash
npm run seed:dev     # en développement
npm run seed         # en production (après npm run build)
```

Le script crée le Super Admin avec l'adresse `SUPER_ADMIN_EMAIL` et lui envoie une **invitation par email**. Il choisit ensuite lui-même son mot de passe. Aucun mot de passe n'est stocké dans la configuration.

Le script peut être relancé sans risque :

- si le Super Admin n'a pas encore accepté son invitation, une nouvelle invitation est envoyée ;
- s'il est déjà actif, le script ne fait rien.

---

## Les rôles

| Action | Super Admin | Admin | Agent | User |
|---|:---:|:---:|:---:|:---:|
| Créer un compte et envoyer l'invitation | ✅ | ❌ | ❌ | ❌ |
| Voir la liste des comptes | ✅ | ✅ | ❌ | ❌ |
| Désactiver / réactiver un compte | ✅ (Admin, Agent, User) | ✅ (Agent, User) | ❌ | ❌ |
| Créer un ticket | ✅ | ✅ | ✅ | ✅ |
| Voir les tickets | tous | tous | tous | les siens |
| Changer le statut d'un ticket | ✅ | ✅ | ✅ | ❌ |

- Il n'existe qu'un seul Super Admin. On ne peut pas en créer un autre par l'API, ni le désactiver.
- Personne ne peut désactiver son propre compte.

---

## Comment fonctionne la connexion

Après la connexion, l'API donne deux clés :

| | Access token | Refresh token |
|---|---|---|
| Rôle | Prouver son identité à chaque requête | Obtenir un nouvel access token |
| Durée | 15 minutes | 7 jours |
| Où il est envoyé | Dans le JSON de la réponse | Dans un cookie `httpOnly` |
| Comment l'utiliser | En-tête `Authorization: Bearer <token>` | Automatiquement par le navigateur, sur `/auth/refresh` |

**Côté front-end :**

- garder l'access token **en mémoire** (une variable), jamais dans `localStorage` ;
- appeler l'API avec `credentials: "include"` pour que le cookie soit envoyé ;
- quand une requête renvoie `401`, appeler `POST /auth/refresh` puis réessayer.

Le refresh token est dans un cookie `httpOnly` : le JavaScript de la page ne peut pas le lire, donc une faille XSS ne peut pas le voler.

À chaque rafraîchissement, l'ancien refresh token est remplacé par un nouveau (**rotation**). Si un ancien refresh token est réutilisé, l'API considère qu'il a été volé et ferme toutes les sessions de l'utilisateur.

---

## Les routes

Les routes marquées 🔒 demandent l'en-tête `Authorization: Bearer <accessToken>`.

### Authentification — `/auth`

| Méthode | Route | Body | Réponse |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `200` `{ accessToken, user }` + cookie |
| POST | `/auth/refresh` | — (cookie) | `200` `{ accessToken, user }` + nouveau cookie |
| POST | `/auth/logout` | — (cookie) | `204` |
| POST | `/auth/accept-invitation` | `{ token, password }` | `204` |
| POST | `/auth/forgot-password` | `{ email }` | `200`, toujours le même message |
| POST | `/auth/reset-password` | `{ token, password }` | `204` |
| GET | `/auth/me` 🔒 | — | `200` l'utilisateur connecté |

- Le mot de passe doit contenir entre 8 et 128 caractères.
- Le lien d'invitation est valable **48 heures**, le lien de réinitialisation **30 minutes**. Chaque lien ne fonctionne **qu'une seule fois**, et seul le dernier envoyé est valable.
- Après une réinitialisation du mot de passe, toutes les sessions ouvertes sont fermées.

Les liens reçus par email ont la forme `APP_URL/accept-invitation?token=...` et `APP_URL/reset-password?token=...`. La page du front-end récupère le `token` dans l'adresse et l'envoie à l'API avec le nouveau mot de passe.

### Utilisateurs — `/users` 🔒

| Méthode | Route | Accès | Body | Réponse |
|---|---|---|---|---|
| POST | `/users` | Super Admin | `{ email, name, role }` | `201` `{ user, invitationSent }` |
| GET | `/users` | Super Admin, Admin | — | `200` `{ data, meta }` |
| GET | `/users/:id` | Super Admin, Admin | — | `200` l'utilisateur |
| POST | `/users/:id/resend-invitation` | Super Admin | — | `204` |
| PATCH | `/users/:id/disable` | Super Admin, Admin | — | `200` l'utilisateur |
| PATCH | `/users/:id/enable` | Super Admin, Admin | — | `200` l'utilisateur |
| PATCH | `/users/:id/role` | Super Admin | `{ role }` | `200` l'utilisateur |

- `role` vaut `ADMIN`, `AGENT` ou `USER`. Personne ne peut devenir Super Admin par l'API, ni changer son propre rôle.
- Un changement de rôle s'applique tout de suite, sans que la personne ait à se reconnecter.
- Chaque utilisateur a un `status` : `PENDING` (invitation pas encore acceptée), `ACTIVE` ou `DISABLED`.
- Si l'email d'invitation n'a pas pu partir, le compte est quand même créé avec `invitationSent: false`, et l'invitation peut être renvoyée.
- Un compte désactivé est bloqué immédiatement, même si son access token n'a pas expiré.
- Filtres de `GET /users` : `role` (une ou plusieurs valeurs séparées par des virgules), `status` (`PENDING`, `ACTIVE`, `DISABLED`), `search` (nom ou email). Tri avec `sort` : `createdAt`, `name` ou `email`.

### Audit logs — `/audit-logs` 🔒

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/audit-logs` | Super Admin | `200` `{ data, meta }` |

Chaque action sensible est enregistrée : qui l'a faite, sur quoi, quand, depuis quelle adresse IP, avec l'identifiant de la requête.

| Action | Déclenchée par |
|---|---|
| `USER_CREATED` | Création d'un compte (ou du Super Admin par le seed) |
| `USER_ROLE_CHANGED` | Changement de rôle, avec l'ancien et le nouveau |
| `USER_DISABLED`, `USER_ENABLED` | Désactivation, réactivation |
| `INVITATION_RESENT`, `INVITATION_ACCEPTED` | Invitation renvoyée, acceptée |
| `PASSWORD_RESET` | Mot de passe réinitialisé |
| `REFRESH_TOKEN_REUSED` | Un refresh token déjà utilisé a été présenté : probable vol, toutes les sessions sont fermées |
| `TICKET_STATUS_CHANGED` | Changement de statut d'un ticket, avec l'ancien et le nouveau |

- Le log est écrit dans la même transaction que l'action : une action refusée ou en échec ne laisse pas de trace, et une action réussie a toujours son log.
- Les logs ne peuvent être ni modifiés ni supprimés : la base de données le refuse, même si le code essayait.
- Filtres : `action` (une ou plusieurs), `actorId`, `targetType` (`USER`, `TICKET`), `targetId`, `from`, `to`, plus la pagination.

Exemple : `GET /audit-logs?targetId=0193a2f1-...` donne l'historique complet d'un utilisateur.

### Tickets — `/tickets` 🔒

| Méthode | Route | Accès | Body | Réponse |
|---|---|---|---|---|
| POST | `/tickets` | Tous | `{ title, description }` | `201` le ticket |
| GET | `/tickets` | Tous | — | `200` `{ data, meta }` |
| GET | `/tickets/:id` | Tous | — | `200` le ticket |
| PATCH | `/tickets/:id/status` | Super Admin, Admin, Agent | `{ status }` | `200` le ticket |

- `title` : entre 3 et 100 caractères. `description` : entre 10 et 2000 caractères.
- `status` vaut `OPEN`, `IN_PROGRESS`, `RESOLVED` ou `CLOSED`. Un ticket est `OPEN` à sa création.
- Un User ne voit que ses tickets. S'il demande le ticket de quelqu'un d'autre, il reçoit `404`.

### Pagination, filtres et tri

Les listes (`GET /tickets`, `GET /users`) acceptent ces paramètres dans l'URL :

| Paramètre | Valeur par défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de la page |
| `limit` | `20` | Éléments par page, 100 maximum |
| `sort` | `createdAt` | Champ de tri |
| `order` | `desc` | `asc` ou `desc` |

Filtres de `GET /tickets` :

| Paramètre | Exemple | Description |
|---|---|---|
| `status` | `OPEN,IN_PROGRESS` | Un ou plusieurs statuts |
| `search` | `imprimante` | Cherche dans le titre et la description, sans tenir compte des majuscules |
| `createdById` | `0193a2f1-...` | Tickets d'un utilisateur |
| `createdFrom`, `createdTo` | `2026-10-01` | Période de création |

Tri possible sur `createdAt`, `updatedAt`, `title` ou `status`. Un User reste limité à ses propres tickets, quels que soient les filtres.

Exemple : `GET /tickets?status=OPEN,IN_PROGRESS&search=imprimante&sort=createdAt&order=desc&page=2&limit=10`

```json
{
  "data": [ { "id": "...", "title": "..." } ],
  "meta": { "page": 2, "limit": 10, "total": 34, "totalPages": 4 }
}
```

Un paramètre invalide (`limit=1000`, `sort=password`, statut inconnu...) renvoie `400`.

Exemple de ticket :

```json
{
  "id": "0193a2f4-7c1e-7b3a-9f2d-4e8c1a6b5d70",
  "title": "Impossible de se connecter",
  "description": "Le bouton de connexion ne répond pas.",
  "status": "OPEN",
  "createdAt": "2026-10-29T10:40:24.499Z",
  "updatedAt": "2026-10-29T10:40:24.499Z",
  "createdBy": { "id": "0193a2f1-2b4d-7e6f-8a1c-3d5e7f9b1c2d", "name": "Paul Martin", "email": "paul@exemple.com" }
}
```

---

## Les erreurs

Toutes les erreurs ont la même forme :

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "details": [
      { "field": "password", "message": "Password must contain at least 8 characters" }
    ],
    "requestId": "7f3c2a1e-5b9d-4c8e-a2f1-0d6e4b8c9a7f"
  }
}
```

- `code` ne change jamais : c'est lui que le front-end doit tester. `message` est fait pour être lu et peut évoluer.
- `details` n'apparaît que pour les erreurs de validation.
- `requestId` est aussi renvoyé dans l'en-tête `X-Request-Id` de chaque réponse. Pour une erreur 500, il est écrit dans les logs du serveur : il suffit de le chercher pour retrouver l'erreur.

| Statut | Codes |
|------|---------------|
| 400 | `VALIDATION_FAILED`, `INVALID_JSON`, `INVALID_TOKEN` (lien expiré ou déjà utilisé), `CANNOT_MANAGE_OWN_ACCOUNT` |
| 401 | `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` |
| 403 | `FORBIDDEN` (rôle insuffisant), `ACCOUNT_DISABLED` |
| 404 | `TICKET_NOT_FOUND`, `USER_NOT_FOUND`, `ROUTE_NOT_FOUND`, `NOT_FOUND` |
| 409 | `EMAIL_ALREADY_IN_USE`, `INVITATION_ALREADY_ACCEPTED`, `ACCOUNT_DISABLED`, `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 429 | `TOO_MANY_REQUESTS` |
| 500 | `INTERNAL_ERROR` (le détail n'est jamais envoyé au client) |

Les réponses réussies renvoient directement la ressource (`GET /tickets/:id` renvoie le ticket), et les listes renvoient `{ data, meta }`.

---

## Sécurité

- **Mots de passe** hachés avec Argon2id, jamais stockés en clair.
- **Tokens** (refresh, invitation, réinitialisation) stockés hachés en base : une fuite de la base ne permet pas de les utiliser.
- **Liens à usage unique**, avec une durée de validité limitée.
- **Refresh token** dans un cookie `httpOnly`, `Secure` et `SameSite` en production, avec rotation et détection de réutilisation.
- **Pas de fuite d'information** : le login et la demande de réinitialisation répondent de la même façon, et dans le même temps, que le compte existe ou non.
- **Limitation des requêtes** : 300 requêtes par 15 minutes au total ; sur l'invitation et la réinitialisation, 10 essais par 15 minutes.
- **Protection contre le brute-force sur le login**, avec deux limites qui ne comptent que les échecs :
  - **par adresse IP** : 10 échecs par 15 minutes, contre quelqu'un qui essaie beaucoup de comptes ;
  - **par compte** : 5 échecs par 15 minutes, contre quelqu'un qui change d'adresse IP pour viser un seul compte. L'email est normalisé avant d'être compté, donc `Paul@Example.com` et `paul@example.com` comptent pour le même compte.
- **En-têtes HTTP** sécurisés avec Helmet, **CORS** limité au front-end autorisé, body limité à 10 ko.
- **Validation** de toutes les entrées avec Zod.
- **Identifiants non devinables** : les utilisateurs et les tickets ont un UUID v7 (`/tickets/0193a2f4-7c1e-...`) au lieu de 1, 2, 3. On ne peut pas parcourir les ressources en changeant le numéro dans l'URL, ni deviner le volume d'activité. Le v7 commence par la date, ce qui garde l'index de la base rapide.
- Les erreurs internes ne sont jamais renvoyées au client.

---

## Base de données

```mermaid
erDiagram
  User ||--o{ Ticket : "crée"
  User ||--o{ RefreshToken : "possède"
  User ||--o{ UserToken : "reçoit"
  User |o--o{ AuditLog : "agit"

  User {
    uuid id PK
    string email UK
    string name
    Role role "SUPER_ADMIN, ADMIN, AGENT, USER"
    string passwordHash "vide tant que l'invitation n'est pas acceptée"
    boolean isActive
    datetime createdAt
    datetime updatedAt
  }

  Ticket {
    uuid id PK
    string title
    string description
    TicketStatus status "OPEN, IN_PROGRESS, RESOLVED, CLOSED"
    uuid createdById FK
    datetime createdAt
    datetime updatedAt
  }

  RefreshToken {
    int id PK
    string tokenHash UK
    uuid userId FK
    datetime expiresAt
    datetime revokedAt "rempli quand la session est fermée"
    datetime createdAt
  }

  UserToken {
    int id PK
    string tokenHash UK
    TokenType type "INVITATION, PASSWORD_RESET"
    uuid userId FK
    datetime expiresAt
    datetime usedAt "rempli quand le lien a servi"
    datetime createdAt
  }

  AuditLog {
    uuid id PK
    AuditAction action
    uuid actorId FK "vide si l'action ne vient pas d'un utilisateur"
    AuditTargetType targetType "USER, TICKET"
    uuid targetId
    json metadata "par exemple l'ancien et le nouveau rôle"
    string ipAddress
    string requestId
    datetime createdAt
  }
```

Le schéma est aussi disponible au format DBML dans [`docs/database.dbml`](docs/database.dbml). Pour le visualiser, copier son contenu sur [dbdiagram.io](https://dbdiagram.io).

Pour consulter les données : `npx prisma studio`, ou un client comme DBeaver avec l'hôte `localhost`, le port `5434`, la base `tickets`, l'utilisateur `postgres` et le mot de passe `postgres`.

---

## Déploiement

L'API se déploie sur n'importe quel hébergeur Node.js (Render, Railway, Fly.io, un VPS...) avec une base PostgreSQL.

1. Créer une base PostgreSQL et récupérer son adresse de connexion.
2. Renseigner les variables d'environnement chez l'hébergeur (voir le tableau plus haut), avec `NODE_ENV=production`. Le fichier `.env` n'est pas utilisé en production.
3. Configurer les commandes :

| Étape | Commande |
|---|---|
| Installation | `npm ci --include=dev` (TypeScript et Prisma sont nécessaires au build) |
| Build | `npm run build` |
| Avant chaque démarrage | `npm run db:deploy` |
| Démarrage | `npm start` |

4. Au premier déploiement uniquement, lancer `npm run seed` pour créer le Super Admin.

**Emails en production :** il faut un nom de domaine authentifié dans Brevo (enregistrements DNS DKIM et DMARC). Sans cela, les emails envoyés depuis une adresse Gmail risquent d'arriver dans les spams.

**Front-end sur un autre domaine :** mettre son adresse dans `CORS_ORIGIN` et `APP_URL`. L'API doit être servie en HTTPS pour que le cookie du refresh token fonctionne.

---

## Tests automatisés

Il y a deux sortes de tests :

| Dossier | Ce qui est testé | Base de données |
|---|---|---|
| `tests/unit/` | Les fonctions seules : tokens, mots de passe, emails, règles des rôles, schémas Zod, pagination, middlewares | Non, quelques secondes |
| `tests/integration/` | L'API complète par des requêtes HTTP : connexion, sessions, invitations, droits de chaque rôle, tickets, pagination, audit logs, limites de requêtes, injection SQL | Oui |

Les tests d'intégration utilisent une base séparée, `tickets_test`, vidée avant chaque test. Les données de développement ne sont jamais touchées et aucun email n'est envoyé.

Créer la base de test une seule fois :

```bash
docker exec tickets-db psql -U postgres -c "CREATE DATABASE tickets_test;"
```

Lancer les tests :

```bash
npm test                   # tous les tests
npm run test:unit          # seulement les tests unitaires, sans base de données
npm run test:integration   # seulement les tests d'intégration
npm run test:watch         # en continu, pendant le développement
```

Les tests tournent aussi automatiquement sur GitHub (GitHub Actions) à chaque push sur `main` ou `develop` et à chaque Pull Request.

---

## Tester avec Insomnia

1. Lancer l'API avec `npm run dev`.
2. Créer un environnement avec `base_url` = `http://localhost:3000` et `token` = vide.
3. Se connecter avec `POST {{ base_url }}/auth/login`, copier l'`accessToken` dans la variable `token`.
4. Dans l'onglet **Auth** des requêtes protégées, choisir **Bearer Token** et mettre `{{ token }}`.
5. Insomnia garde le cookie du refresh token : `POST {{ base_url }}/auth/refresh` fonctionne sans rien ajouter.

En développement, sans `BREVO_API_KEY`, les emails (invitation, réinitialisation) s'affichent dans le terminal de l'API avec leur lien.

---

## Commandes utiles

| Commande | Rôle |
|----------|------|
| `npm run dev` | Lance l'API en développement, avec rechargement automatique |
| `npm run build` | Génère le client Prisma et compile le projet dans `dist/` |
| `npm start` | Lance la version compilée |
| `npm run db:deploy` | Applique les migrations (production) |
| `npm run seed:dev` / `npm run seed` | Crée le Super Admin |
| `npm test` | Lance les tests automatisés |
| `docker compose up -d` | Démarre la base de données locale |
| `docker compose stop` | Arrête la base de données locale |
| `npx prisma studio` | Ouvre une interface pour consulter la base |

---

## Auteur

**Jimel Abidine Toure**
