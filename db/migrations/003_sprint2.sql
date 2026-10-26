-- =============================================================
-- MedLink — Sprint 2 : MFA, sessions, disponibilités, créneaux
-- et rendez-vous (modèle logique de données du Sprint 2).
--
-- Nouvelle base : exécuté automatiquement après 001 et 002.
-- Base existante (PC de dev déjà initialisé, serveur) :
--   docker compose exec -T db psql -U medlink -d medlink -v ON_ERROR_STOP=1 < db/migrations/003_sprint2.sql
-- =============================================================

-- US-34 : codes de secours MFA, stockés comme les autres jetons (empreinte SHA-256, usage unique)
ALTER TYPE type_jeton ADD VALUE IF NOT EXISTS 'code_secours';

-- US-17 / US-34 : second facteur TOTP ; le secret est chiffré en AES-256-GCM (US-43)
ALTER TABLE utilisateurs
  ADD COLUMN mfa_active         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mfa_secret_chiffre BYTEA;

CREATE TYPE statut_creneau AS ENUM ('libre', 'reserve', 'bloque');
CREATE TYPE statut_rdv     AS ENUM ('planifie', 'reporte', 'annule', 'honore', 'manque');
CREATE TYPE origine_rdv    AS ENUM ('en_ligne', 'accueil');

-- US-40 : une ligne par connexion ; le jeton de rafraîchissement n'est stocké que haché
CREATE TABLE sessions (
  id_session        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_utilisateur    UUID        NOT NULL REFERENCES utilisateurs ON DELETE CASCADE,
  refresh_hash      CHAR(64)    NOT NULL UNIQUE,
  derniere_activite TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le         TIMESTAMPTZ NOT NULL,            -- durée maximale d'une session
  revoquee          BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX idx_sessions_utilisateur ON sessions (id_utilisateur);

-- Cliniques dans lesquelles un praticien exerce (affectées par le back-office)
CREATE TABLE praticien_clinique (
  id_praticien UUID NOT NULL REFERENCES praticiens ON DELETE CASCADE,
  id_clinique  UUID NOT NULL REFERENCES cliniques,
  PRIMARY KEY (id_praticien, id_clinique)
);

-- US-18 : plage hebdomadaire, ex. « mercredi 08:30-12:30 à Sfax, créneaux de 30 min »
CREATE TABLE plages_disponibilite (
  id_plage      UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  id_praticien  UUID     NOT NULL,
  id_clinique   UUID     NOT NULL,
  jour_semaine  SMALLINT NOT NULL CHECK (jour_semaine BETWEEN 1 AND 7),   -- 1 = lundi (ISO)
  heure_debut   TIME     NOT NULL,
  heure_fin     TIME     NOT NULL,
  duree_creneau SMALLINT NOT NULL CHECK (duree_creneau IN (15, 20, 30, 45, 60)),  -- minutes
  date_debut    DATE     NOT NULL,
  date_fin      DATE     NOT NULL,
  CHECK (heure_fin > heure_debut),
  CHECK (date_fin >= date_debut),
  -- un praticien ne publie que dans une clinique où il est affecté
  FOREIGN KEY (id_praticien, id_clinique) REFERENCES praticien_clinique ON DELETE CASCADE
);
CREATE INDEX idx_plages_praticien ON plages_disponibilite (id_praticien, jour_semaine);

-- US-18 / US-06 : créneaux générés à partir des plages
CREATE TABLE creneaux (
  id_creneau UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  id_plage   UUID           NOT NULL REFERENCES plages_disponibilite ON DELETE CASCADE,
  debut      TIMESTAMPTZ    NOT NULL,
  fin        TIMESTAMPTZ    NOT NULL,
  statut     statut_creneau NOT NULL DEFAULT 'libre',
  CHECK (fin > debut)
);
CREATE INDEX idx_creneaux_plage_debut ON creneaux (id_plage, debut);

-- US-07 : rendez-vous ; le motif est chiffré en AES-256-GCM (US-43)
CREATE TABLE rendez_vous (
  id_rdv        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_patient    UUID        NOT NULL REFERENCES patients,
  id_creneau    UUID        NOT NULL REFERENCES creneaux,
  motif_chiffre BYTEA,
  statut        statut_rdv  NOT NULL DEFAULT 'planifie',
  origine       origine_rdv NOT NULL DEFAULT 'en_ligne',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- un seul rendez-vous actif par créneau (dernier rempart contre la double réservation)
CREATE UNIQUE INDEX uq_rdv_creneau_actif ON rendez_vous (id_creneau) WHERE statut IN ('planifie', 'reporte');
CREATE INDEX idx_rdv_patient ON rendez_vous (id_patient);
